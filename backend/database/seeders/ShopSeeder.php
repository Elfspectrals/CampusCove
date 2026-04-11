<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ShopSeeder extends Seeder
{
    public function run(): void
    {
        $defs = [
            [
                'code' => 'chair_campus_basic',
                'name' => 'Campus Basic Chair',
                'kind' => 'furniture',
                'rarity' => 1,
                'tradable' => true,
                'premium_only' => false,
                'bind' => 'none',
                'max_stack' => 1,
            ],
            [
                'code' => 'lamp_study',
                'name' => 'Study Lamp',
                'kind' => 'furniture',
                'rarity' => 2,
                'tradable' => true,
                'premium_only' => false,
                'bind' => 'none',
                'max_stack' => 5,
            ],
            [
                'code' => 'emote_wave',
                'name' => 'Wave Emote',
                'kind' => 'cosmetic',
                'rarity' => 1,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 1,
            ],
            [
                'code' => 'title_freshman',
                'name' => 'Title: Freshman',
                'kind' => 'misc',
                'rarity' => 3,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'none',
                'max_stack' => 1,
            ],
        ];

        $itemDefIds = [];
        foreach ($defs as $def) {
            $existing = DB::table('item_defs')->where('code', $def['code'])->value('item_def_id');
            if ($existing !== null) {
                $itemDefIds[$def['code']] = (int) $existing;

                continue;
            }

            $itemDefIds[$def['code']] = (int) DB::table('item_defs')->insertGetId([
                ...$def,
                'created_at' => now(),
            ], 'item_def_id');
        }

        $catalogRows = [
            [
                'item_def_code' => 'chair_campus_basic',
                'currency' => 'coins',
                'price' => 250,
                'is_active' => true,
                'is_unique_per_account' => false,
                'stock_remaining' => null,
                'sort_order' => 10,
            ],
            [
                'item_def_code' => 'lamp_study',
                'currency' => 'coins',
                'price' => 120,
                'is_active' => true,
                'is_unique_per_account' => false,
                'stock_remaining' => 100,
                'sort_order' => 20,
            ],
            [
                'item_def_code' => 'emote_wave',
                'currency' => 'coins',
                'price' => 500,
                'is_active' => true,
                'is_unique_per_account' => true,
                'stock_remaining' => null,
                'sort_order' => 30,
            ],
            [
                'item_def_code' => 'title_freshman',
                'currency' => 'premium',
                'price' => 50,
                'is_active' => true,
                'is_unique_per_account' => true,
                'stock_remaining' => null,
                'sort_order' => 40,
            ],
        ];

        foreach ($catalogRows as $catalog) {
            $itemDefId = $itemDefIds[$catalog['item_def_code']];

            $exists = DB::table('shop_catalog_items')->where('item_def_id', $itemDefId)->exists();
            if ($exists) {
                continue;
            }

            DB::table('shop_catalog_items')->insert([
                'item_def_id' => $itemDefId,
                'currency' => $catalog['currency'],
                'price' => $catalog['price'],
                'is_active' => $catalog['is_active'],
                'is_unique_per_account' => $catalog['is_unique_per_account'],
                'stock_remaining' => $catalog['stock_remaining'],
                'sort_order' => $catalog['sort_order'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }
}
