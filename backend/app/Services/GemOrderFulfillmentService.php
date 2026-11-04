<?php

namespace App\Services;

use App\Models\GemOrder;
use App\Services\Stripe\StripeGateway;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Applies what Stripe says about an order: payment confirmed -> gems credited once, expired / failed, refunds and
 * disputes -> gems taken back (or given back) by the difference with what is already counted.
 *
 * Always from a state fetched from the Stripe API, never from the browser nor from the webhook body alone, so
 * repeated, concurrent or out-of-order events converge on the same result. Network calls happen before the
 * transaction; inside it the gem_orders row is locked (then the wallet, in that order) and effects are idempotent.
 * Callers: StripeWebhookService, GemCheckoutService (status polling) and `gems:reconcile`.
 */
final class GemOrderFulfillmentService
{
    public function __construct(
        private readonly StripeGateway $stripe,
        private readonly PremiumGemLedgerService $ledger,
        private readonly GemOrderNotifier $notifier,
    ) {}

    /** The local order a Checkout Session belongs to, without calling Stripe; null for a session that is not ours. */
    public function findOrderForSession(array $session): ?GemOrder
    {
        $sessionId = $session['id'] ?? null;
        if (is_string($sessionId) && $sessionId !== '') {
            $order = GemOrder::query()->where('stripe_checkout_session_id', $sessionId)->first();
            if ($order !== null) {
                return $order;
            }
        }

        // the session id may not be saved yet (Stripe answered, then the request died): the reference is ours
        $reference = $session['client_reference_id'] ?? ($session['metadata']['gem_order'] ?? null);

        return is_string($reference) && Str::isUuid($reference)
            ? GemOrder::query()->where('public_id', $reference)->first()
            : null;
    }

    /** Fetches the session from Stripe and applies it. */
    public function refreshCheckout(GemOrder $order): GemOrder
    {
        if ($order->stripe_checkout_session_id === null) {
            return $order;
        }

        return $this->applyCheckoutSession($this->stripe->retrieveCheckoutSession($order->stripe_checkout_session_id)) ?? $order;
    }

    /**
     * Applies a Checkout Session retrieved from Stripe (payment_intent expanded). Returns null when the session is
     * not one of ours.
     *
     * @param  array<string, mixed>  $session
     */
    public function applyCheckoutSession(array $session): ?GemOrder
    {
        $found = $this->findOrderForSession($session);
        if ($found === null) {
            return null;
        }

        $paymentIntent = is_array($session['payment_intent'] ?? null) ? $session['payment_intent'] : null;
        $paymentIntentId = $paymentIntent['id'] ?? (is_string($session['payment_intent'] ?? null) ? $session['payment_intent'] : null);
        $outcome = $this->checkoutOutcome($session, $paymentIntent);

        return DB::transaction(function () use ($found, $session, $paymentIntent, $paymentIntentId, $outcome): GemOrder {
            /** @var GemOrder $order */
            $order = GemOrder::query()->whereKey($found->id)->lockForUpdate()->firstOrFail();

            $mismatch = $this->mismatch($order, $session, $paymentIntent, $outcome);
            if ($mismatch !== null) {
                Log::error('Gem order does not match its Stripe payment, not delivered', [
                    'order' => (string) $order->public_id,
                    'session' => $session['id'] ?? null,
                    'reason' => $mismatch,
                ]);
                $order->update(['last_error' => $mismatch, 'stripe_checked_at' => now()]);

                return $order;
            }

            $order->stripe_checked_at = now();
            $order->stripe_checkout_session_id ??= (string) $session['id'];
            if (is_string($paymentIntentId) && $order->stripe_payment_intent_id === null) {
                $order->stripe_payment_intent_id = $paymentIntentId;
            }

            $justDelivered = false;
            if ($outcome === 'paid') {
                // a confirmed payment wins over any other status (expired, canceled...): the money was taken
                if (! $order->isDelivered()) {
                    $order->delivery_tx_id = $this->ledger->creditOrder($order);
                    $order->delivered_at = now();
                    $justDelivered = true;
                }
                $order->status = GemOrder::STATUS_PAID;
                $order->paid_at ??= now();
                $order->checkout_url = null;
                $order->last_error = null;
            } elseif ($order->isPending()) {
                match ($outcome) {
                    'processing' => $order->status = GemOrder::STATUS_PROCESSING,
                    'failed' => $order->fill(['status' => GemOrder::STATUS_FAILED, 'failed_at' => now(), 'checkout_url' => null]),
                    'expired' => $order->fill(['status' => GemOrder::STATUS_EXPIRED, 'expired_at' => now(), 'checkout_url' => null]),
                    default => $order->status === GemOrder::STATUS_CREATING ? $order->status = GemOrder::STATUS_OPEN : null,
                };
            }

            // refunds recorded before the delivery (refund events can arrive first) apply as soon as it happens
            if ($justDelivered) {
                $this->applyReversal($order, 'refund_before_delivery');
            }
            $order->save();

            if ($justDelivered) {
                $orderId = (int) $order->id;
                DB::afterCommit(fn () => $this->notifier->sendPurchaseConfirmation($orderId));
            }

            return $order;
        });
    }

    /**
     * Our order for a PaymentIntent (refund and dispute events only carry the payment). Falls back to the
     * PaymentIntent metadata when the checkout event was not handled yet, and handles it first.
     */
    public function findOrderForPaymentIntent(string $paymentIntentId): ?GemOrder
    {
        $order = GemOrder::query()->where('stripe_payment_intent_id', $paymentIntentId)->first();
        if ($order !== null) {
            return $order;
        }

        $paymentIntent = $this->stripe->retrievePaymentIntent($paymentIntentId);
        $reference = $paymentIntent['metadata']['gem_order'] ?? null;
        if (! is_string($reference) || ! Str::isUuid($reference)) {
            return null;
        }
        $order = GemOrder::query()->where('public_id', $reference)->first();
        if ($order === null || (bool) ($paymentIntent['livemode'] ?? false) !== $order->livemode) {
            return null;
        }

        if ($order->stripe_checkout_session_id !== null) {
            $order = $this->refreshCheckout($order);
        }
        if ($order->stripe_payment_intent_id === null) {
            GemOrder::query()->whereKey($order->id)->whereNull('stripe_payment_intent_id')->update(['stripe_payment_intent_id' => $paymentIntentId]);
            $order->refresh();
        }

        return $order->stripe_payment_intent_id === $paymentIntentId ? $order : null;
    }

    /**
     * Refunds and disputes of the order's payment, fetched from Stripe: only succeeded refunds and lost disputes
     * count, so a pending or failed refund never takes gems for good, and a refund that fails after being counted
     * gives them back. Refund + lost dispute are capped at the amount paid, so both together never take more than
     * the pack.
     */
    public function syncPaymentState(GemOrder $order, string $cause): GemOrder
    {
        $paymentIntentId = $order->stripe_payment_intent_id;
        if ($paymentIntentId === null) {
            return $order;
        }

        // taken before the calls: a slower concurrent sync with an older snapshot must not overwrite a newer one
        $version = (int) floor(microtime(true) * 1_000_000);
        $refunds = $this->stripe->listRefunds($paymentIntentId);
        $disputes = $this->stripe->listDisputes($paymentIntentId);

        $refunded = 0;
        foreach ($refunds as $refund) {
            if (($refund['status'] ?? null) === 'succeeded') {
                $refunded += (int) ($refund['amount'] ?? 0);
            }
        }
        $lost = 0;
        $latestDispute = null;
        foreach ($disputes as $dispute) {
            if (($dispute['status'] ?? null) === 'lost') {
                $lost += (int) ($dispute['amount'] ?? 0);
            }
            if ($latestDispute === null || (int) ($dispute['created'] ?? 0) >= (int) ($latestDispute['created'] ?? 0)) {
                $latestDispute = $dispute;
            }
        }

        return DB::transaction(function () use ($order, $version, $refunded, $lost, $latestDispute, $cause): GemOrder {
            /** @var GemOrder $locked */
            $locked = GemOrder::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if ($locked->stripe_state_version > $version) {
                return $locked;
            }

            $locked->fill([
                'refunded_cents' => min($refunded, $locked->amount_cents),
                'dispute_lost_cents' => min($lost, $locked->amount_cents),
                'stripe_state_version' => $version,
                'stripe_checked_at' => now(),
            ]);
            $locked->refunded_at = $refunded > 0 ? ($locked->refunded_at ?? now()) : null;

            if ($latestDispute !== null) {
                $status = (string) ($latestDispute['status'] ?? '');
                if ($locked->dispute_id !== ($latestDispute['id'] ?? null) || $locked->dispute_status !== $status) {
                    // kept for manual handling (docs/STRIPE.md): only a lost dispute takes gems back
                    Log::warning('Gem order dispute', ['order' => (string) $locked->public_id, 'dispute' => $latestDispute['id'] ?? null, 'status' => $status]);
                }
                $locked->fill([
                    'dispute_id' => $latestDispute['id'] ?? null,
                    'dispute_status' => mb_substr($status, 0, 40),
                    'dispute_reason' => isset($latestDispute['reason']) ? mb_substr((string) $latestDispute['reason'], 0, 60) : null,
                    'disputed_at' => isset($latestDispute['created']) ? Carbon::createFromTimestamp((int) $latestDispute['created']) : null,
                ]);
            }

            $reversedBefore = (int) $locked->gems_reversed;
            $this->applyReversal($locked, $cause);
            $locked->save();

            if ($locked->gems_reversed > $reversedBefore) {
                $orderId = (int) $locked->id;
                DB::afterCommit(fn () => $this->notifier->sendReversalNotice($orderId));
            }

            return $locked;
        });
    }

    /** Ledger entry for the difference between the gems to take back now and those already taken. Row locked. */
    private function applyReversal(GemOrder $order, string $cause): void
    {
        if (! $order->isDelivered()) {
            return;
        }
        $target = PremiumGemLedgerService::gemsToReverse(
            $order->gems,
            $order->amount_cents,
            $order->refunded_cents + $order->dispute_lost_cents,
        );
        if ($target === (int) $order->gems_reversed) {
            return;
        }
        $this->ledger->adjustReversal($order, $target, $cause);
        $order->gems_reversed = $target;
    }

    /**
     * paid | processing | failed | expired | open, from the session and its PaymentIntent.
     *
     * @param  array<string, mixed>  $session
     * @param  array<string, mixed>|null  $paymentIntent
     */
    private function checkoutOutcome(array $session, ?array $paymentIntent): string
    {
        $status = $session['status'] ?? null;
        if ($status === 'expired') {
            return 'expired';
        }
        if ($status !== 'complete') {
            return 'open';
        }
        if (($session['payment_status'] ?? null) === 'paid') {
            return 'paid';
        }

        // complete but unpaid: a delayed payment method, still running or failed
        return in_array($paymentIntent['status'] ?? null, ['requires_payment_method', 'canceled'], true) ? 'failed' : 'processing';
    }

    /**
     * Why the Stripe session cannot be trusted for this order, null when it matches.
     *
     * @param  array<string, mixed>  $session
     * @param  array<string, mixed>|null  $paymentIntent
     */
    private function mismatch(GemOrder $order, array $session, ?array $paymentIntent, string $outcome): ?string
    {
        $reference = $session['client_reference_id'] ?? null;
        if ($reference !== null && $reference !== (string) $order->public_id) {
            return 'reference_mismatch';
        }
        if ($order->stripe_checkout_session_id !== null && $order->stripe_checkout_session_id !== ($session['id'] ?? null)) {
            return 'session_mismatch';
        }
        if ((bool) ($session['livemode'] ?? false) !== $order->livemode) {
            return 'livemode_mismatch';
        }
        if (($session['mode'] ?? 'payment') !== 'payment') {
            return 'mode_mismatch';
        }
        if ($outcome !== 'paid') {
            return null;
        }

        if ((int) ($session['amount_total'] ?? -1) !== $order->amount_cents || strtolower((string) ($session['currency'] ?? '')) !== $order->currency) {
            return 'amount_mismatch';
        }
        if ($paymentIntent === null || ($paymentIntent['status'] ?? null) !== 'succeeded') {
            return 'payment_not_succeeded';
        }
        if ((int) ($paymentIntent['amount_received'] ?? -1) !== $order->amount_cents
            || strtolower((string) ($paymentIntent['currency'] ?? '')) !== $order->currency
            || (bool) ($paymentIntent['livemode'] ?? false) !== $order->livemode) {
            return 'amount_mismatch';
        }
        if ($order->stripe_payment_intent_id !== null && $order->stripe_payment_intent_id !== ($paymentIntent['id'] ?? null)) {
            return 'payment_intent_mismatch';
        }

        return null;
    }
}
