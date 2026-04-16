<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('shop_catalog_items', 'allow_coins')) {
            DB::statement('ALTER TABLE shop_catalog_items ADD COLUMN allow_coins BOOLEAN NOT NULL DEFAULT FALSE');
        }

        if (! Schema::hasColumn('shop_catalog_items', 'coins_price')) {
            DB::statement('ALTER TABLE shop_catalog_items ADD COLUMN coins_price BIGINT NULL');
        }

        if (! Schema::hasColumn('shop_catalog_items', 'allow_premium')) {
            DB::statement('ALTER TABLE shop_catalog_items ADD COLUMN allow_premium BOOLEAN NOT NULL DEFAULT FALSE');
        }

        if (! Schema::hasColumn('shop_catalog_items', 'premium_price')) {
            DB::statement('ALTER TABLE shop_catalog_items ADD COLUMN premium_price BIGINT NULL');
        }

        if (! Schema::hasColumn('shop_catalog_items', 'is_published')) {
            DB::statement('ALTER TABLE shop_catalog_items ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT TRUE');
        }

        DB::statement(<<<'SQL'
            UPDATE shop_catalog_items
            SET
                allow_coins = (currency = 'coins') OR (allow_coins = TRUE),
                coins_price = CASE
                    WHEN currency = 'coins' AND (coins_price IS NULL OR coins_price <= 0) THEN price
                    ELSE coins_price
                END,
                allow_premium = (currency = 'premium') OR (allow_premium = TRUE),
                premium_price = CASE
                    WHEN currency = 'premium' AND (premium_price IS NULL OR premium_price <= 0) THEN price
                    ELSE premium_price
                END
        SQL);

        DB::statement('ALTER TABLE shop_catalog_items DROP CONSTRAINT IF EXISTS ck_shop_catalog_pricing');
        DB::statement(<<<'SQL'
            ALTER TABLE shop_catalog_items
            ADD CONSTRAINT ck_shop_catalog_pricing CHECK (
                (allow_coins = TRUE AND coins_price IS NOT NULL AND coins_price > 0)
                OR
                (allow_premium = TRUE AND premium_price IS NOT NULL AND premium_price > 0)
            )
        SQL);
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE shop_catalog_items DROP CONSTRAINT IF EXISTS ck_shop_catalog_pricing');

        if (Schema::hasColumn('shop_catalog_items', 'is_published')) {
            DB::statement('ALTER TABLE shop_catalog_items DROP COLUMN is_published');
        }
        if (Schema::hasColumn('shop_catalog_items', 'premium_price')) {
            DB::statement('ALTER TABLE shop_catalog_items DROP COLUMN premium_price');
        }
        if (Schema::hasColumn('shop_catalog_items', 'allow_premium')) {
            DB::statement('ALTER TABLE shop_catalog_items DROP COLUMN allow_premium');
        }
        if (Schema::hasColumn('shop_catalog_items', 'coins_price')) {
            DB::statement('ALTER TABLE shop_catalog_items DROP COLUMN coins_price');
        }
        if (Schema::hasColumn('shop_catalog_items', 'allow_coins')) {
            DB::statement('ALTER TABLE shop_catalog_items DROP COLUMN allow_coins');
        }
    }
};
