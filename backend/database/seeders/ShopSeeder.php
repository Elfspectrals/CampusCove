<?php

namespace Database\Seeders;

use App\Services\StarterCosmeticGrantService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ShopSeeder extends Seeder
{
    private const LEGACY_BODY_PREVIEW_IMAGE = '/storage/skins/previews/placeholderSkin.jpg';

    /** @var array<string, string> */
    private const LEGACY_BODY_MODEL_BY_CODE = [
        'COS_WEAR_BODY_DEFAULT' => '/storage/skins/models/low_poly_character.glb',
        'COS_WEAR_BODY_ADVENTURER' => '/storage/skins/models/low_poly_adventurer.glb',
        'COS_WEAR_BODY_SWORDSMAN' => '/storage/skins/models/low_poly_character_swordsman.glb',
    ];

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
                'model_glb' => '/models/ChairCampusBasic.glb',
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
                'model_glb' => '/models/LampStudy.glb',
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
                'preview_image' => null,
                'model_glb' => '/models/CharacterDefault.glb',
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
                'preview_image' => null,
                'model_glb' => '/models/CharacterAdventurer.glb',
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
                'preview_image' => null,
                'model_glb' => '/models/CharacterSwordsman.glb',
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
            $existing = DB::table('item_defs')
                ->where('code', $def['code'])
                ->first(['item_def_id', 'preview_image', 'model_glb']);
            $values = [
                'name' => $def['name'],
                'kind' => $def['kind'],
                'rarity' => $def['rarity'],
                'tradable' => $def['tradable'],
                'premium_only' => $def['premium_only'],
                'bind' => $def['bind'],
                'max_stack' => $def['max_stack'],
                'cosmetic_slot' => $def['cosmetic_slot'] ?? null,
                'preview_image' => $def['preview_image'] ?? null,
                'model_glb' => $def['model_glb'] ?? null,
            ];

            if ($existing !== null) {
                $itemDefIds[$def['code']] = (int) $existing->item_def_id;
                $legacyUpdates = [];
                if ($existing->preview_image === self::LEGACY_BODY_PREVIEW_IMAGE) {
                    $legacyUpdates['preview_image'] = null;
                }
                $legacyModel = self::LEGACY_BODY_MODEL_BY_CODE[$def['code']] ?? null;
                if ($legacyModel !== null && $existing->model_glb === $legacyModel) {
                    $legacyUpdates['model_glb'] = $def['model_glb'];
                }
                if ($legacyUpdates !== []) {
                    DB::table('item_defs')
                        ->where('item_def_id', $existing->item_def_id)
                        ->update($legacyUpdates);
                }

                continue;
            }

            $insert = [
                'code' => $def['code'],
                ...$values,
                'created_at' => now(),
            ];

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
            $currency = $catalog['allow_coins'] ? 'coins' : 'premium';
            $existingCatalogId = DB::table('shop_catalog_items')
                ->where('item_def_id', $itemDefId)
                ->where('currency', $currency)
                ->value('shop_catalog_item_id');

            if ($existingCatalogId !== null) {
                continue;
            }

            DB::table('shop_catalog_items')->insert([
                'item_def_id' => $itemDefId,
                'currency' => $currency,
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
