<?php

namespace App\Services\Stripe;

use RuntimeException;
use Throwable;

final class StripeGatewayException extends RuntimeException
{
    /**
     * @param  bool  $stripeAnswered  true when Stripe returned an HTTP error (it then replays that answer for the same
     *                                idempotency key), false for a network failure (the same call can simply be retried)
     * @param  int|null  $httpStatus  Stripe's HTTP status, null when Stripe was not reached
     */
    public function __construct(string $message, public readonly bool $stripeAnswered, ?Throwable $previous = null, public readonly ?int $httpStatus = null)
    {
        parent::__construct($message, 0, $previous);
    }

    /**
     * 409 (a request with the same idempotency key is still running at Stripe) or 429 (rate limit): Stripe saved
     * nothing, the same call with the same key works a moment later.
     */
    public function isTemporaryConflict(): bool
    {
        return in_array($this->httpStatus, [409, 429], true);
    }
}
