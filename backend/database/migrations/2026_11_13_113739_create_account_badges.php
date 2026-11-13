<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS account_badges (
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  badge       TEXT NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, badge),
  CONSTRAINT ck_account_badges_badge CHECK (badge IN ('new_citizen'))
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS account_badges');
    }
};
