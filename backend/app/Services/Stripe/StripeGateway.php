<?php

namespace App\Services\Stripe;

/**
 * The few Stripe API calls of the gem shop, as plain arrays. StripeSdkGateway talks to Stripe; tests bind a fake,
 * so the suite never needs real keys nor the network. Webhook signatures are checked with the SDK directly
 * (offline HMAC), not through this interface.
 *
 * Every method throws StripeGatewayException when Stripe cannot be reached or refuses the call.
 */
interface StripeGateway
{
    /**
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function createCheckoutSession(array $params, string $idempotencyKey): array;

    /** @return array<string, mixed> The session with its payment_intent expanded (null until the player pays). */
    public function retrieveCheckoutSession(string $sessionId): array;

    /** @return array<string, mixed> */
    public function retrievePaymentIntent(string $paymentIntentId): array;

    /** @return list<array<string, mixed>> Every refund of the payment, whatever its status. */
    public function listRefunds(string $paymentIntentId): array;

    /** @return list<array<string, mixed>> Every dispute of the payment. */
    public function listDisputes(string $paymentIntentId): array;
}
