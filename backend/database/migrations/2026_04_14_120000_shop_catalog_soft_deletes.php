<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('shop_catalog_items', 'deleted_at')) {
            DB::statement('ALTER TABLE shop_catalog_items ADD COLUMN deleted_at TIMESTAMPTZ NULL');
        }

        DB::statement('CREATE INDEX IF NOT EXISTS ix_shop_catalog_deleted_at ON shop_catalog_items(deleted_at)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS ix_shop_catalog_deleted_at');

        if (Schema::hasColumn('shop_catalog_items', 'deleted_at')) {
            DB::statement('ALTER TABLE shop_catalog_items DROP COLUMN deleted_at');
        }
    }
};
