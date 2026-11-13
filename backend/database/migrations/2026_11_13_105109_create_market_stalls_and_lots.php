<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

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
          AND e.enumlabel = 'market_stall_fee'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'market_stall_fee';
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS market_stalls (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  market_date  DATE NOT NULL,
  stall_no     SMALLINT NOT NULL,
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  canopy       VARCHAR(10) NOT NULL,
  fee_tx_id    BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_market_stalls_stall UNIQUE (market_date, stall_no),
  CONSTRAINT uq_market_stalls_account UNIQUE (market_date, account_id),
  CONSTRAINT ck_market_stalls_no CHECK (stall_no BETWEEN 1 AND 6),
  CONSTRAINT ck_market_stalls_canopy CHECK (canopy IN ('red', 'blue', 'green', 'yellow', 'orange', 'purple'))
);

CREATE TABLE IF NOT EXISTS market_lots (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stall_id         BIGINT NOT NULL REFERENCES market_stalls(id) ON DELETE CASCADE,
  slot             SMALLINT NOT NULL,
  item_def_id      BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  quantity_listed  INTEGER NOT NULL,
  quantity_left    INTEGER NOT NULL,
  unit_price       INTEGER NOT NULL,
  status           VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ NULL,
  CONSTRAINT ck_market_lots_slot CHECK (slot BETWEEN 1 AND 6),
  CONSTRAINT ck_market_lots_quantity CHECK (quantity_listed > 0 AND quantity_left >= 0 AND quantity_left <= quantity_listed),
  CONSTRAINT ck_market_lots_price CHECK (unit_price BETWEEN 1 AND 1000000),
  CONSTRAINT ck_market_lots_status CHECK (status IN ('active', 'sold_out', 'withdrawn', 'returned')),
  CONSTRAINT ck_market_lots_active_has_stock CHECK (status <> 'active' OR quantity_left > 0),
  CONSTRAINT ck_market_lots_sold_out_empty CHECK (status <> 'sold_out' OR quantity_left = 0),
  CONSTRAINT ck_market_lots_closed CHECK ((status = 'active') = (closed_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_market_lots_active_slot ON market_lots(stall_id, slot) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS market_sales (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id            BIGINT NOT NULL REFERENCES market_lots(id) ON DELETE CASCADE,
  buyer_account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  quantity          INTEGER NOT NULL,
  unit_price        INTEGER NOT NULL,
  total             BIGINT NOT NULL,
  tax               BIGINT NOT NULL,
  purchase_ref      VARCHAR(64) NOT NULL UNIQUE,
  tx_id             BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_market_sales_amounts CHECK (quantity > 0 AND total = quantity::bigint * unit_price AND tax >= 0 AND tax <= total)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS market_sales; DROP TABLE IF EXISTS market_lots; DROP TABLE IF EXISTS market_stalls;');
    }
};
