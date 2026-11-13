<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS lockpick_attempts (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  burglar_account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  unit_id             BIGINT NOT NULL REFERENCES housing_units(unit_id) ON DELETE CASCADE,
  misses              SMALLINT NOT NULL DEFAULT 0,
  outcome             TEXT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ NULL,
  CONSTRAINT ck_lockpick_attempts_misses CHECK (misses >= 0),
  CONSTRAINT ck_lockpick_attempts_outcome CHECK (outcome IS NULL OR outcome IN ('success', 'broke', 'abandoned')),
  CONSTRAINT ck_lockpick_attempts_ended CHECK ((outcome IS NULL) = (ended_at IS NULL))
);

CREATE INDEX IF NOT EXISTS ix_lockpick_attempts_burglar ON lockpick_attempts(burglar_account_id, ended_at) WHERE outcome = 'success';
CREATE INDEX IF NOT EXISTS ix_lockpick_attempts_unit ON lockpick_attempts(unit_id, ended_at) WHERE outcome = 'success';
CREATE UNIQUE INDEX IF NOT EXISTS ux_lockpick_attempts_open ON lockpick_attempts(burglar_account_id) WHERE outcome IS NULL;

CREATE TABLE IF NOT EXISTS lockpick_wear (
  account_id   BIGINT PRIMARY KEY REFERENCES accounts(account_id) ON DELETE CASCADE,
  uses_spent   SMALLINT NOT NULL,
  CONSTRAINT ck_lockpick_wear_uses CHECK (uses_spent BETWEEN 1 AND 5)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS lockpick_wear; DROP TABLE IF EXISTS lockpick_attempts;');
    }
};
