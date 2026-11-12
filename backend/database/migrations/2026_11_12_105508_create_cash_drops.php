<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        foreach (['cash_drop', 'cash_pickup'] as $type) {
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

        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS cash_drops (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_account_id      BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  killer_account_id     BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  amount                INTEGER NOT NULL,
  drop_tx_id            BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  expires_at            TIMESTAMPTZ NOT NULL,
  picked_by_account_id  BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  pickup_tx_id          BIGINT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  picked_at             TIMESTAMPTZ NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_cash_drops_amount CHECK (amount > 0),
  CONSTRAINT ck_cash_drops_pickup CHECK ((picked_at IS NULL) = (pickup_tx_id IS NULL)),
  CONSTRAINT ck_cash_drops_not_killer CHECK (picked_by_account_id IS NULL OR killer_account_id IS NULL OR picked_by_account_id <> killer_account_id)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS cash_drops');
    }
};
