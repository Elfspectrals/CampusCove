<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        DB::unprepared(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'item_kind'
          AND e.enumlabel = 'sports_gear'
    ) THEN
        ALTER TYPE item_kind ADD VALUE 'sports_gear';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'sports_pass'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'sports_pass';
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
ALTER TABLE item_defs ADD COLUMN IF NOT EXISTS meta_json JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_sports_gear;
ALTER TABLE item_defs ADD CONSTRAINT ck_item_defs_sports_gear CHECK (
  kind <> 'sports_gear'
  OR (
    jsonb_typeof(meta_json->'sport') = 'string'
    AND meta_json->>'slot' IN ('bottom', 'shoes', 'hands', 'held')
    AND max_stack = 1
    AND max_uses IS NULL
    AND NOT weapon
  )
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_sports_gear;
ALTER TABLE item_defs DROP COLUMN IF EXISTS meta_json;
SQL);
    }
};
