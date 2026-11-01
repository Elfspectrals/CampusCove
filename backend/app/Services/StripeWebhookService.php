<?php

namespace App\Services;

use App\Models\StripeWebhookEvent;
use App\Services\Stripe\StripeGateway;
use App\Support\GemCheckoutConfig;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Stripe\Event;
use Throwable;

/**
 * Handles a Stripe event whose signature was already checked (StripeWebhookController).
 *
 * The event only says *what* changed; the state is fetched again from Stripe and applied by
 * GemOrderFulfillmentService, so replays, several events of one payment and any arrival order give the same result.
 * The event is marked processed only after its effects are committed; on failure it stays unprocessed, the
 * controller answers 500 and Stripe retries (for up to 3 days). Unrelated events are acknowledged without effect.
 */
final class StripeWebhookService
{
    private const CHECKOUT_EVENTS = [
        'checkout.session.completed',
        'checkout.session.async_payment_succeeded',
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
    ];

    private const PAYMENT_STATE_EVENTS = [
        'charge.refunded',
        'charge.refund.updated',
        'refund.created',
        'refund.updated',
        'refund.failed',
        'charge.dispute.created',
        'charge.dispute.updated',
        'charge.dispute.closed',
        'charge.dispute.funds_withdrawn',
        'charge.dispute.funds_reinstated',
    ];

    public function __construct(
        private readonly GemCheckoutConfig $config,
        private readonly GemOrderFulfillmentService $fulfillment,
        private readonly StripeGateway $stripe,
    ) {}

    /** @return string processed | duplicate | ignored */
    public function handle(Event $event): string
    {
        $type = (string) $event->type;
        $isCheckout = in_array($type, self::CHECKOUT_EVENTS, true);
        if (! $isCheckout && ! in_array($type, self::PAYMENT_STATE_EVENTS, true)) {
            return 'ignored';
        }
        if ((bool) $event->livemode) {
            // school project: Stripe test mode only, a production event is never applied
            Log::warning('Stripe production event ignored (test mode only)', ['event' => $event->id, 'type' => $type]);

            return 'ignored';
        }

        $row = $this->eventRow($event);
        if ($row->processed_at !== null) {
            return 'duplicate';
        }

        try {
            /** @var array<string, mixed> $object */
            $object = $event->data->object->toArray();
            $orderId = $isCheckout ? $this->handleCheckout($object) : $this->handlePaymentState($object, $type);

            StripeWebhookEvent::query()->whereKey($row->id)->whereNull('processed_at')->update([
                'processed_at' => now(),
                'gem_order_id' => $orderId,
                'last_error' => null,
            ]);
        } catch (Throwable $e) {
            StripeWebhookEvent::query()->whereKey($row->id)->increment('attempts', 1, [
                'last_error' => mb_substr(class_basename($e).': '.$e->getMessage(), 0, 255),
            ]);

            throw $e;
        }

        return 'processed';
    }

    /** @param array<string, mixed> $object */
    private function handleCheckout(array $object): ?int
    {
        // not ours (another integration on the same Stripe account): no API call
        if ($this->fulfillment->findOrderForSession($object) === null) {
            return null;
        }

        $order = $this->fulfillment->applyCheckoutSession($this->stripe->retrieveCheckoutSession((string) $object['id']));

        return $order?->id;
    }

    /** @param array<string, mixed> $object a Charge, a Refund or a Dispute */
    private function handlePaymentState(array $object, string $type): ?int
    {
        $paymentIntent = $object['payment_intent'] ?? null;
        $paymentIntentId = is_array($paymentIntent) ? ($paymentIntent['id'] ?? null) : $paymentIntent;
        if (! is_string($paymentIntentId) || $paymentIntentId === '') {
            return null;
        }

        $order = $this->fulfillment->findOrderForPaymentIntent($paymentIntentId);
        if ($order === null) {
            return null;
        }

        return $this->fulfillment->syncPaymentState($order, $type)->id;
    }

    private function eventRow(Event $event): StripeWebhookEvent
    {
        $find = fn () => StripeWebhookEvent::query()->where('event_id', $event->id)->first();

        $row = $find();
        if ($row !== null) {
            return $row;
        }
        try {
            return StripeWebhookEvent::query()->create([
                'event_id' => $event->id,
                'type' => mb_substr((string) $event->type, 0, 100),
                'livemode' => (bool) $event->livemode,
                'received_at' => now(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // the same event delivered twice at once
            return $find() ?? throw new RuntimeException('Stripe event row vanished');
        }
    }
}
