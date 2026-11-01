<?php

namespace App\Support;

/**
 * Whether the gem shop demo is on. CampusCove is a school project: Stripe is only ever used in test mode, payments
 * are simulated with Stripe's test cards and no real money is charged. Production keys (sk_live_ / rk_live_) are
 * refused everywhere: no order, no webhook, no API call.
 *
 * New orders need GEMS_CHECKOUT_MODE=test, a test secret key and a webhook secret: a key alone never opens the shop.
 * Webhooks and reconciliation only need the keys, so refunds of past demo orders are still handled once it is off.
 */
final class GemCheckoutConfig
{
    public function mode(): string
    {
        return config('services.stripe.checkout_mode') === 'test' ? 'test' : 'off';
    }

    public function secretKey(): string
    {
        return (string) config('services.stripe.secret', '');
    }

    public function webhookSecret(): string
    {
        return (string) config('services.stripe.webhook_secret', '');
    }

    public function hasTestKey(): bool
    {
        return preg_match('/^(sk|rk)_test_/', $this->secretKey()) === 1;
    }

    /** A production key was configured: refused, the shop stays off (docs/STRIPE.md). */
    public function hasLiveKey(): bool
    {
        return preg_match('/^(sk|rk)_live_/', $this->secretKey()) === 1;
    }

    public function canTalkToStripe(): bool
    {
        return $this->hasTestKey() && str_starts_with($this->webhookSecret(), 'whsec_');
    }

    public function checkoutOpen(): bool
    {
        return $this->mode() === 'test' && $this->canTalkToStripe();
    }

    public function frontendUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
