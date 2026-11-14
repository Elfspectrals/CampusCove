<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS sports_matches (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref         VARCHAR(64) NOT NULL UNIQUE,
  sport       VARCHAR(16) NOT NULL,
  venue       VARCHAR(64) NOT NULL,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_sports_matches_sport CHECK (sport IN (
    'football', 'basketball', 'swimming', 'diving', 'dance', 'boxing',
    'climbing', 'skating', 'running', 'tennis', 'petanque'
  )),
  CONSTRAINT ck_sports_matches_times CHECK (ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS ix_sports_matches_sport_ended ON sports_matches (sport, ended_at);

CREATE TABLE IF NOT EXISTS sports_match_players (
  match_id    BIGINT NOT NULL REFERENCES sports_matches(id) ON DELETE CASCADE,
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  team        VARCHAR(4) NULL,
  result      VARCHAR(8) NOT NULL,
  place       SMALLINT NULL,
  time_ms     INTEGER NULL,
  score       INTEGER NULL,
  PRIMARY KEY (match_id, account_id),
  CONSTRAINT ck_sports_match_players_team CHECK (team IS NULL OR team IN ('red', 'blue')),
  CONSTRAINT ck_sports_match_players_result CHECK (result IN ('win', 'loss', 'draw', 'finished', 'dnf')),
  CONSTRAINT ck_sports_match_players_place CHECK (place IS NULL OR place >= 1),
  CONSTRAINT ck_sports_match_players_time CHECK (time_ms IS NULL OR time_ms >= 0)
);
CREATE INDEX IF NOT EXISTS ix_sports_match_players_account ON sports_match_players (account_id);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS sports_match_players; DROP TABLE IF EXISTS sports_matches;');
    }
};
