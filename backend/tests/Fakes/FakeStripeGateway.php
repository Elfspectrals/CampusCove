<?php

namespace Tests\Fakes;

use App\Services\Stripe\StripeGateway;
use App\Services\Stripe\StripeGatewayException;

/**
 * In-memory Stripe for the gem shop tests: Checkout Sessions with idempotent creation, PaymentIntents, refunds and
 * disputes, shaped like the API objects the code reads. No key, no network.
 */
final class FakeStripeGateway implements StripeGateway
{
    /** @var array<string, array<string, mixed>> */
    public array $sessions = [];

    /** @var array<string, array<string, mixed>> */
    public array $paymentIntents = [];

    /** @var array<string, list<array<string, mixed>>> */
    public array $refunds = [];

    /** @var array<string, list<array<string, mixed>>> */
    public array $disputes = [];

    /** @var list<array{params: array<string, mixed>, key: string}> */
    public array $createCalls = [];

    /** @var array<string, string> idempotency key => session id */
    private array $byKey = [];

    /** Next calls throw these, one per call. */
    public array $failNextCreate = [];

    public int $failNextRetrieves = 0;

    public int $retrieveCalls = 0;

    private int $seq = 0;

    public function createCheckoutSession(array $params, string $idempotencyKey): array
    {
        $this->createCalls[] = ['params' => $params, 'key' => $idempotencyKey];
        if ($this->failNextCreate !== []) {
            throw array_shift($this->failNextCreate);
        }
        if (isset($this->byKey[$idempotencyKey])) {
            return $this->sessions[$this->byKey[$idempotencyKey]];
        }

        $id = 'cs_test_'.(++$this->seq);
        $this->sessions[$id] = [
            'id' => $id,
            'object' => 'checkout.session',
            'url' => "https://checkout.stripe.com/c/pay/{$id}",
            'mode' => $params['mode'],
            'status' => 'open',
            'payment_status' => 'unpaid',
            'client_reference_id' => $params['client_reference_id'],
            'metadata' => $params['metadata'],
            'amount_total' => $params['line_items'][0]['price_data']['unit_amount'],
            'currency' => $params['line_items'][0]['price_data']['currency'],
            'livemode' => false,
            'payment_intent' => null,
        ];
        $this->byKey[$idempotencyKey] = $id;

        return $this->sessions[$id];
    }

    public function retrieveCheckoutSession(string $sessionId): array
    {
        $this->retrieveCalls++;
        if ($this->failNextRetrieves > 0) {
            $this->failNextRetrieves--;
            throw new StripeGatewayException('Stripe unreachable (fake)', false);
        }
        if (! isset($this->sessions[$sessionId])) {
            throw new StripeGatewayException('No such checkout session', true);
        }

        $session = $this->sessions[$sessionId];
        if (is_string($session['payment_intent'])) {
            $session['payment_intent'] = $this->paymentIntents[$session['payment_intent']];
        }

        return $session;
    }

    public function retrievePaymentIntent(string $paymentIntentId): array
    {
        return $this->paymentIntents[$paymentIntentId] ?? throw new StripeGatewayException('No such payment_intent', true);
    }

    public function listRefunds(string $paymentIntentId): array
    {
        return $this->refunds[$paymentIntentId] ?? [];
    }

    public function listDisputes(string $paymentIntentId): array
    {
        return $this->disputes[$paymentIntentId] ?? [];
    }

    // ---------------------------------------------------------------- test controls (what the player / operator does on Stripe)

    /** The player pays the session; returns the PaymentIntent id. */
    public function pay(string $sessionId, array $paymentIntent = [], array $session = []): string
    {
        $base = $this->sessions[$sessionId];
        $piId = 'pi_test_'.(++$this->seq);
        $this->paymentIntents[$piId] = array_merge([
            'id' => $piId,
            'object' => 'payment_intent',
            'status' => 'succeeded',
            'amount' => $base['amount_total'],
            'amount_received' => $base['amount_total'],
            'currency' => $base['currency'],
            'livemode' => false,
            'metadata' => $base['metadata'],
        ], $paymentIntent);
        $this->sessions[$sessionId] = array_merge($base, [
            'status' => 'complete',
            'payment_status' => 'paid',
            'payment_intent' => $piId,
        ], $session);

        return $piId;
    }

    public function expire(string $sessionId): void
    {
        $this->sessions[$sessionId]['status'] = 'expired';
    }

    public function refund(string $paymentIntentId, int $amount, string $status = 'succeeded'): string
    {
        $id = 're_test_'.(++$this->seq);
        $this->refunds[$paymentIntentId][] = ['id' => $id, 'object' => 'refund', 'amount' => $amount, 'status' => $status, 'payment_intent' => $paymentIntentId];

        return $id;
    }

    public function setRefundStatus(string $paymentIntentId, string $refundId, string $status): void
    {
        foreach ($this->refunds[$paymentIntentId] as $i => $refund) {
            if ($refund['id'] === $refundId) {
                $this->refunds[$paymentIntentId][$i]['status'] = $status;
            }
        }
    }

    public function dispute(string $paymentIntentId, int $amount, string $status): string
    {
        $id = 'dp_test_'.(++$this->seq);
        $this->disputes[$paymentIntentId] = [[
            'id' => $id,
            'object' => 'dispute',
            'amount' => $amount,
            'status' => $status,
            'reason' => 'fraudulent',
            'created' => time(),
            'payment_intent' => $paymentIntentId,
        ]];

        return $id;
    }
}
