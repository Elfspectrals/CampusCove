<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        $values = [
            ['currency_code', 'cash'],
            ['tx_type', 'bank_deposit'],
            ['tx_type', 'bank_withdraw'],
            ['tx_type', 'bank_transfer'],
        ];
        foreach ($values as [$enum, $value]) {
            DB::unprepared(<<<SQL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = '{$enum}'
          AND e.enumlabel = '{$value}'
    ) THEN
        ALTER TYPE {$enum} ADD VALUE '{$value}';
    END IF;
END $$;
SQL);
        }
    }

    public function down(): void
    {
        throw new RuntimeException('Postgres cannot drop an enum value: restore a backup to undo the cash currency.');
    }
};
