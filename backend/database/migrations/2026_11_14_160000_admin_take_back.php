<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The in-game admin can take back what it gives: money (tx type admin_take) and items (admin_item_grants rows
 * with direction 'take').
 */
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
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'admin_take'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'admin_take';
    END IF;
END $$;

ALTER TABLE admin_item_grants
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'give' CHECK (direction IN ('give', 'take'));
SQL);
    }

    public function down(): void
    {
        DB::unprepared('ALTER TABLE admin_item_grants DROP COLUMN IF EXISTS direction');
    }
};
