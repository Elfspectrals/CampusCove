<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Notice e-mail before an inactive account is anonymized (accounts:purge-inactive)
 * and the statement of reasons sent with a moderation decision (DSA art. 16-17).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS inactivity_warned_at TIMESTAMPTZ NULL;
ALTER TABLE player_reports ADD COLUMN IF NOT EXISTS decision_note TEXT NULL;
CREATE INDEX IF NOT EXISTS ix_player_reports_resolved ON player_reports(resolved_at) WHERE resolved_at IS NOT NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP INDEX IF EXISTS ix_player_reports_resolved;
ALTER TABLE player_reports DROP COLUMN IF EXISTS decision_note;
ALTER TABLE accounts DROP COLUMN IF EXISTS inactivity_warned_at;
SQL);
    }
};
