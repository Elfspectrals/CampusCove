<?php

namespace App\Support;

use App\Models\Account;

/**
 * Whether the gem shop demo is on. CampusCove is a school project: Stripe is only ever used in test mode, payments
 * are simulated with Stripe's test cards and no real money is charged. Production keys (sk_live_ / rk_live_) are
 * refused everywhere: no order, no webhook, no API call.
 *
 * New orders need GEMS_CHECKOUT_MODE=test, a test secret key and a webhook secret: a key alone never opens the shop.
 * Webhooks and reconciliation only need the keys, so refunds of past demo orders are still handled once it is off.
 *
 * Test cards really credit game gems: on a shared server (APP_ENV=production) the demo is for admins only, so
 * players cannot get free gems. Local and test environments keep it open to every player.
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

    /** Demo explicitly on in production: only admins may order (webhooks, refunds and reconciliation are not affected). */
    public function adminOnly(): bool
    {
        return $this->mode() === 'test' && app()->environment('production');
    }

    /** Same admin check as the `admin` middleware (EnsureAccountIsAdmin). */
    public function mayOrder(Account $account): bool
    {
        return $this->checkoutOpen() && (! $this->adminOnly() || (bool) $account->is_admin);
    }

    /** Why the account may not order: null (it may), `disabled` (demo off) or `admin_only` (production, not an admin). */
    public function unavailableReason(Account $account): ?string
    {
        if (! $this->checkoutOpen()) {
            return 'disabled';
        }

        return $this->mayOrder($account) ? null : 'admin_only';
    }

    public function frontendUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/');
    }
}
