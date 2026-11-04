<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS ip_bans (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip                    VARCHAR(45) NOT NULL,
  reason                VARCHAR(10) NOT NULL,
  score                 INTEGER NULL,
  banned_by_account_id  BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  expires_at            TIMESTAMPTZ NULL,
  lifted_at             TIMESTAMPTZ NULL,
  lifted_by_account_id  BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_ip_bans_reason CHECK (reason IN ('auto', 'manual'))
);
CREATE INDEX IF NOT EXISTS ix_ip_bans_ip_active ON ip_bans (ip) WHERE lifted_at IS NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS ip_bans;
SQL);
    }
};
