<?php

namespace Tests\Fakes;

use App\Services\Stripe\StripeGateway;
use LogicException;

/**
 * Stripe for the worker processes of GemCheckoutConcurrencyTest: each Checkout Session creation is appended to a
 * shared file (so the test counts the calls of every process) and takes `$delayMs`, like a slow network call. The
 * session is derived from the idempotency key, as Stripe replays the same session for the same key.
 */
final class SlowStripeGateway implements StripeGateway
{
    public function __construct(private readonly string $callLog, private readonly int $delayMs) {}

    public function createCheckoutSession(array $params, string $idempotencyKey): array
    {
        file_put_contents($this->callLog, $idempotencyKey.PHP_EOL, FILE_APPEND | LOCK_EX);
        usleep($this->delayMs * 1000);
        $id = 'cs_test_'.substr(hash('sha256', $idempotencyKey), 0, 24);

        return ['id' => $id, 'object' => 'checkout.session', 'url' => "https://checkout.stripe.com/c/pay/{$id}", 'status' => 'open'];
    }

    public function retrieveCheckoutSession(string $sessionId): array
    {
        throw new LogicException('not used by the checkout race');
    }

    public function retrievePaymentIntent(string $paymentIntentId): array
    {
        throw new LogicException('not used by the checkout race');
    }

    public function listRefunds(string $paymentIntentId): array
    {
        throw new LogicException('not used by the checkout race');
    }

    public function listDisputes(string $paymentIntentId): array
    {
        throw new LogicException('not used by the checkout race');
    }
}
