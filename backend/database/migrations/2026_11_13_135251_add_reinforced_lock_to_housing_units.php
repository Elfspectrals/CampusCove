<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared('ALTER TABLE housing_units ADD COLUMN IF NOT EXISTS reinforced_lock BOOLEAN NOT NULL DEFAULT false');
    }

    public function down(): void
    {
        DB::unprepared('ALTER TABLE housing_units DROP COLUMN IF EXISTS reinforced_lock');
    }
};
