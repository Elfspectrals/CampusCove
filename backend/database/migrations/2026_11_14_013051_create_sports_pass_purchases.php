<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS sports_pass_purchases (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  ref          VARCHAR(64) NOT NULL,
  kind         VARCHAR(8) NOT NULL,
  tx_id        BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  valid_until  TIMESTAMPTZ NOT NULL,
  cash_after   BIGINT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sports_pass_purchases_ref UNIQUE (account_id, ref),
  CONSTRAINT ck_sports_pass_purchases_kind CHECK (kind IN ('day', 'week')),
  CONSTRAINT ck_sports_pass_purchases_cash CHECK (cash_after >= 0)
);
CREATE INDEX IF NOT EXISTS ix_sports_pass_purchases_account_until ON sports_pass_purchases (account_id, valid_until);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS sports_pass_purchases');
    }
};
