<?php

namespace App\Services;

use App\Exceptions\GemPurchaseRejectedException;
use App\Http\Controllers\AuthController;
use App\Models\Account;
use App\Models\GemOrder;
use App\Services\Stripe\StripeGateway;
use App\Services\Stripe\StripeGatewayException;
use App\Support\GemPackCatalog;
use App\Support\GemCheckoutConfig;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Player side of the gem shop demo: creates the order and its Stripe Checkout Session (test mode only, test cards,
 * no real money), and reads an order back.
 *
 * The browser only picks a pack: account, gems, amount, currency and return URLs are decided here. The order row
 * is committed first and the Stripe call made afterwards, outside any transaction, with an idempotency key tied
 * to the order: a double click, a network retry or a second tab gets the same order and the same session.
 */
final class GemCheckoutService
{
    /** A pending order for the same pack is handed back instead of a new one during this time. */
    private const REUSE_MINUTES = 20;

    /** Checkout Session lifetime (Stripe accepts 30 min to 24 h; REUSE_MINUTES must leave at least 30). */
    private const SESSION_LIFETIME_MINUTES = 60;

    /** Open orders a player may have at once. */
    private const MAX_PENDING_ORDERS = 5;

    /** Seconds between two Stripe lookups of the same order while the player waits on the return page. */
    private const STATUS_REFRESH_SECONDS = 3;

    public function __construct(
        private readonly GemCheckoutConfig $config,
        private readonly StripeGateway $stripe,
        private readonly GemOrderFulfillmentService $fulfillment,
    ) {}

    /** @return array{order: GemOrder, checkout_url: string, reused: bool} */
    public function start(Account $account, string $packCode, string $locale): array
    {
        if (! $this->config->checkoutOpen()) {
            throw new GemPurchaseRejectedException('gems_unavailable', 'The gem shop demo is not available right now.', 503);
        }
        $pack = GemPackCatalog::find($packCode);
        if ($pack === null) {
            throw new GemPurchaseRejectedException('invalid_pack', 'This gem pack does not exist.', 422);
        }
        if ($account->terms_version !== AuthController::TERMS_VERSION) {
            throw new GemPurchaseRejectedException('terms_outdated', 'Accept the current terms before buying.', 409);
        }

        $accountId = (int) $account->getAuthIdentifier();

        $order = DB::transaction(function () use ($accountId, $pack, $locale, $account): GemOrder {
            // one order creation at a time per player: the second click waits here, then reuses the first order
            Account::query()->whereKey($accountId)->lockForUpdate()->first();

            $reusable = GemOrder::query()
                ->where('account_id', $accountId)
                ->where('pack_code', $pack['code'])
                ->whereIn('status', [GemOrder::STATUS_CREATING, GemOrder::STATUS_OPEN])
                ->where('created_at', '>=', now()->subMinutes(self::REUSE_MINUTES))
                ->latest('id')
                ->first();
            if ($reusable !== null) {
                return $reusable;
            }

            $pending = GemOrder::query()
                ->where('account_id', $accountId)
                ->whereIn('status', GemOrder::PENDING_STATUSES)
                ->where('created_at', '>=', now()->subMinutes(self::SESSION_LIFETIME_MINUTES))
                ->count();
            if ($pending >= self::MAX_PENDING_ORDERS) {
                throw new GemPurchaseRejectedException('too_many_pending_orders', 'You already have several payments in progress. Finish or wait for them first.', 429);
            }

            $publicId = (string) Str::uuid();
            $now = now();

            return GemOrder::query()->create([
                'public_id' => $publicId,
                'account_id' => $accountId,
                'pack_code' => $pack['code'],
                'gems' => $pack['gems'],
                'amount_cents' => $pack['amount_cents'],
                'currency' => $pack['currency'],
                // Stripe test mode only: every order is a demo order
                'livemode' => false,
                'status' => GemOrder::STATUS_CREATING,
                'locale' => $locale,
                'idempotency_key' => "gem-order-{$publicId}",
                'checkout_expires_at' => $now->copy()->addMinutes(self::SESSION_LIFETIME_MINUTES),
                'terms_version' => (string) $account->terms_version,
            ])->refresh();
        });

        if ($order->status === GemOrder::STATUS_OPEN && $order->checkout_url !== null) {
            return ['order' => $order, 'checkout_url' => $order->checkout_url, 'reused' => true];
        }

        // a `creating` order handed back is the retry of an earlier click (its Stripe call had failed)
        return ['reused' => ! $order->wasRecentlyCreated] + $this->createSession($order);
    }

    /** @return array{order: GemOrder, checkout_url: string} */
    private function createSession(GemOrder $order): array
    {
        try {
            $session = $this->stripe->createCheckoutSession($this->sessionParams($order), $order->idempotency_key);
        } catch (StripeGatewayException $e) {
            Log::warning('Stripe Checkout Session not created', ['order' => (string) $order->public_id, 'error' => $e->getMessage()]);
            // Stripe answered: it replays that answer for this key, so the order is closed and the next click starts
            // a new one. Network failure: the order stays `creating` and the next click retries with the same key.
            GemOrder::query()->whereKey($order->id)->where('status', GemOrder::STATUS_CREATING)->update($e->stripeAnswered
                ? ['status' => GemOrder::STATUS_CANCELED, 'canceled_at' => now(), 'last_error' => 'stripe_rejected']
                : ['last_error' => 'stripe_unreachable']);

            throw new GemPurchaseRejectedException('payment_provider_unavailable', 'The payment service is unavailable. Try again in a moment.', 502);
        }

        $sessionId = (string) ($session['id'] ?? '');
        $url = (string) ($session['url'] ?? '');

        $order = DB::transaction(function () use ($order, $sessionId, $url): GemOrder {
            /** @var GemOrder $locked */
            $locked = GemOrder::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            // a webhook may have been faster and already recorded the session (or even the payment)
            $locked->stripe_checkout_session_id ??= $sessionId;
            if ($locked->status === GemOrder::STATUS_CREATING) {
                $locked->status = GemOrder::STATUS_OPEN;
            }
            if ($locked->status === GemOrder::STATUS_OPEN) {
                $locked->checkout_url = $url;
                $locked->last_error = null;
            }
            $locked->save();

            return $locked;
        });

        return ['order' => $order, 'checkout_url' => $url];
    }

    /** @return array<string, mixed> Same order, same parameters: required by Stripe idempotent replays. */
    private function sessionParams(GemOrder $order): array
    {
        $front = $this->config->frontendUrl();
        $return = "{$front}/gems/return?order={$order->public_id}";
        $name = $order->locale === 'fr'
            ? number_format($order->gems, 0, ',', ' ').' gems violets — CampusCove'
            : number_format($order->gems).' purple gems — CampusCove';

        // nothing about the player is sent to Stripe (no e-mail, no name): the order reference is enough
        return [
            'mode' => 'payment',
            'client_reference_id' => (string) $order->public_id,
            'metadata' => ['gem_order' => (string) $order->public_id, 'demo' => 'true'],
            'payment_intent_data' => [
                'metadata' => ['gem_order' => (string) $order->public_id, 'demo' => 'true'],
                'description' => "CampusCove demo {$order->pack_code}",
            ],
            'line_items' => [[
                'quantity' => 1,
                'price_data' => [
                    'currency' => $order->currency,
                    'unit_amount' => $order->amount_cents,
                    'product_data' => ['name' => $name, 'metadata' => ['pack' => $order->pack_code]],
                ],
            ]],
            // cards only; Apple Pay / Google Pay are card wallets that Checkout shows (also in test mode) when the
            // Stripe account enables them and the device supports them
            'payment_method_types' => ['card'],
            'submit_type' => 'pay',
            'locale' => $order->locale,
            'expires_at' => $order->checkout_expires_at->getTimestamp(),
            'success_url' => "{$return}&result=success",
            'cancel_url' => "{$return}&result=cancel",
            'custom_text' => [
                'submit' => ['message' => $order->locale === 'fr'
                    ? 'Paiement de démonstration — aucun argent débité. Utilise une carte de test Stripe.'
                    : 'Demo payment — no money is charged. Use a Stripe test card.'],
            ],
        ];
    }

    public function findForAccount(Account $account, string $publicId): GemOrder
    {
        $order = Str::isUuid($publicId)
            ? GemOrder::query()->where('public_id', $publicId)->where('account_id', $account->getAuthIdentifier())->first()
            : null;
        if ($order === null) {
            throw new GemPurchaseRejectedException('order_not_found', 'Order not found.', 404);
        }

        return $order;
    }

    /**
     * Order status for the return page. While it is still pending, asks Stripe directly (at most every few
     * seconds): the webhook stays the main path, this only covers a webhook that is late or lost.
     */
    public function statusFor(Account $account, string $publicId): GemOrder
    {
        $order = $this->findForAccount($account, $publicId);
        $due = $order->stripe_checked_at === null || $order->stripe_checked_at->lt(now()->subSeconds(self::STATUS_REFRESH_SECONDS));
        if (! $order->isPending() || $order->stripe_checkout_session_id === null || ! $due || ! $this->config->canTalkToStripe()) {
            return $order;
        }

        GemOrder::query()->whereKey($order->id)->update(['stripe_checked_at' => now()]);
        try {
            return $this->fulfillment->refreshCheckout($order);
        } catch (StripeGatewayException $e) {
            Log::info('Gem order status: Stripe lookup failed', ['order' => (string) $order->public_id, 'error' => $e->getMessage()]);

            return $order->refresh();
        }
    }
}
