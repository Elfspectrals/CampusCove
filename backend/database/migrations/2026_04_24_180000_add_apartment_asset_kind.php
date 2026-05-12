<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'item_kind'
          AND e.enumlabel = 'apartment_asset'
    ) THEN
        ALTER TYPE item_kind ADD VALUE 'apartment_asset';
    END IF;
END $$;
SQL);
    }

    public function down(): void
    {
        // PostgreSQL enum values cannot be safely removed in-place.
    }
};

