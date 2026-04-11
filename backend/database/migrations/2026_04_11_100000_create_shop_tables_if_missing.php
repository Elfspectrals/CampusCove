<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Incremental shop tables for databases that applied an older campus_cove_schema.sql
     * before shop was added. Fresh installs get these from 2025_02_02_000000_run_campus_cove_schema.
     */
    public function up(): void
    {
        if (Schema::hasTable('shop_catalog_items')) {
            return;
        }

        DB::unprepared(<<<'SQL'
CREATE TABLE shop_catalog_items (
  shop_catalog_item_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id              UUID NOT NULL DEFAULT gen_random_uuid(),
  item_def_id            BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  currency               currency_code NOT NULL,
  price                  BIGINT NOT NULL,
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  is_unique_per_account  BOOLEAN NOT NULL DEFAULT FALSE,
  stock_remaining        INT NULL,
  sort_order             INT NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_shop_catalog_price CHECK (price > 0),
  CONSTRAINT ck_shop_catalog_stock CHECK (stock_remaining IS NULL OR stock_remaining >= 0),
  UNIQUE(item_def_id, currency)
);

CREATE UNIQUE INDEX ux_shop_catalog_public_id ON shop_catalog_items(public_id);
CREATE INDEX ix_shop_catalog_active_sort ON shop_catalog_items(is_active, sort_order);

CREATE TABLE account_shop_purchases (
  purchase_id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id               BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  shop_catalog_item_id     BIGINT NOT NULL REFERENCES shop_catalog_items(shop_catalog_item_id) ON DELETE RESTRICT,
  tx_id                    BIGINT NOT NULL REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  quantity                 INT NOT NULL,
  unit_price               BIGINT NOT NULL,
  total_debit              BIGINT NOT NULL,
  currency                 currency_code NOT NULL,
  is_unique_at_purchase    BOOLEAN NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_shop_purchase_qty CHECK (quantity > 0),
  CONSTRAINT ck_shop_purchase_prices CHECK (unit_price > 0 AND total_debit > 0)
);

CREATE INDEX ix_account_shop_purchases_account ON account_shop_purchases(account_id, created_at);
CREATE INDEX ix_account_shop_purchases_catalog ON account_shop_purchases(shop_catalog_item_id);

CREATE UNIQUE INDEX ux_account_shop_purchase_unique
  ON account_shop_purchases(account_id, shop_catalog_item_id)
  WHERE is_unique_at_purchase = true;
SQL);
    }

    public function down(): void
    {
        if (! Schema::hasTable('account_shop_purchases')) {
            return;
        }

        DB::statement('DROP TABLE IF EXISTS account_shop_purchases CASCADE');
        DB::statement('DROP TABLE IF EXISTS shop_catalog_items CASCADE');
    }
};
