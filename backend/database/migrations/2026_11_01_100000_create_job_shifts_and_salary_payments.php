<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Paid jobs (docs/JOBS.md): one row per shift at a station, and one row per paid period of a shift. The coins
 * themselves stay in wallet_ledger (reason job_salary_<job>); job_salary_payments only makes each period payable
 * once (UNIQUE (shift_id, period)) and links it to its transaction.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE job_shifts (
  shift_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id       BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  job              TEXT NOT NULL,
  building_key     TEXT NOT NULL,
  station_id       TEXT NOT NULL,
  salary_coins     INTEGER NOT NULL CHECK (salary_coins >= 0),
  period_seconds   INTEGER NOT NULL CHECK (period_seconds > 0),
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ NULL,
  end_reason       TEXT NULL
);

-- one open shift per account: two concurrent starts cannot both succeed
CREATE UNIQUE INDEX ux_job_shifts_open_account ON job_shifts(account_id) WHERE ended_at IS NULL;
CREATE INDEX ix_job_shifts_open_activity ON job_shifts(last_activity_at) WHERE ended_at IS NULL;

CREATE TABLE job_salary_payments (
  payment_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id    BIGINT NOT NULL REFERENCES job_shifts(shift_id) ON DELETE CASCADE,
  period      INTEGER NOT NULL CHECK (period >= 1),
  coins       INTEGER NOT NULL CHECK (coins >= 0),
  tx_id       BIGINT NULL REFERENCES transactions(tx_id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ux_job_salary_payments_period UNIQUE (shift_id, period)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS job_salary_payments; DROP TABLE IF EXISTS job_shifts;');
    }
};
