<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Lease on the Checkout Session creation of a `creating` order (GemCheckoutService): only the request holding it
 * calls Stripe, the others answer "payment being prepared". It expires on its own, so a request that died while
 * calling Stripe never blocks the order: the next one takes it over with the same idempotency key.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE gem_orders ADD COLUMN checkout_lease_until TIMESTAMPTZ NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE gem_orders DROP COLUMN checkout_lease_until');
    }
};
