<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['housing_buy', 'housing_rent', 'housing_renew'] as $label) {
            $escaped = str_replace("'", "''", $label);
            DB::unprepared(<<<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = '{$escaped}'
    ) THEN
        ALTER TYPE tx_type ADD VALUE '{$escaped}';
    END IF;
END \$\$;
SQL);
        }

        // PDO binding in DO blocks is awkward; run per-value with unprepared literals.
        DB::unprepared(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'housing_offer_type'
    ) THEN
        CREATE TYPE housing_offer_type AS ENUM ('buy', 'rent');
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'housing_unit_status'
    ) THEN
        CREATE TYPE housing_unit_status AS ENUM ('vacant', 'occupied');
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS housing_units (
  unit_id BIGSERIAL PRIMARY KEY,
  public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  offer_type housing_offer_type NOT NULL,
  price_coins INTEGER NOT NULL CHECK (price_coins > 0),
  rent_duration_hours INTEGER NOT NULL DEFAULT 24 CHECK (rent_duration_hours > 0),
  pos_x DOUBLE PRECISION NOT NULL,
  pos_y DOUBLE PRECISION NOT NULL,
  pos_z DOUBLE PRECISION NOT NULL,
  size DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  base_color_hex VARCHAR(7) NOT NULL,
  status housing_unit_status NOT NULL DEFAULT 'vacant',
  occupant_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  room_id BIGINT NULL REFERENCES rooms(room_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT housing_units_buy_no_lease CHECK (
    offer_type <> 'buy' OR lease_expires_at IS NULL
  ),
  CONSTRAINT housing_units_occupied_consistency CHECK (
    (status = 'occupied' AND occupant_account_id IS NOT NULL)
    OR (status = 'vacant' AND occupant_account_id IS NULL AND lease_expires_at IS NULL)
  )
);
SQL);

        DB::unprepared(<<<'SQL'
CREATE UNIQUE INDEX IF NOT EXISTS housing_units_occupant_account_id_unique
  ON housing_units (occupant_account_id)
  WHERE occupant_account_id IS NOT NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS housing_units;');
        DB::unprepared('DROP TYPE IF EXISTS housing_unit_status;');
        DB::unprepared('DROP TYPE IF EXISTS housing_offer_type;');
    }
};
