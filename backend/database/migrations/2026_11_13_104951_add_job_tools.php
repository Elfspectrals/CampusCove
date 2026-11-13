<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const TOOLS = [
        ['code' => 'tool_secateurs', 'name' => 'Secateurs', 'max_uses' => 600],
        ['code' => 'tool_crowbar', 'name' => 'Crowbar', 'max_uses' => 300],
        ['code' => 'tool_hammer', 'name' => 'Hammer', 'max_uses' => 300],
        ['code' => 'tool_wrench', 'name' => 'Wrench', 'max_uses' => 300],
    ];

    public function up(): void
    {
        DB::unprepared(<<<'SQL'
ALTER TABLE item_defs
  ADD COLUMN IF NOT EXISTS max_uses INT NULL,
  ADD COLUMN IF NOT EXISTS weapon BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_max_uses;
ALTER TABLE item_defs ADD CONSTRAINT ck_item_defs_max_uses CHECK (max_uses IS NULL OR (max_uses > 0 AND max_stack = 1 AND kind = 'tool'));
ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_weapon;
ALTER TABLE item_defs ADD CONSTRAINT ck_item_defs_weapon CHECK (NOT weapon OR kind = 'tool');

ALTER TABLE item_instances ADD COLUMN IF NOT EXISTS uses_left INT NULL;
ALTER TABLE item_instances DROP CONSTRAINT IF EXISTS ck_item_instances_uses_left;
ALTER TABLE item_instances ADD CONSTRAINT ck_item_instances_uses_left CHECK (uses_left IS NULL OR uses_left > 0);
SQL);

        foreach (self::TOOLS as $tool) {
            $key = substr($tool['code'], strlen('tool_'));
            DB::table('item_defs')->updateOrInsert(['code' => $tool['code']], [
                'name' => $tool['name'],
                'kind' => 'tool',
                'tradable' => true,
                'bind' => 'none',
                'max_stack' => 1,
                'max_uses' => $tool['max_uses'],
                'weapon' => true,
                'preview_image' => "/assets/items/tools/{$key}/preview.png",
                'model_glb' => "/assets/items/tools/{$key}/model.glb",
            ]);
        }
    }

    public function down(): void
    {
        $codes = array_column(self::TOOLS, 'code');
        $ids = DB::table('item_defs')->whereIn('code', $codes)->pluck('item_def_id');
        DB::table('inventory_stacks')->whereIn('item_def_id', $ids)->delete();
        DB::table('item_instances')->whereIn('item_def_id', $ids)->delete();
        DB::table('item_defs')->whereIn('item_def_id', $ids)->delete();

        DB::unprepared(<<<'SQL'
ALTER TABLE item_instances DROP CONSTRAINT IF EXISTS ck_item_instances_uses_left;
ALTER TABLE item_instances DROP COLUMN IF EXISTS uses_left;
ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_weapon;
ALTER TABLE item_defs DROP CONSTRAINT IF EXISTS ck_item_defs_max_uses;
ALTER TABLE item_defs DROP COLUMN IF EXISTS weapon;
ALTER TABLE item_defs DROP COLUMN IF EXISTS max_uses;
SQL);
    }
};
