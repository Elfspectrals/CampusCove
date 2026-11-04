<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS security_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip          VARCHAR(45) NOT NULL,
  country     VARCHAR(2) NULL,
  type        VARCHAR(32) NOT NULL,
  method      VARCHAR(10) NOT NULL,
  path        TEXT NOT NULL,
  user_agent  TEXT NULL,
  detail      TEXT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_security_events_ip_created ON security_events (ip, created_at);
CREATE INDEX IF NOT EXISTS ix_security_events_type_created ON security_events (type, created_at);
CREATE INDEX IF NOT EXISTS ix_security_events_created ON security_events (created_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS security_events;
SQL);
    }
};
