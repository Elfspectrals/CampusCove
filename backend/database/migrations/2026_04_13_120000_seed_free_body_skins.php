<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $hasPreviewImage = Schema::hasColumn('item_defs', 'preview_image');
        $hasModelGlb = Schema::hasColumn('item_defs', 'model_glb');

        $defs = [
            [
                'code' => 'COS_WEAR_BODY_DEFAULT',
                'name' => 'Campus Body (default)',
                'model_glb' => '/assets/models/low_poly_character.glb',
            ],
            [
                'code' => 'COS_WEAR_BODY_ADVENTURER',
                'name' => 'Campus Adventurer',
                'model_glb' => '/assets/models/low_poly_adventurer.glb',
            ],
            [
                'code' => 'COS_WEAR_BODY_SWORDSMAN',
                'name' => 'Campus Swordsman',
                'model_glb' => '/assets/models/low_poly_character_swordsman.glb',
            ],
        ];

        foreach ($defs as $def) {
            $existing = DB::table('item_defs')->where('code', $def['code'])->first();
            if ($existing === null) {
                $insert = [
                    'code' => $def['code'],
                    'name' => $def['name'],
                    'kind' => 'cosmetic',
                    'rarity' => 0,
                    'tradable' => false,
                    'premium_only' => false,
                    'bind' => 'bound',
                    'max_stack' => 99,
                    'cosmetic_slot' => 'body',
                    'created_at' => $now,
                ];
                if ($hasPreviewImage) {
                    $insert['preview_image'] = '/assets/image/placeholderSkin.jpg';
                }
                if ($hasModelGlb) {
                    $insert['model_glb'] = $def['model_glb'];
                }
                DB::table('item_defs')->insert($insert);
                continue;
            }

            $update = [
                'name' => $def['name'],
                'kind' => 'cosmetic',
                'rarity' => 0,
                'tradable' => false,
                'premium_only' => false,
                'bind' => 'bound',
                'max_stack' => 99,
                'cosmetic_slot' => 'body',
            ];
            if ($hasPreviewImage) {
                $update['preview_image'] = '/assets/image/placeholderSkin.jpg';
            }
            if ($hasModelGlb) {
                $update['model_glb'] = $def['model_glb'];
            }

            DB::table('item_defs')
                ->where('code', $def['code'])
                ->update($update);
        }
    }

    public function down(): void
    {
        DB::table('item_defs')
            ->whereIn('code', ['COS_WEAR_BODY_ADVENTURER', 'COS_WEAR_BODY_SWORDSMAN'])
            ->delete();
    }
};
