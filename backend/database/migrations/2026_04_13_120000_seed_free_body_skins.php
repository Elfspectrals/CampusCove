<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const PREVIEW_IMAGE = '/storage/skins/previews/placeholderSkin.jpg';

    /** @var array<string, string> */
    private const MODEL_BY_CODE = [
        'COS_WEAR_BODY_DEFAULT' => '/storage/skins/models/low_poly_character.glb',
        'COS_WEAR_BODY_ADVENTURER' => '/storage/skins/models/low_poly_adventurer.glb',
        'COS_WEAR_BODY_SWORDSMAN' => '/storage/skins/models/low_poly_character_swordsman.glb',
    ];

    public function up(): void
    {
        $now = now();
        $hasPreviewImage = Schema::hasColumn('item_defs', 'preview_image');
        $hasModelGlb = Schema::hasColumn('item_defs', 'model_glb');

        $defs = [
            [
                'code' => 'COS_WEAR_BODY_DEFAULT',
                'name' => 'Campus Body (default)',
            ],
            [
                'code' => 'COS_WEAR_BODY_ADVENTURER',
                'name' => 'Campus Adventurer',
            ],
            [
                'code' => 'COS_WEAR_BODY_SWORDSMAN',
                'name' => 'Campus Swordsman',
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
                    $insert['preview_image'] = self::PREVIEW_IMAGE;
                }
                if ($hasModelGlb) {
                    $insert['model_glb'] = self::MODEL_BY_CODE[$def['code']];
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
                $update['preview_image'] = self::PREVIEW_IMAGE;
            }
            if ($hasModelGlb) {
                $update['model_glb'] = self::MODEL_BY_CODE[$def['code']];
            }

            DB::table('item_defs')
                ->where('code', $def['code'])
                ->update($update);
        }
    }

    public function down(): void
    {
        // Intentionally no-op: starter item defs are shared data and should not be hard-deleted on rollback.
    }
};
