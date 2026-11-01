<?php

namespace App\Services\Stripe;

use App\Support\GemCheckoutConfig;
use Closure;
use Stripe\Exception\ApiConnectionException;
use Stripe\Exception\ApiErrorException;
use Stripe\StripeClient;

/**
 * StripeGateway over the official stripe-php SDK (API version pinned by the SDK release in composer.lock).
 * Test mode only: refuses to call Stripe with anything but a test key.
 */
final class StripeSdkGateway implements StripeGateway
{
    private ?StripeClient $client = null;

    public function __construct(private readonly GemCheckoutConfig $config) {}

    public function createCheckoutSession(array $params, string $idempotencyKey): array
    {
        return $this->call(fn (StripeClient $c) => $c->checkout->sessions->create($params, ['idempotency_key' => $idempotencyKey])->toArray());
    }

    public function retrieveCheckoutSession(string $sessionId): array
    {
        return $this->call(fn (StripeClient $c) => $c->checkout->sessions->retrieve($sessionId, ['expand' => ['payment_intent']])->toArray());
    }

    public function retrievePaymentIntent(string $paymentIntentId): array
    {
        return $this->call(fn (StripeClient $c) => $c->paymentIntents->retrieve($paymentIntentId)->toArray());
    }

    public function listRefunds(string $paymentIntentId): array
    {
        return $this->call(function (StripeClient $c) use ($paymentIntentId): array {
            $rows = [];
            foreach ($c->refunds->all(['payment_intent' => $paymentIntentId, 'limit' => 100])->autoPagingIterator() as $refund) {
                $rows[] = $refund->toArray();
            }

            return $rows;
        });
    }

    public function listDisputes(string $paymentIntentId): array
    {
        return $this->call(function (StripeClient $c) use ($paymentIntentId): array {
            $rows = [];
            foreach ($c->disputes->all(['payment_intent' => $paymentIntentId, 'limit' => 100])->autoPagingIterator() as $dispute) {
                $rows[] = $dispute->toArray();
            }

            return $rows;
        });
    }

    /**
     * @template T
     *
     * @param  Closure(StripeClient): T  $fn
     * @return T
     */
    private function call(Closure $fn): mixed
    {
        // last guard: no request ever leaves with a production (or unknown) key
        if (! $this->config->hasTestKey()) {
            throw new StripeGatewayException('Only Stripe test keys (sk_test_ / rk_test_) are accepted.', false);
        }
        $this->client ??= new StripeClient([
            'api_key' => $this->config->secretKey(),
            // the SDK retries network failures itself, with the same idempotency key
            'max_network_retries' => 2,
        ]);

        try {
            return $fn($this->client);
        } catch (ApiConnectionException $e) {
            throw new StripeGatewayException('Stripe unreachable: '.$e->getMessage(), false, $e);
        } catch (ApiErrorException $e) {
            $status = $e->getHttpStatus();
            // 409 (same idempotency key still running) and 429 (rate limit) are not saved by Stripe: retrying works
            $answered = $status !== null && ! in_array($status, [409, 429], true);

            throw new StripeGatewayException('Stripe error '.($status ?? '?').': '.($e->getStripeCode() ?? $e->getMessage()), $answered, $e);
        }
    }
}
