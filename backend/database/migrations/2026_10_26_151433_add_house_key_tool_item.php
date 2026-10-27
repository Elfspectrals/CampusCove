<?php

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        DB::statement(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'item_kind'
          AND e.enumlabel = 'tool'
    ) THEN
        ALTER TYPE item_kind ADD VALUE 'tool';
    END IF;
END $$;
SQL);

        DB::transaction(function (): void {
            $houseKey = ItemDef::query()->firstOrCreate(['code' => 'house_key'], [
                'name' => 'House key',
                'kind' => 'tool',
                'tradable' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'preview_image' => '/assets/items/tools/house_key/preview.png',
                'model_glb' => '/assets/items/tools/house_key/model.glb',
            ]);
            if (! $houseKey->wasRecentlyCreated) {
                return;
            }

            $ownerIds = DB::table('housing_units')
                ->where('status', 'occupied')
                ->whereNotNull('occupant_account_id')
                ->pluck('occupant_account_id');
            $coOwnerIds = DB::table('room_memberships')
                ->join('housing_units', 'housing_units.room_id', '=', 'room_memberships.room_id')
                ->where('housing_units.status', 'occupied')
                ->where('room_memberships.role', 'co_owner')
                ->pluck('room_memberships.account_id');

            $inventory = app(AccountInventoryService::class);
            foreach ($ownerIds->concat($coOwnerIds) as $accountId) {
                $inventory->grantItem((int) $accountId, $houseKey, 1);
            }
        });
    }

    public function down(): void
    {
        DB::transaction(function (): void {
            $houseKeyId = DB::table('item_defs')->where('code', 'house_key')->value('item_def_id');
            if ($houseKeyId === null) {
                return;
            }
            DB::table('inventory_stacks')->where('item_def_id', $houseKeyId)->delete();
            DB::table('item_instances')->where('item_def_id', $houseKeyId)->delete();
            DB::table('item_defs')->where('item_def_id', $houseKeyId)->delete();
        });
    }
};
