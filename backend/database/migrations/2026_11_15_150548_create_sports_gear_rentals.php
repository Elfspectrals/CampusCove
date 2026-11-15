<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        DB::unprepared(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'sports_gear_rental'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'sports_gear_rental';
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS sports_gear_rentals (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  ref          VARCHAR(64) NOT NULL,
  code         VARCHAR(255) NOT NULL,
  tx_id        BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  price        BIGINT NOT NULL,
  cash_after   BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sports_gear_rentals_ref UNIQUE (account_id, ref),
  CONSTRAINT ck_sports_gear_rentals_price CHECK (price > 0),
  CONSTRAINT ck_sports_gear_rentals_cash CHECK (cash_after >= 0)
);
CREATE INDEX IF NOT EXISTS ix_sports_gear_rentals_account ON sports_gear_rentals (account_id, created_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS sports_gear_rentals');
    }
};
