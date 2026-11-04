<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE ip_bans ADD COLUMN IF NOT EXISTS cloudflare_rule_id VARCHAR(64) NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE ip_bans DROP COLUMN IF EXISTS cloudflare_rule_id;
SQL);
    }
};
