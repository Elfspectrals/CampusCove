<?php

namespace Database\Seeders;

use App\Services\StarterCosmeticGrantService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ShopSeeder extends Seeder
{
    private const STARTER_BODY_PREVIEW_IMAGE = '/storage/skins/previews/placeholderSkin.jpg';

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
            [
                'code' => 'COS_WEAR_BODY_DEFAULT',
                'name' => 'Campus Body (default)',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'body',
                'preview_image' => self::STARTER_BODY_PREVIEW_IMAGE,
                'model_glb' => '/storage/skins/models/low_poly_character.glb',
            ],
            [
                'code' => 'COS_WEAR_BODY_ADVENTURER',
                'name' => 'Campus Adventurer',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'body',
                'preview_image' => self::STARTER_BODY_PREVIEW_IMAGE,
                'model_glb' => '/storage/skins/models/low_poly_adventurer.glb',
            ],
            [
                'code' => 'COS_WEAR_BODY_SWORDSMAN',
                'name' => 'Campus Swordsman',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'body',
                'preview_image' => self::STARTER_BODY_PREVIEW_IMAGE,
                'model_glb' => '/storage/skins/models/low_poly_character_swordsman.glb',
            ],
            [
                'code' => 'COS_WEAR_HAIR_DEFAULT',
                'name' => 'Campus Hair (default)',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'hair',
            ],
            [
                'code' => 'COS_WEAR_TOP_DEFAULT',
                'name' => 'Campus Hoodie',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'top',
            ],
            [
                'code' => 'COS_WEAR_BOTTOM_DEFAULT',
                'name' => 'Campus Pants',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'bottom',
            ],
            [
                'code' => 'COS_WEAR_SHOES_DEFAULT',
                'name' => 'Campus Sneakers',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'shoes',
            ],
            [
                'code' => 'COS_WEAR_HEAD_EMPTY',
                'name' => 'No head accessory',
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'head_accessory',
            ],
        ];

        $itemDefIds = [];
        foreach ($defs as $def) {
            $existing = DB::table('item_defs')->where('code', $def['code'])->value('item_def_id');
            if ($existing !== null) {
                $itemDefIds[$def['code']] = (int) $existing;
                if (array_key_exists('cosmetic_slot', $def) || array_key_exists('preview_image', $def) || array_key_exists('model_glb', $def)) {
                    DB::table('item_defs')->where('code', $def['code'])->update(array_filter([
                        'cosmetic_slot' => $def['cosmetic_slot'] ?? null,
                        'preview_image' => $def['preview_image'] ?? null,
                        'model_glb' => $def['model_glb'] ?? null,
                    ], static fn (mixed $value): bool => $value !== null));
                }

                continue;
            }

            $insert = [
                'code' => $def['code'],
                'name' => $def['name'],
                'kind' => $def['kind'],
                'rarity' => $def['rarity'],
                'tradable' => $def['tradable'],
                'premium_only' => $def['premium_only'],
                'bind' => $def['bind'],
                'max_stack' => $def['max_stack'],
                'created_at' => now(),
            ];
            if (array_key_exists('cosmetic_slot', $def)) {
                $insert['cosmetic_slot'] = $def['cosmetic_slot'];
            }
            if (array_key_exists('preview_image', $def)) {
                $insert['preview_image'] = $def['preview_image'];
            }
            if (array_key_exists('model_glb', $def)) {
                $insert['model_glb'] = $def['model_glb'];
            }

            $itemDefIds[$def['code']] = (int) DB::table('item_defs')->insertGetId($insert, 'item_def_id');
        }

        $catalogRows = [
            [
                'item_def_code' => 'chair_campus_basic',
                'allow_coins' => true,
                'coins_price' => 250,
                'allow_premium' => false,
                'premium_price' => null,
                'is_active' => true,
                'is_published' => true,
                'is_unique_per_account' => false,
                'stock_remaining' => null,
                'sort_order' => 10,
            ],
            [
                'item_def_code' => 'lamp_study',
                'allow_coins' => true,
                'coins_price' => 120,
                'allow_premium' => false,
                'premium_price' => null,
                'is_active' => true,
                'is_published' => true,
                'is_unique_per_account' => false,
                'stock_remaining' => 100,
                'sort_order' => 20,
            ],
            [
                'item_def_code' => 'emote_wave',
                'allow_coins' => true,
                'coins_price' => 500,
                'allow_premium' => false,
                'premium_price' => null,
                'is_active' => true,
                'is_published' => true,
                'is_unique_per_account' => true,
                'stock_remaining' => null,
                'sort_order' => 30,
            ],
            [
                'item_def_code' => 'title_freshman',
                'allow_coins' => false,
                'coins_price' => null,
                'allow_premium' => true,
                'premium_price' => 50,
                'is_active' => true,
                'is_published' => true,
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
                'currency' => $catalog['allow_coins'] ? 'coins' : 'premium',
                'price' => $catalog['allow_coins'] ? $catalog['coins_price'] : $catalog['premium_price'],
                'allow_coins' => $catalog['allow_coins'],
                'coins_price' => $catalog['coins_price'],
                'allow_premium' => $catalog['allow_premium'],
                'premium_price' => $catalog['premium_price'],
                'is_active' => $catalog['is_active'],
                'is_published' => $catalog['is_published'],
                'is_unique_per_account' => $catalog['is_unique_per_account'],
                'stock_remaining' => $catalog['stock_remaining'],
                'sort_order' => $catalog['sort_order'],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        foreach (DB::table('gift_inboxes')->cursor() as $gi) {
            app(StarterCosmeticGrantService::class)->ensureStarterCosmeticsForAccount((int) $gi->account_id);
        }
    }
}
