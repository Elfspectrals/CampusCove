<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE sports_matches ADD COLUMN IF NOT EXISTS counts_for_tasks BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS ix_sports_match_players_account ON sports_match_players (account_id);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP INDEX IF EXISTS ix_sports_match_players_account;
ALTER TABLE sports_matches DROP COLUMN IF EXISTS counts_for_tasks;
SQL);
    }
};
