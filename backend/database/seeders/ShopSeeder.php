<?php

namespace Database\Seeders;

use App\Services\StarterCosmeticGrantService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ShopSeeder extends Seeder
{
    public function run(): void
    {
        $defs = [
            // ---- decoration (placeable in a house; assets in front/public/assets/decor/<key>/)
            self::decor('chair_campus_basic', 'Wooden Chair', 'wooden_chair', 1, 1),
            self::decor('lamp_study', 'Floor Lamp', 'floor_lamp', 2, 5),
            self::decor('decor_dining_table', 'Dining Table', 'dining_table', 2, 2),
            self::decor('decor_potted_plant', 'Potted Plant', 'potted_plant', 1, 10),
            self::decor('decor_bookshelf', 'Bookshelf', 'bookshelf', 3, 3),
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
            // ---- skins (body slot; assets in front/public/assets/skins/<key>/). The default one is
            // granted for free by StarterCosmeticGrantService and is not sold.
            self::skin('COS_WEAR_BODY_DEFAULT', 'Campus Classic', 'campus_classic', 0, 99),
            self::skin('COS_WEAR_BODY_STREET_RUNNER', 'Street Runner', 'street_runner', 2),
            self::skin('COS_WEAR_BODY_SCHOLAR', 'Scholar', 'scholar', 2),
            self::skin('COS_WEAR_BODY_EXPLORER', 'Explorer', 'explorer', 3),
            self::skin('COS_WEAR_BODY_NIGHT_OWL', 'Night Owl', 'night_owl', 4, premiumOnly: true),
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
                        'name' => $def['name'],
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
            // decoration — coins only
            self::coins('chair_campus_basic', 90, 10),
            self::coins('lamp_study', 120, 20, stock: 100),
            self::coins('decor_dining_table', 160, 22),
            self::coins('decor_potted_plant', 60, 24),
            self::coins('decor_bookshelf', 220, 26),
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
            // paid skins (one per account); premium-only skins are never sold for coins
            self::coins('COS_WEAR_BODY_STREET_RUNNER', 400, 50, unique: true),
            self::coins('COS_WEAR_BODY_SCHOLAR', 600, 52, unique: true),
            self::coins('COS_WEAR_BODY_EXPLORER', 800, 54, unique: true),
            array_merge(self::coins('COS_WEAR_BODY_NIGHT_OWL', 1200, 56, unique: true), [
                'allow_coins' => false,
                'coins_price' => null,
                'allow_premium' => true,
                'premium_price' => 120,
            ]),
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

    /** @return array<string, mixed> */
    private static function decor(string $code, string $name, string $assetKey, int $rarity, int $maxStack): array
    {
        return [
            'code' => $code,
            'name' => $name,
            'kind' => 'furniture',
            'rarity' => $rarity,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => $maxStack,
            'preview_image' => "/assets/decor/{$assetKey}/preview.png",
            'model_glb' => "/assets/decor/{$assetKey}/model.glb",
        ];
    }

    /** @return array<string, mixed> */
    private static function skin(string $code, string $name, string $assetKey, int $rarity, int $maxStack = 1, bool $premiumOnly = false): array
    {
        return [
            'code' => $code,
            'name' => $name,
            'kind' => 'cosmetic',
            'rarity' => $rarity,
            'tradable' => false,
            'premium_only' => $premiumOnly,
            'bind' => 'bound',
            'max_stack' => $maxStack,
            'cosmetic_slot' => 'body',
            'preview_image' => "/assets/skins/{$assetKey}/preview.png",
            'model_glb' => "/assets/skins/{$assetKey}/model.glb",
        ];
    }

    /** @return array<string, mixed> */
    private static function coins(string $code, int $price, int $sort, ?int $stock = null, bool $unique = false): array
    {
        return [
            'item_def_code' => $code,
            'allow_coins' => true,
            'coins_price' => $price,
            'allow_premium' => false,
            'premium_price' => null,
            'is_active' => true,
            'is_published' => true,
            'is_unique_per_account' => $unique,
            'stock_remaining' => $stock,
            'sort_order' => $sort,
        ];
    }
}
