<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
CREATE TABLE IF NOT EXISTS dance_runs (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ref         VARCHAR(64) NOT NULL,
  account_id  BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  song        VARCHAR(32) NOT NULL,
  difficulty  VARCHAR(8) NOT NULL,
  mode        VARCHAR(8) NOT NULL,
  score       INTEGER NOT NULL,
  full_combo  BOOLEAN NOT NULL,
  finished    BOOLEAN NOT NULL,
  team_key    VARCHAR(128) NULL,
  team_score  INTEGER NULL,
  week        CHAR(8) NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_dance_runs_ref_account UNIQUE (ref, account_id),
  CONSTRAINT ck_dance_runs_song CHECK (song IN ('harbour_sway', 'cove_groove', 'night_sprint')),
  CONSTRAINT ck_dance_runs_difficulty CHECK (difficulty IN ('easy', 'normal', 'hard')),
  CONSTRAINT ck_dance_runs_mode CHECK (mode IN ('solo', 'team', 'duel')),
  CONSTRAINT ck_dance_runs_score CHECK (score >= 0),
  CONSTRAINT ck_dance_runs_team CHECK (
    (mode = 'team' AND team_key IS NOT NULL AND team_score IS NOT NULL AND team_score >= 0)
    OR (mode <> 'team' AND team_key IS NULL AND team_score IS NULL)
  ),
  CONSTRAINT ck_dance_runs_week CHECK (week ~ '^[0-9]{4}-W[0-9]{2}$')
);
CREATE INDEX IF NOT EXISTS ix_dance_runs_board ON dance_runs (week, song, difficulty, mode);
SQL);
    }

    public function down(): void
    {
        DB::unprepared('DROP TABLE IF EXISTS dance_runs');
    }
};
