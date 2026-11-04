<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS ip_reputations (
  ip                VARCHAR(45) PRIMARY KEY,
  abuse_confidence  INTEGER NOT NULL,
  country           VARCHAR(2) NULL,
  isp               TEXT NULL,
  usage_type        TEXT NULL,
  is_tor            BOOLEAN NOT NULL,
  total_reports     INTEGER NOT NULL,
  checked_at        TIMESTAMPTZ NOT NULL,
  CONSTRAINT ck_ip_reputations_confidence CHECK (abuse_confidence BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS ix_ip_reputations_checked ON ip_reputations (checked_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS ip_reputations;
SQL);
    }
};
