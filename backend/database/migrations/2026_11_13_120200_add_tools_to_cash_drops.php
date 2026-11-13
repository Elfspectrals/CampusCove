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
        WHERE t.typname = 'container_type'
          AND e.enumlabel = 'death_drop'
    ) THEN
        ALTER TYPE container_type ADD VALUE 'death_drop';
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
ALTER TABLE cash_drops ADD COLUMN IF NOT EXISTS container_id BIGINT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT;
ALTER TABLE cash_drops DROP CONSTRAINT IF EXISTS ck_cash_drops_amount;
ALTER TABLE cash_drops ADD CONSTRAINT ck_cash_drops_amount CHECK (amount > 0 OR (amount = 0 AND container_id IS NOT NULL));
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DELETE FROM cash_drops WHERE amount = 0;
ALTER TABLE cash_drops DROP CONSTRAINT IF EXISTS ck_cash_drops_amount;
ALTER TABLE cash_drops ADD CONSTRAINT ck_cash_drops_amount CHECK (amount > 0);
ALTER TABLE cash_drops DROP COLUMN IF EXISTS container_id;
SQL);
    }
};
