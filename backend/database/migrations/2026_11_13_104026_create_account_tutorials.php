<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS account_tutorials (
  account_id    BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  step          TEXT NOT NULL,
  status        TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ NULL,
  CONSTRAINT ck_account_tutorials_step CHECK (step IN ('pick_apples', 'eat_apple', 'sell_apples', 'deposit_cash', 'play_darts')),
  CONSTRAINT ck_account_tutorials_status CHECK (status IN ('active', 'skipped', 'done')),
  CONSTRAINT ck_account_tutorials_completed CHECK ((status = 'done') = (completed_at IS NOT NULL))
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS account_tutorials');
    }
};
