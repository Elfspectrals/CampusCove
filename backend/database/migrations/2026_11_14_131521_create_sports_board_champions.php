<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS sports_board_champions (
  board       VARCHAR(32) NOT NULL,
  week        CHAR(8) NOT NULL,
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  value       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (board, week),
  CONSTRAINT ck_sports_board_champions_week CHECK (week ~ '^[0-9]{4}-W[0-9]{2}$')
);
CREATE INDEX IF NOT EXISTS ix_sports_board_champions_account ON sports_board_champions (account_id);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS sports_board_champions');
    }
};
