<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS house_alarm_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  unit_id             BIGINT NOT NULL REFERENCES housing_units(unit_id) ON DELETE CASCADE,
  owner_account_id    BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  attempt_id          BIGINT NOT NULL UNIQUE REFERENCES lockpick_attempts(id) ON DELETE CASCADE,
  triggered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at             TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS ix_house_alarm_events_unseen ON house_alarm_events(owner_account_id) WHERE seen_at IS NULL;
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS house_alarm_events');
    }
};
