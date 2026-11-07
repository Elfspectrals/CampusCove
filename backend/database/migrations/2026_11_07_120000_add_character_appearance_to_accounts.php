<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The character a player builds on first entering the game (docs/CHARACTER.md). Skin and hair colours live in
 * accounts.cosmetic_colors (body / hair) and the haircut in the hair equipment slot; these columns hold the rest.
 * Either nothing is set (the creator opens) or everything is, so a half-made character cannot be stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS character_sex TEXT NULL,
  ADD COLUMN IF NOT EXISTS character_face SMALLINT NULL,
  ADD COLUMN IF NOT EXISTS character_build TEXT NULL,
  ADD COLUMN IF NOT EXISTS character_created_at TIMESTAMPTZ NULL;

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_sex;
ALTER TABLE accounts ADD CONSTRAINT ck_accounts_character_sex CHECK (character_sex IN ('m', 'f'));
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_face;
ALTER TABLE accounts ADD CONSTRAINT ck_accounts_character_face CHECK (character_face BETWEEN 1 AND 6);
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_build;
ALTER TABLE accounts ADD CONSTRAINT ck_accounts_character_build CHECK (character_build IN ('slim', 'normal', 'broad'));
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_complete;
ALTER TABLE accounts ADD CONSTRAINT ck_accounts_character_complete CHECK (
  (character_created_at IS NULL AND character_sex IS NULL AND character_face IS NULL AND character_build IS NULL)
  OR (character_created_at IS NOT NULL AND character_sex IS NOT NULL AND character_face IS NOT NULL AND character_build IS NOT NULL)
);
SQL);
    }

    public function down(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_complete;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_build;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_face;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS ck_accounts_character_sex;
ALTER TABLE accounts
  DROP COLUMN IF EXISTS character_created_at,
  DROP COLUMN IF EXISTS character_build,
  DROP COLUMN IF EXISTS character_face,
  DROP COLUMN IF EXISTS character_sex;
SQL);
    }
};
