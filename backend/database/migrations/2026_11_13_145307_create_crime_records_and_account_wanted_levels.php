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
          AND e.enumlabel = 'jail_fine'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'jail_fine';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'police_licence'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'police_licence';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'jail_tax'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'jail_tax';
    END IF;
END $$;
SQL);

        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS crime_records (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  kind        VARCHAR(32) NOT NULL,
  stars       SMALLINT NOT NULL,
  victim_account_id BIGINT NULL REFERENCES accounts(account_id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_crime_records_kind CHECK (kind IN ('assault', 'murder', 'bag_theft', 'pickpocket_seen', 'pickpocket_failed', 'lockpick', 'alarm')),
  CONSTRAINT ck_crime_records_stars CHECK (stars BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS ix_crime_records_account_created ON crime_records (account_id, created_at);

CREATE TABLE IF NOT EXISTS account_wanted_levels (
  account_id  BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  stars       SMALLINT NOT NULL,
  decay_ms    INTEGER NOT NULL,
  jail_stars  SMALLINT NOT NULL DEFAULT 0,
  jail_ms     INTEGER NOT NULL DEFAULT 0,
  jail_kind   VARCHAR(8) NULL,
  jail_billed BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_account_wanted_levels_stars CHECK (stars BETWEEN 0 AND 5),
  CONSTRAINT ck_account_wanted_levels_decay CHECK (decay_ms BETWEEN 1 AND 240000),
  CONSTRAINT ck_account_wanted_levels_jail CHECK (
    (jail_kind IS NULL AND jail_stars = 0 AND jail_ms = 0 AND NOT jail_billed)
    OR (jail_kind = 'npc' AND jail_stars BETWEEN 1 AND 5 AND jail_ms BETWEEN 1 AND 600000)
    OR (jail_kind = 'officer' AND jail_stars = 0 AND jail_ms BETWEEN 1 AND 900000 AND NOT jail_billed)
  )
);

CREATE TABLE IF NOT EXISTS police_licences (
  account_id  BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  tx_id       BIGINT NOT NULL UNIQUE REFERENCES transactions(tx_id) ON DELETE RESTRICT,
  bought_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pickpocket_attempts (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  thief_account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  victim_account_id BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  outcome           VARCHAR(16) NOT NULL DEFAULT 'pending',
  item_def_id       BIGINT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  quantity          INTEGER NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken_at          TIMESTAMPTZ NULL,
  CONSTRAINT ck_pickpocket_attempts_outcome CHECK (outcome IN ('pending', 'failed', 'succeeded')),
  CONSTRAINT ck_pickpocket_attempts_self CHECK (thief_account_id <> victim_account_id),
  CONSTRAINT ck_pickpocket_attempts_loot CHECK (
    (taken_at IS NULL AND item_def_id IS NULL AND quantity IS NULL)
    OR (outcome = 'succeeded' AND taken_at IS NOT NULL AND item_def_id IS NOT NULL AND quantity >= 1)
  )
);
CREATE INDEX IF NOT EXISTS ix_pickpocket_attempts_thief_created ON pickpocket_attempts (thief_account_id, created_at);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS pickpocket_attempts; DROP TABLE IF EXISTS police_licences; DROP TABLE IF EXISTS account_wanted_levels; DROP TABLE IF EXISTS crime_records;');
    }
};
