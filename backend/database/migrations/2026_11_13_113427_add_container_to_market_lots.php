<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE market_lots ADD COLUMN IF NOT EXISTS container VARCHAR(6) NOT NULL DEFAULT 'crate';
ALTER TABLE market_lots DROP CONSTRAINT IF EXISTS ck_market_lots_container;
ALTER TABLE market_lots ADD CONSTRAINT ck_market_lots_container CHECK (container IN ('crate', 'basket', 'flat'));
SQL);
    }

    public function down(): void
    {
        DB::unprepared('ALTER TABLE market_lots DROP CONSTRAINT IF EXISTS ck_market_lots_container; ALTER TABLE market_lots DROP COLUMN IF EXISTS container;');
    }
};
