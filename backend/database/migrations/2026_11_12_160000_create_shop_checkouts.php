<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One row per paid basket, keyed by the checkout key the client sends: a payment retried after a lost answer
 * (same key) gets the first result back instead of paying twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS shop_checkouts (
  account_id     BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  checkout_key   UUID NOT NULL,
  purchase_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  balance_after  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, checkout_key)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS shop_checkouts');
    }
};
