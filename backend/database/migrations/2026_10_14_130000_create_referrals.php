<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12) NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_referral_code ON accounts(referral_code);

CREATE TABLE IF NOT EXISTS referrals (
  referee_account_id  BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  referrer_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  qualified_at        TIMESTAMPTZ NULL,
  referrer_rewarded   BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT ck_referrals_not_self CHECK (referee_account_id <> referrer_account_id)
);
CREATE INDEX IF NOT EXISTS ix_referrals_referrer ON referrals(referrer_account_id, qualified_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS referrals;
DROP INDEX IF EXISTS ux_accounts_referral_code;
ALTER TABLE accounts DROP COLUMN IF EXISTS referral_code;
SQL);
    }
};
