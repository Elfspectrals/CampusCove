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
        WHERE t.typname = 'container_type'
          AND e.enumlabel = 'storage_lot'
    ) THEN
        ALTER TYPE container_type ADD VALUE 'storage_lot';
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS storage_lots (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id                UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  source                   TEXT NOT NULL,
  container_id             BIGINT NOT NULL UNIQUE REFERENCES containers(container_id) ON DELETE RESTRICT,
  former_owner_account_id  BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  housing_unit_id          BIGINT NULL REFERENCES housing_units(unit_id) ON DELETE SET NULL,
  shop_value               INTEGER NOT NULL,
  opening_bid              INTEGER NOT NULL,
  nights_listed            INTEGER NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'listed',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at                TIMESTAMPTZ NULL,
  CONSTRAINT ck_storage_lots_source CHECK (source IN ('seized', 'generated')),
  CONSTRAINT ck_storage_lots_status CHECK (status IN ('listed', 'sold', 'destroyed')),
  CONSTRAINT ck_storage_lots_closed CHECK ((status = 'listed') = (closed_at IS NULL)),
  CONSTRAINT ck_storage_lots_values CHECK (shop_value >= 0 AND opening_bid > 0 AND nights_listed >= 0)
);
CREATE INDEX IF NOT EXISTS ix_storage_lots_status ON storage_lots(status);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS storage_lots');
    }
};
