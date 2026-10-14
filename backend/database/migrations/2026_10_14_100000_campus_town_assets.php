<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Campus town asset reboot (front/public/assets/, built in Blender):
 *  - housing_units.model_key links a unit to its house assets (houses/<model_key>/exterior|interior.glb).
 *  - Repoints existing item definitions at the new assets so nothing references deleted GLBs:
 *      COS_WEAR_BODY_DEFAULT  -> default skin "Campus Classic"
 *      chair_campus_basic     -> decor "Wooden Chair",  lamp_study -> decor "Floor Lamp"
 *  - Retires the old Adventurer / Swordsman bodies: owners keep the item, it now shows the default
 *    skin, and they are no longer sold.
 */
return new class extends Migration
{
    private const DEFAULT_SKIN_MODEL = '/assets/skins/campus_classic/model.glb';

    private const DEFAULT_SKIN_PREVIEW = '/assets/skins/campus_classic/preview.png';

    public function up(): void
    {
        // Idempotent: fresh installs already get the column from campus_cove_schema.sql.
        if (Schema::hasTable('housing_units') && ! Schema::hasColumn('housing_units', 'model_key')) {
            Schema::table('housing_units', function (Blueprint $table) {
                $table->string('model_key', 40)->nullable()->unique();
            });
        }

        if (! Schema::hasTable('item_defs')) {
            return;
        }

        $this->repoint('COS_WEAR_BODY_DEFAULT', 'Campus Classic', self::DEFAULT_SKIN_MODEL, self::DEFAULT_SKIN_PREVIEW);
        $this->repoint('chair_campus_basic', 'Wooden Chair', '/assets/decor/wooden_chair/model.glb', '/assets/decor/wooden_chair/preview.png');
        $this->repoint('lamp_study', 'Floor Lamp', '/assets/decor/floor_lamp/model.glb', '/assets/decor/floor_lamp/preview.png');

        foreach (['COS_WEAR_BODY_ADVENTURER', 'COS_WEAR_BODY_SWORDSMAN'] as $code) {
            DB::table('item_defs')->where('code', $code)->update([
                'model_glb' => self::DEFAULT_SKIN_MODEL,
                'preview_image' => self::DEFAULT_SKIN_PREVIEW,
            ]);
            if (Schema::hasTable('shop_catalog_items')) {
                $defId = DB::table('item_defs')->where('code', $code)->value('item_def_id');
                if ($defId !== null) {
                    DB::table('shop_catalog_items')->where('item_def_id', $defId)->update([
                        'is_active' => false,
                        'is_published' => false,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('housing_units', 'model_key')) {
            Schema::table('housing_units', function (Blueprint $table) {
                $table->dropColumn('model_key');   // drops its unique constraint too
            });
        }
    }

    private function repoint(string $code, string $name, string $model, string $preview): void
    {
        DB::table('item_defs')->where('code', $code)->update([
            'name' => $name,
            'model_glb' => $model,
            'preview_image' => $preview,
        ]);
    }
};
