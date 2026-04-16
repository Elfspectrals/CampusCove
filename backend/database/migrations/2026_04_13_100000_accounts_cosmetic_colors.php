<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('accounts', 'cosmetic_colors')) {
            DB::statement('ALTER TABLE accounts ADD COLUMN cosmetic_colors JSONB NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('accounts', 'cosmetic_colors')) {
            DB::statement('ALTER TABLE accounts DROP COLUMN cosmetic_colors');
        }
    }
};
