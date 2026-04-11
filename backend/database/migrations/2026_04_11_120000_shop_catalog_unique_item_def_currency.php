<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Allow one catalog row per (item_def, currency) so the same definition can be sold in coins and premium.
     *
     * Idempotent: fresh installs already get UNIQUE(item_def_id, currency) from campus_cove_schema.sql.
     */
    public function up(): void
    {
        DB::statement('ALTER TABLE shop_catalog_items DROP CONSTRAINT IF EXISTS shop_catalog_items_item_def_id_key');

        $exists = DB::selectOne(
            <<<'SQL'
            SELECT 1 AS ok
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            WHERE t.relname = 'shop_catalog_items'
              AND c.conname = 'shop_catalog_items_item_def_id_currency_key'
              AND c.contype = 'u'
            SQL
        );

        if ($exists === null) {
            DB::statement(
                'ALTER TABLE shop_catalog_items ADD CONSTRAINT shop_catalog_items_item_def_id_currency_key UNIQUE (item_def_id, currency)'
            );
        }
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE shop_catalog_items DROP CONSTRAINT IF EXISTS shop_catalog_items_item_def_id_currency_key');
        DB::statement('ALTER TABLE shop_catalog_items ADD CONSTRAINT shop_catalog_items_item_def_id_key UNIQUE (item_def_id)');
    }
};
