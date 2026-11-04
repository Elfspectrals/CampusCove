<?php

namespace App\Console\Commands;

use App\Models\GemOrder;
use App\Services\GemOrderFulfillmentService;
use App\Services\Stripe\StripeGatewayException;
use App\Support\GemCheckoutConfig;
use Illuminate\Console\Command;

/**
 * Safety net behind the Stripe webhook (scheduled every 10 minutes, bootstrap/app.php): asks Stripe for the real
 * state of orders still pending, closes orders whose session was never created, and with --order re-syncs one
 * order completely (payment, refunds, disputes) — the recovery path for a paid order without gems (docs/STRIPE.md).
 */
class ReconcileGemOrders extends Command
{
    protected $signature = 'gems:reconcile {--order= : public id of one order to re-sync, refunds and disputes included}';

    protected $description = 'Re-sync gem orders with Stripe (missed webhooks, abandoned orders)';

    /** Orders younger than this are left to the webhook and the return page. */
    private const GRACE_MINUTES = 5;

    /** A `creating` order older than this never got a Checkout Session the player could open. */
    private const ABANDON_MINUTES = 30;

    public function handle(GemCheckoutConfig $config, GemOrderFulfillmentService $fulfillment): int
    {
        if ($config->hasLiveKey()) {
            $this->error('A Stripe production key is configured: refused, test mode only (docs/STRIPE.md).');

            return self::FAILURE;
        }
        if (! $config->canTalkToStripe()) {
            $this->info('Stripe is not configured: nothing to reconcile.');

            return self::SUCCESS;
        }

        $publicId = $this->option('order');
        if (is_string($publicId) && $publicId !== '') {
            return $this->reconcileOne($publicId, $fulfillment);
        }

        $abandoned = GemOrder::query()
            ->where('status', GemOrder::STATUS_CREATING)
            ->whereNull('stripe_checkout_session_id')
            ->where('created_at', '<', now()->subMinutes(self::ABANDON_MINUTES))
            ->update(['status' => GemOrder::STATUS_CANCELED, 'canceled_at' => now(), 'last_error' => 'session_not_created']);

        $checked = 0;
        $failed = 0;
        GemOrder::query()
            ->whereIn('status', GemOrder::PENDING_STATUSES)
            ->whereNotNull('stripe_checkout_session_id')
            ->where('created_at', '<', now()->subMinutes(self::GRACE_MINUTES))
            ->orderBy('id')
            ->limit(100)
            ->get()
            ->each(function (GemOrder $order) use ($fulfillment, &$checked, &$failed): void {
                try {
                    $fulfillment->refreshCheckout($order);
                    $checked++;
                } catch (StripeGatewayException $e) {
                    $failed++;
                    $this->warn("{$order->public_id}: {$e->getMessage()}");
                }
            });

        $this->info("Checked {$checked} pending order(s), {$failed} Stripe error(s), closed {$abandoned} abandoned order(s).");

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }

    private function reconcileOne(string $publicId, GemOrderFulfillmentService $fulfillment): int
    {
        $order = GemOrder::query()->where('public_id', $publicId)->first();
        if ($order === null) {
            $this->error("Order {$publicId} not found.");

            return self::FAILURE;
        }

        try {
            $order = $fulfillment->refreshCheckout($order);
            $order = $fulfillment->syncPaymentState($order, 'reconcile');
        } catch (StripeGatewayException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->table(['order', 'status', 'delivered', 'gems', 'refunded', 'gems taken back', 'dispute', 'last error'], [[
            $order->public_id,
            $order->status,
            $order->delivered_at?->toIso8601String() ?? 'no',
            $order->gems,
            $order->refunded_cents.' / '.$order->amount_cents,
            $order->gems_reversed,
            $order->dispute_status ?? '-',
            $order->last_error ?? '-',
        ]]);

        return self::SUCCESS;
    }
}
