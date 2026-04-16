<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AccountLockerCosmeticsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_migration_backfills_legacy_cosmetic_rows_to_account_locker_scope(): void
    {
        $accountId = (int) DB::table('accounts')->insertGetId([
            'status' => 'active',
            'created_at' => now(),
        ], 'account_id');

        $containerId = (int) DB::table('containers')->insertGetId([
            'type' => 'gift_inbox',
            'created_at' => now(),
        ], 'container_id');
        DB::table('gift_inboxes')->insert([
            'account_id' => $accountId,
            'container_id' => $containerId,
            'created_at' => now(),
        ]);

        $cosmeticStackDefId = (int) DB::table('item_defs')->insertGetId([
            'code' => 'legacy_cosmetic_stack',
            'name' => 'Legacy Cosmetic Stack',
            'kind' => 'cosmetic',
            'rarity' => 1,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 99,
            'cosmetic_slot' => 'body',
            'created_at' => now(),
        ], 'item_def_id');
        $cosmeticInstanceDefId = (int) DB::table('item_defs')->insertGetId([
            'code' => 'legacy_cosmetic_instance',
            'name' => 'Legacy Cosmetic Instance',
            'kind' => 'cosmetic',
            'rarity' => 1,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 1,
            'cosmetic_slot' => 'top',
            'created_at' => now(),
        ], 'item_def_id');

        DB::table('inventory_stacks')->insert([
            'item_def_id' => $cosmeticStackDefId,
            'container_id' => $containerId,
            'quantity' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('item_instances')->insert([
            'item_def_id' => $cosmeticInstanceDefId,
            'owner_account_id' => $accountId,
            'owner_character_id' => null,
            'container_id' => $containerId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('account_locker_cosmetics')->delete();
        $migration = require base_path('database/migrations/2026_04_14_130000_account_locker_cosmetics.php');
        $migration->up();

        $this->assertSame(3, (int) DB::table('account_locker_cosmetics')
            ->where('account_id', $accountId)
            ->where('item_def_id', $cosmeticStackDefId)
            ->value('quantity'));
        $this->assertSame(1, (int) DB::table('account_locker_cosmetics')
            ->where('account_id', $accountId)
            ->where('item_def_id', $cosmeticInstanceDefId)
            ->value('quantity'));
    }
}
