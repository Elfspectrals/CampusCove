<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS pub_quiz_wins (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quiz_id            TEXT NOT NULL UNIQUE,
  account_id         BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  valid_contestants  INTEGER NOT NULL,
  coins              INTEGER NOT NULL,
  pint_expires_at    TIMESTAMPTZ NULL,
  pint_redeemed_at   TIMESTAMPTZ NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_pub_quiz_wins_counts CHECK (valid_contestants >= 0 AND coins >= 0),
  CONSTRAINT ck_pub_quiz_wins_pint CHECK (pint_redeemed_at IS NULL OR pint_expires_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ix_pub_quiz_wins_pint ON pub_quiz_wins (account_id) WHERE pint_redeemed_at IS NULL AND pint_expires_at IS NOT NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS pub_quiz_wins');
    }
};
