<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Economy transaction types of the gem shop: a paid Stripe order credits premium gems (premium_purchase), a refund
 * or a lost dispute takes them back, or gives them back when a refund fails afterwards (premium_refund).
 * Own migration: a new enum value cannot be used in the transaction that adds it (the next migration indexes it).
 */
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        foreach (['premium_purchase', 'premium_refund'] as $type) {
            DB::unprepared(<<<SQL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = '{$type}'
    ) THEN
        ALTER TYPE tx_type ADD VALUE '{$type}';
    END IF;
END $$;
SQL);
        }
    }

    public function down(): void
    {
        // PostgreSQL cannot drop an enum value; rows of these types stay readable.
    }
};
