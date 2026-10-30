<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        foreach (['pub_order', 'pub_play', 'hangover'] as $type) {
            DB::unprepared(<<<SQL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = '{$type}'
    ) THEN
        ALTER TYPE tx_type ADD VALUE '{$type}';
    END IF;
END $$;
SQL);
        }

        Schema::table('item_defs', function (Blueprint $table) {
            $table->smallInteger('alcohol_per_portion')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('item_defs', function (Blueprint $table) {
            $table->dropColumn('alcohol_per_portion');
        });
    }
};
