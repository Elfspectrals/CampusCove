<?php

namespace Database\Seeders;

use App\Services\StarterCosmeticGrantService;
use App\Support\FoodCatalog;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class ShopSeeder extends Seeder
{
    public function run(): void
    {
        $defs = [
            // ---- decoration (placeable in a house; assets in front/public/assets/decor/<key>/). Bought in the
            // Cove Home store (/game, east of the business district): its layout lists the same codes.
            self::decor('chair_campus_basic', 'Wooden Chair', 'wooden_chair', 1, 1),
            self::decor('lamp_study', 'Floor Lamp', 'floor_lamp', 2, 5),
            self::decor('decor_dining_table', 'Dining Table', 'dining_table', 2, 2),
            self::decor('decor_potted_plant', 'Potted Plant', 'potted_plant', 1, 10),
            self::decor('decor_bookshelf', 'Bookshelf', 'bookshelf', 3, 3),
            // ---- Cove Home range (sold in the Cove Home store; map-src/CampusCove/build_furniture.py)
            // living
            self::decor('decor_sofa_classic', 'Hamno Sofa', 'sofa_classic', 2, 2),
            self::decor('decor_sofa_corner', 'Vik Corner Sofa', 'sofa_corner', 3, 1),
            self::decor('decor_armchair_lounge', 'Lumi Armchair', 'armchair_lounge', 2, 4),
            self::decor('decor_coffee_table_round', 'Rund Coffee Table', 'coffee_table_round', 1, 2),
            self::decor('decor_tv_bench', 'Skarm TV Bench', 'tv_bench', 2, 1),
            self::decor('decor_side_table', 'Lilla Side Table', 'side_table', 1, 4),
            self::decor('decor_pouf_knit', 'Mjuk Pouf', 'pouf_knit', 1, 6),
            self::decor('decor_rug_round', 'Solrund Rug', 'rug_round', 1, 4),
            self::decor('decor_floor_lamp_arc', 'Bage Arc Lamp', 'floor_lamp_arc', 2, 3),
            // bedroom
            self::decor('decor_bed_double', 'Dromma Double Bed', 'bed_double', 2, 1),
            self::decor('decor_bed_single', 'Vila Single Bed', 'bed_single', 1, 2),
            self::decor('decor_nightstand', 'Natt Nightstand', 'nightstand', 1, 4),
            self::decor('decor_wardrobe', 'Garde Wardrobe', 'wardrobe', 2, 2),
            self::decor('decor_dresser', 'Lada Dresser', 'dresser', 1, 2),
            self::decor('decor_mirror_standing', 'Spegel Mirror', 'mirror_standing', 1, 3),
            // kitchen
            self::decor('decor_bar_stool', 'Hog Bar Stool', 'bar_stool', 1, 8),
            self::decor('decor_kitchen_counter', 'Kok Counter', 'kitchen_counter', 2, 4),
            self::decor('decor_fridge_retro', 'Kyl Retro Fridge', 'fridge_retro', 3, 1),
            self::decor('decor_stove_oven', 'Varme Stove', 'stove_oven', 2, 1),
            self::decor('decor_round_dining_table', 'Cirkel Dining Table', 'round_dining_table', 1, 2),
            self::decor('decor_dining_bench', 'Bank Bench', 'dining_bench', 1, 4),
            // office
            self::decor('decor_desk_study', 'Plugga Desk', 'desk_study', 1, 2),
            self::decor('decor_office_chair', 'Snurra Office Chair', 'office_chair', 1, 4),
            self::decor('decor_filing_cabinet', 'Arkiv Cabinet', 'filing_cabinet', 1, 4),
            self::decor('decor_desk_lamp', 'Ljus Desk Lamp', 'desk_lamp', 1, 6),
            self::decor('decor_computer_setup', 'Dator Battlestation', 'computer_setup', 3, 1),
            // bathroom
            self::decor('decor_bathtub', 'Bada Bathtub', 'bathtub', 2, 1),
            self::decor('decor_sink_vanity', 'Tvatt Vanity', 'sink_vanity', 1, 2),
            self::decor('decor_toilet', 'Toa Toilet', 'toilet', 1, 2),
            self::decor('decor_towel_rack', 'Handduk Towel Rack', 'towel_rack', 1, 4),
            // kids
            self::decor('decor_bunk_bed', 'Klattra Bunk Bed', 'bunk_bed', 3, 1),
            self::decor('decor_toy_chest', 'Leka Toy Chest', 'toy_chest', 1, 4),
            self::decor('decor_bean_bag', 'Sacko Bean Bag', 'bean_bag', 1, 6),
            self::decor('decor_arcade_cabinet', 'Pixel Arcade', 'arcade_cabinet', 4, 1),
            // storage
            self::decor('decor_cube_shelf', 'Kub Shelf', 'cube_shelf', 1, 3),
            self::decor('decor_coat_rack', 'Rock Coat Stand', 'coat_rack', 1, 4),
            // plants
            self::decor('decor_cactus', 'Taggig Cactus', 'cactus', 1, 10),
            self::decor('decor_monstera', 'Monstera Plant', 'monstera', 2, 6),
            self::decor('decor_vase_tulips', 'Tulpan Vase', 'vase_tulips', 1, 10),
            self::decor('decor_globe', 'Varld Globe', 'globe', 1, 4),
            self::decor('decor_aquarium', 'Akvarium Tank', 'aquarium', 3, 1),
            // outdoor
            self::decor('decor_garden_bench', 'Park Garden Bench', 'garden_bench', 1, 3),
            self::decor('decor_parasol', 'Sol Parasol', 'parasol', 1, 3),
            self::decor('decor_bbq_grill', 'Grilla BBQ', 'bbq_grill', 2, 2),
            self::decor('decor_sun_lounger', 'Slappna Sun Lounger', 'sun_lounger', 1, 4),
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
            array_merge(self::skin('COS_WEAR_BODY_DEFAULT', 'Campus Classic', 'campus_classic', 0, 99), [
                'model_glb' => '/assets/wear/base/model.glb',
            ]),
            self::skin('COS_WEAR_BODY_STREET_RUNNER', 'Street Runner', 'street_runner', 2),
            self::skin('COS_WEAR_BODY_SCHOLAR', 'Scholar', 'scholar', 2),
            self::skin('COS_WEAR_BODY_EXPLORER', 'Explorer', 'explorer', 3),
            self::skin('COS_WEAR_BODY_NIGHT_OWL', 'Night Owl', 'night_owl', 4, premiumOnly: true),
            // premium tier: semi-realistic, rigged skins (premium currency only)
            self::skin('COS_WEAR_BODY_NEON_RONIN', 'Neon Ronin', 'neon_ronin', 5, premiumOnly: true),
            self::skin('COS_WEAR_BODY_STREET_LUXE', 'Street Luxe', 'street_luxe', 5, premiumOnly: true),
            self::skin('COS_WEAR_BODY_ASTRAL_ORACLE', 'Astral Oracle', 'astral_oracle', 5, premiumOnly: true),
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
                'preview_image' => '/assets/wear/hair/basic/preview.png',
                'model_glb' => '/assets/wear/hair/basic/model.glb',
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
                'preview_image' => '/assets/wear/top/basic/preview.png',
                'model_glb' => '/assets/wear/top/basic/model.glb',
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
                'preview_image' => '/assets/wear/bottom/basic/preview.png',
                'model_glb' => '/assets/wear/bottom/basic/model.glb',
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
                'preview_image' => '/assets/wear/shoes/basic/preview.png',
                'model_glb' => '/assets/wear/shoes/basic/model.glb',
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
            self::wear('hair', 'short', 'Short Cut', 1),
            self::wear('hair', 'long', 'Long Hair', 1),
            self::wear('hair', 'curly', 'Curly Hair', 2),
            self::wear('hair', 'buzz', 'Buzz Cut', 1),
            self::wear('hair', 'ponytail', 'Ponytail', 2),
            self::wear('head_accessory', 'gamer', 'Gamer Headset', 2),
            self::wear('head_accessory', 'studio', 'Studio Headset', 3),
            self::wear('head_accessory', 'cat_ear', 'Cat-Ear Headset', 3),
            self::wear('head_accessory', 'neon', 'Neon Headset', 4),
            self::wear('head_accessory', 'pilot', 'Pilot Headset', 4),
            self::wear('top', 'tee', 'Classic Tee', 1),
            self::wear('top', 'hoodie', 'Zip Hoodie', 2),
            self::wear('top', 'varsity', 'Varsity Jacket', 3),
            self::wear('top', 'sweater', 'Knit Sweater', 2),
            self::wear('top', 'tank', 'Tank Top', 1),
            self::wear('bottom', 'jeans', 'Blue Jeans', 1),
            self::wear('bottom', 'joggers', 'Joggers', 1),
            self::wear('bottom', 'cargo', 'Cargo Pants', 2),
            self::wear('bottom', 'shorts', 'Shorts', 1),
            self::wear('bottom', 'skirt', 'Pleated Skirt', 2),
            self::wear('shoes', 'sneakers', 'Sneakers', 1),
            self::wear('shoes', 'high_tops', 'High-Tops', 2),
            self::wear('shoes', 'boots', 'Boots', 3),
            self::wear('shoes', 'slides', 'Slides', 1),
            self::wear('shoes', 'runners', 'Runners', 2),
        ];
        // ---- food and drinks (eaten from the hotbar; sold at the Campus Cafe counter)
        foreach (FoodCatalog::items() as $food) {
            $defs[] = self::food($food);
        }

        $itemDefIds = [];
        foreach ($defs as $def) {
            $existing = DB::table('item_defs')->where('code', $def['code'])->value('item_def_id');
            if ($existing !== null) {
                $itemDefIds[$def['code']] = (int) $existing;
                if (array_key_exists('portions', $def)) {
                    DB::table('item_defs')->where('code', $def['code'])->update(self::foodColumns($def));
                }
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
            if (array_key_exists('portions', $def)) {
                $insert = array_merge($insert, self::foodColumns($def));
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
            // Cove Home range — coins only, bought in the store (sort follows the showroom departments)
            self::coins('decor_sofa_classic', 450, 100),
            self::coins('decor_sofa_corner', 780, 101),
            self::coins('decor_armchair_lounge', 260, 102),
            self::coins('decor_coffee_table_round', 140, 103),
            self::coins('decor_tv_bench', 320, 104),
            self::coins('decor_side_table', 80, 105),
            self::coins('decor_pouf_knit', 60, 106),
            self::coins('decor_rug_round', 90, 107),
            self::coins('decor_floor_lamp_arc', 210, 108),
            self::coins('decor_bed_double', 520, 109),
            self::coins('decor_bed_single', 300, 110),
            self::coins('decor_nightstand', 90, 111),
            self::coins('decor_wardrobe', 380, 112),
            self::coins('decor_dresser', 240, 113),
            self::coins('decor_mirror_standing', 120, 114),
            self::coins('decor_bar_stool', 70, 115),
            self::coins('decor_kitchen_counter', 300, 116),
            self::coins('decor_fridge_retro', 420, 117),
            self::coins('decor_stove_oven', 360, 118),
            self::coins('decor_round_dining_table', 190, 119),
            self::coins('decor_dining_bench', 110, 120),
            self::coins('decor_desk_study', 200, 121),
            self::coins('decor_office_chair', 160, 122),
            self::coins('decor_filing_cabinet', 100, 123),
            self::coins('decor_desk_lamp', 50, 124),
            self::coins('decor_computer_setup', 480, 125),
            self::coins('decor_bathtub', 400, 126),
            self::coins('decor_sink_vanity', 220, 127),
            self::coins('decor_toilet', 150, 128),
            self::coins('decor_towel_rack', 45, 129),
            self::coins('decor_bunk_bed', 560, 130),
            self::coins('decor_toy_chest', 85, 131),
            self::coins('decor_bean_bag', 95, 132),
            self::coins('decor_arcade_cabinet', 900, 133),
            self::coins('decor_cube_shelf', 150, 134),
            self::coins('decor_coat_rack', 65, 135),
            self::coins('decor_cactus', 35, 136),
            self::coins('decor_monstera', 120, 137),
            self::coins('decor_vase_tulips', 40, 138),
            self::coins('decor_globe', 75, 139),
            self::coins('decor_aquarium', 340, 140),
            self::coins('decor_garden_bench', 170, 141),
            self::coins('decor_parasol', 130, 142),
            self::coins('decor_bbq_grill', 230, 143),
            self::coins('decor_sun_lounger', 190, 144),
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
            self::premium('COS_WEAR_BODY_NEON_RONIN', 300, 58),
            self::premium('COS_WEAR_BODY_STREET_LUXE', 250, 60),
            self::premium('COS_WEAR_BODY_ASTRAL_ORACLE', 350, 62),
            self::coins('COS_WEAR_HAIR_SHORT', 80, 300, unique: true),
            self::coins('COS_WEAR_HAIR_LONG', 120, 301, unique: true),
            self::coins('COS_WEAR_HAIR_CURLY', 150, 302, unique: true),
            self::coins('COS_WEAR_HAIR_BUZZ', 60, 303, unique: true),
            self::coins('COS_WEAR_HAIR_PONYTAIL', 130, 304, unique: true),
            self::coins('COS_WEAR_HEAD_ACCESSORY_GAMER', 200, 305, unique: true),
            self::coins('COS_WEAR_HEAD_ACCESSORY_STUDIO', 280, 306, unique: true),
            self::coins('COS_WEAR_HEAD_ACCESSORY_CAT_EAR', 320, 307, unique: true),
            self::coins('COS_WEAR_HEAD_ACCESSORY_NEON', 400, 308, unique: true),
            self::coins('COS_WEAR_HEAD_ACCESSORY_PILOT', 360, 309, unique: true),
            self::coins('COS_WEAR_TOP_TEE', 60, 310, unique: true),
            self::coins('COS_WEAR_TOP_HOODIE', 180, 311, unique: true),
            self::coins('COS_WEAR_TOP_VARSITY', 350, 312, unique: true),
            self::coins('COS_WEAR_TOP_SWEATER', 220, 313, unique: true),
            self::coins('COS_WEAR_TOP_TANK', 70, 314, unique: true),
            self::coins('COS_WEAR_BOTTOM_JEANS', 120, 315, unique: true),
            self::coins('COS_WEAR_BOTTOM_JOGGERS', 100, 316, unique: true),
            self::coins('COS_WEAR_BOTTOM_CARGO', 160, 317, unique: true),
            self::coins('COS_WEAR_BOTTOM_SHORTS', 70, 318, unique: true),
            self::coins('COS_WEAR_BOTTOM_SKIRT', 140, 319, unique: true),
            self::coins('COS_WEAR_SHOES_SNEAKERS', 150, 320, unique: true),
            self::coins('COS_WEAR_SHOES_HIGH_TOPS', 220, 321, unique: true),
            self::coins('COS_WEAR_SHOES_BOOTS', 300, 322, unique: true),
            self::coins('COS_WEAR_SHOES_SLIDES', 60, 323, unique: true),
            self::coins('COS_WEAR_SHOES_RUNNERS', 250, 324, unique: true),
        ];
        foreach (FoodCatalog::items() as $i => $food) {
            if ($food['price'] !== null) {
                $catalogRows[] = self::coins($food['code'], $food['price'], 200 + $i);
            }
        }

        foreach ($catalogRows as $catalog) {
            $itemDefId = $itemDefIds[$catalog['item_def_code']];

            $exists = DB::table('shop_catalog_items')->where('item_def_id', $itemDefId)->exists();
            if ($exists) {
                // The code is the reference for prices / order; is_active, is_published and
                // stock_remaining stay under the admin's control.
                DB::table('shop_catalog_items')->where('item_def_id', $itemDefId)->update([
                    'currency' => $catalog['allow_coins'] ? 'coins' : 'premium',
                    'price' => $catalog['allow_coins'] ? $catalog['coins_price'] : $catalog['premium_price'],
                    'allow_coins' => $catalog['allow_coins'],
                    'coins_price' => $catalog['coins_price'],
                    'allow_premium' => $catalog['allow_premium'],
                    'premium_price' => $catalog['premium_price'],
                    'is_unique_per_account' => $catalog['is_unique_per_account'],
                    'sort_order' => $catalog['sort_order'],
                    'updated_at' => now(),
                ]);

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

        $this->removeObsoleteItems(['COS_WEAR_BODY_ADVENTURER', 'COS_WEAR_BODY_SWORDSMAN']);

        foreach (DB::table('gift_inboxes')->cursor() as $gi) {
            app(StarterCosmeticGrantService::class)->ensureStarterCosmeticsForAccount((int) $gi->account_id);
        }
    }

    /**
     * Drops retired item definitions (old MVP skins) together with every row that references
     * them: shop listings, lockers, equipped slots, stacks and instances.
     *
     * @param  list<string>  $codes
     */
    private function removeObsoleteItems(array $codes): void
    {
        $ids = DB::table('item_defs')->whereIn('code', $codes)->pluck('item_def_id')->all();
        if ($ids === []) {
            return;
        }

        DB::transaction(function () use ($ids): void {
            foreach (['shop_catalog_items', 'account_locker_cosmetics', 'account_cosmetic_equipment', 'inventory_stacks', 'item_instances'] as $table) {
                DB::table($table)->whereIn('item_def_id', $ids)->delete();
            }
            DB::table('item_defs')->whereIn('item_def_id', $ids)->delete();
        });
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

    /**
     * @param array{code: string, name: string, asset: string, portions: int, hunger: int, thirst: int, health: int, effect: string|null, price: int|null, group: string} $food
     * @return array<string, mixed>
     */
    private static function food(array $food): array
    {
        return [
            'code' => $food['code'],
            'name' => $food['name'],
            'kind' => 'consumable',
            'rarity' => 1,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 20,
            'preview_image' => "/assets/items/{$food['group']}/{$food['asset']}/preview.png",
            'model_glb' => "/assets/items/{$food['group']}/{$food['asset']}/model.glb",
            'portions' => $food['portions'],
            'hunger_per_portion' => $food['hunger'],
            'thirst_per_portion' => $food['thirst'],
            'health_per_portion' => $food['health'],
            'consume_effect' => $food['effect'],
        ];
    }

    /**
     * @param array<string, mixed> $def
     * @return array<string, mixed>
     */
    private static function foodColumns(array $def): array
    {
        return [
            'portions' => $def['portions'],
            'hunger_per_portion' => $def['hunger_per_portion'],
            'thirst_per_portion' => $def['thirst_per_portion'],
            'health_per_portion' => $def['health_per_portion'],
            'consume_effect' => $def['consume_effect'],
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
    private static function wear(string $slot, string $key, string $name, int $rarity): array
    {
        return [
            'code' => 'COS_WEAR_'.strtoupper($slot).'_'.strtoupper($key),
            'name' => $name,
            'kind' => 'cosmetic',
            'rarity' => $rarity,
            'tradable' => false,
            'premium_only' => false,
            'bind' => 'bound',
            'max_stack' => 1,
            'cosmetic_slot' => $slot,
            'preview_image' => "/assets/wear/{$slot}/{$key}/preview.png",
            'model_glb' => "/assets/wear/{$slot}/{$key}/model.glb",
        ];
    }

    /** @return array<string, mixed> */
    private static function premium(string $code, int $price, int $sort): array
    {
        return array_merge(self::coins($code, 0, $sort, unique: true), [
            'allow_coins' => false,
            'coins_price' => null,
            'allow_premium' => true,
            'premium_price' => $price,
        ]);
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
