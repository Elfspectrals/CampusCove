<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const LEGACY_BODY_SKIN_CODES = [
        'COS_WEAR_BODY_STREET_RUNNER',
        'COS_WEAR_BODY_SCHOLAR',
        'COS_WEAR_BODY_EXPLORER',
        'COS_WEAR_BODY_NIGHT_OWL',
        'COS_WEAR_BODY_NEON_RONIN',
        'COS_WEAR_BODY_STREET_LUXE',
        'COS_WEAR_BODY_ASTRAL_ORACLE',
    ];

    public function up(): void
    {
        $this->setLegacyBodySkinsActive(false);
    }

    public function down(): void
    {
        $this->setLegacyBodySkinsActive(true);
    }

    private function setLegacyBodySkinsActive(bool $active): void
    {
        DB::table('shop_catalog_items')
            ->whereIn('item_def_id', DB::table('item_defs')->whereIn('code', self::LEGACY_BODY_SKIN_CODES)->select('item_def_id'))
            ->update(['is_active' => $active, 'updated_at' => now()]);
    }
};
