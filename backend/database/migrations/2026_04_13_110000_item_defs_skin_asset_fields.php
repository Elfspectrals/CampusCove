<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('item_defs', 'preview_image')) {
            DB::statement('ALTER TABLE item_defs ADD COLUMN preview_image TEXT NULL');
        }

        if (! Schema::hasColumn('item_defs', 'model_glb')) {
            DB::statement('ALTER TABLE item_defs ADD COLUMN model_glb TEXT NULL');
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('item_defs', 'model_glb')) {
            DB::statement('ALTER TABLE item_defs DROP COLUMN model_glb');
        }

        if (Schema::hasColumn('item_defs', 'preview_image')) {
            DB::statement('ALTER TABLE item_defs DROP COLUMN preview_image');
        }
    }
};
