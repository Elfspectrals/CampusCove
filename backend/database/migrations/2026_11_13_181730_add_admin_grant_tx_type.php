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
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'admin_grant'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'admin_grant';
    END IF;
END $$;
SQL);
    }

    public function down(): void
    {
        throw new RuntimeException('Postgres cannot drop an enum value: restore a backup to undo admin_grant.');
    }
};
