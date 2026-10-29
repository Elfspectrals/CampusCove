<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Admins can set a house's daily property tax (the "rent" owners pay) by hand. NULL keeps the default:
 * 5% of the purchase price.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE housing_units ADD COLUMN IF NOT EXISTS tax_coins INTEGER NULL CHECK (tax_coins >= 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE housing_units DROP COLUMN IF EXISTS tax_coins');
    }
};
