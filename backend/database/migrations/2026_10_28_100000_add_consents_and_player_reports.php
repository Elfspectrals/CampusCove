<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * GDPR proof of consent on accounts (terms version + date, age declaration)
 * and player reports for moderation (DSA notice-and-action).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20) NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS player_reports (
  id                 BIGSERIAL PRIMARY KEY,
  reporter_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  target_account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  reason             VARCHAR(20) NOT NULL,
  details            TEXT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ NULL,
  CONSTRAINT ck_player_reports_not_self CHECK (reporter_account_id IS NULL OR reporter_account_id <> target_account_id),
  CONSTRAINT ck_player_reports_reason CHECK (reason IN ('harassment','hate','cheating','username','scam','other')),
  CONSTRAINT ck_player_reports_status CHECK (status IN ('open','actioned','dismissed'))
);
CREATE INDEX IF NOT EXISTS ix_player_reports_status ON player_reports(status, created_at);
CREATE INDEX IF NOT EXISTS ix_player_reports_target ON player_reports(target_account_id);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS player_reports;
ALTER TABLE accounts DROP COLUMN IF EXISTS anonymized_at;
ALTER TABLE accounts DROP COLUMN IF EXISTS age_confirmed_at;
ALTER TABLE accounts DROP COLUMN IF EXISTS terms_accepted_at;
ALTER TABLE accounts DROP COLUMN IF EXISTS terms_version;
SQL);
    }
};
