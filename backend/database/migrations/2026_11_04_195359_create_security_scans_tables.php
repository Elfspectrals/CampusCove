<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS security_scans (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commit_sha   VARCHAR(40) NOT NULL,
  ref          VARCHAR(255) NOT NULL,
  scanned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS security_vulnerabilities (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scan_id            BIGINT NOT NULL REFERENCES security_scans(id) ON DELETE CASCADE,
  target             TEXT NOT NULL,
  package            TEXT NOT NULL,
  installed_version  TEXT NOT NULL,
  fixed_version      TEXT NULL,
  vulnerability_id   VARCHAR(64) NOT NULL,
  severity           VARCHAR(10) NOT NULL,
  title              TEXT NULL,
  CONSTRAINT ck_security_vulnerabilities_severity CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'))
);
CREATE INDEX IF NOT EXISTS ix_security_vulnerabilities_scan ON security_vulnerabilities (scan_id);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS security_vulnerabilities;
DROP TABLE IF EXISTS security_scans;
SQL);
    }
};
