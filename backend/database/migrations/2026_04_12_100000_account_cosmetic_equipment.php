<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('item_defs', 'cosmetic_slot')) {
            DB::statement('ALTER TABLE item_defs ADD COLUMN cosmetic_slot TEXT NULL');
            DB::statement(<<<'SQL'
ALTER TABLE item_defs ADD CONSTRAINT ck_item_defs_cosmetic_slot CHECK (
  cosmetic_slot IS NULL OR cosmetic_slot IN ('body','hair','top','bottom','shoes','head_accessory')
)
SQL);
        }

        if (! Schema::hasTable('account_cosmetic_equipment')) {
            DB::unprepared(<<<'SQL'
CREATE TABLE account_cosmetic_equipment (
  account_id   BIGINT NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
  slot         TEXT NOT NULL,
  item_def_id  BIGINT NOT NULL REFERENCES item_defs(item_def_id) ON DELETE RESTRICT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, slot),
  CONSTRAINT ck_account_cosmetic_slot CHECK (slot IN ('body','hair','top','bottom','shoes','head_accessory'))
);

CREATE INDEX ix_account_cosmetic_equipment_item ON account_cosmetic_equipment(item_def_id);
SQL);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('account_cosmetic_equipment')) {
            DB::statement('DROP TABLE IF EXISTS account_cosmetic_equipment CASCADE');
        }

        if (Schema::hasColumn('item_defs', 'cosmetic_slot')) {
            DB::statement('ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_cosmetic_slot');
            DB::statement('ALTER TABLE item_defs DROP COLUMN cosmetic_slot');
        }
    }
};
