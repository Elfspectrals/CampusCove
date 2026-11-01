<?php

namespace App\Services\Stripe;

use RuntimeException;
use Throwable;

final class StripeGatewayException extends RuntimeException
{
    /**
     * @param  bool  $stripeAnswered  true when Stripe returned an HTTP error (it then replays that answer for the same
     *                               idempotency key), false for a network failure (the same call can simply be retried)
     */
    public function __construct(string $message, public readonly bool $stripeAnswered, ?Throwable $previous = null)
    {
        parent::__construct($message, 0, $previous);
    }
}
