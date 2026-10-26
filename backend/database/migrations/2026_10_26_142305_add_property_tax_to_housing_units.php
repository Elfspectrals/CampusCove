<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
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
          AND e.enumlabel = 'housing_tax'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'housing_tax';
    END IF;
END $$;
SQL);

        if (! Schema::hasColumn('housing_units', 'tax_due_at')) {
            Schema::table('housing_units', function (Blueprint $table) {
                $table->timestampTz('tax_due_at')->nullable();
            });
        }

        DB::unprepared(<<<'SQL'
UPDATE housing_units
SET offer_type = 'buy',
    tax_due_at = CASE WHEN status = 'occupied' THEN COALESCE(lease_expires_at, now() + interval '24 hours') END,
    lease_expires_at = NULL
WHERE offer_type = 'rent';
SQL);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('housing_units', 'tax_due_at')) {
            Schema::table('housing_units', function (Blueprint $table) {
                $table->dropColumn('tax_due_at');
            });
        }
    }
};
