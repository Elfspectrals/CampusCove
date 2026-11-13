<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        foreach (['storage_bid_hold', 'storage_bid_refund'] as $type) {
            DB::unprepared(<<<SQL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = '{$type}'
    ) THEN
        ALTER TYPE tx_type ADD VALUE '{$type}';
    END IF;
END $$;
SQL);
        }

        DB::unprepared(<<<'SQL'
ALTER TABLE storage_lots
  ADD COLUMN IF NOT EXISTS generated_for DATE NULL,
  ADD COLUMN IF NOT EXISTS generated_slot SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS winner_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sale_price INTEGER NULL,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ NULL;

ALTER TABLE storage_lots
  ADD CONSTRAINT ck_storage_lots_generated CHECK ((source = 'generated') = (generated_for IS NOT NULL AND generated_slot IS NOT NULL)),
  ADD CONSTRAINT ck_storage_lots_sold CHECK ((status = 'sold') = (sale_price IS NOT NULL)),
  ADD CONSTRAINT ck_storage_lots_opened CHECK (opened_at IS NULL OR status = 'sold'),
  ADD CONSTRAINT uq_storage_lots_generated UNIQUE (generated_for, generated_slot);

CREATE TABLE IF NOT EXISTS storage_bids (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id          BIGINT NOT NULL REFERENCES storage_lots(id) ON DELETE CASCADE,
  account_id      BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  hold_tx_id      BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  refund_tx_id    BIGINT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_storage_bids_amount CHECK (amount > 0),
  CONSTRAINT uq_storage_bids_amount UNIQUE (lot_id, amount)
);
CREATE INDEX IF NOT EXISTS ix_storage_bids_lot ON storage_bids(lot_id, amount DESC);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
DROP TABLE IF EXISTS storage_bids;
ALTER TABLE storage_lots
  DROP CONSTRAINT IF EXISTS uq_storage_lots_generated,
  DROP CONSTRAINT IF EXISTS ck_storage_lots_opened,
  DROP CONSTRAINT IF EXISTS ck_storage_lots_sold,
  DROP CONSTRAINT IF EXISTS ck_storage_lots_generated,
  DROP COLUMN IF EXISTS opened_at,
  DROP COLUMN IF EXISTS sale_price,
  DROP COLUMN IF EXISTS winner_account_id,
  DROP COLUMN IF EXISTS generated_slot,
  DROP COLUMN IF EXISTS generated_for;
SQL);
    }
};
