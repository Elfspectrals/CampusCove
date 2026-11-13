<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE account_counters (
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  counter     TEXT NOT NULL,
  value       BIGINT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, counter),
  CONSTRAINT ck_account_counters_value CHECK (value >= 0)
);

CREATE TABLE account_task_tiers (
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  task        TEXT NOT NULL,
  tier        SMALLINT NOT NULL,
  reached_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, task, tier),
  CONSTRAINT ck_account_task_tiers_tier CHECK (tier BETWEEN 1 AND 3)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS account_task_tiers; DROP TABLE IF EXISTS account_counters;');
    }
};
