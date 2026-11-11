<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Haircuts are part of the character now: every one is free in the character creator, so Cove Threads stops
 * selling them. The listings are switched off, not deleted (past purchases reference them).
 */
return new class extends Migration
{
    private const HAIRCUT_CODES = [
        'COS_WEAR_HAIR_SHORT',
        'COS_WEAR_HAIR_LONG',
        'COS_WEAR_HAIR_CURLY',
        'COS_WEAR_HAIR_BUZZ',
        'COS_WEAR_HAIR_PONYTAIL',
    ];

    public function up(): void
    {
        $this->setListingsActive(false);
    }

    public function down(): void
    {
        $this->setListingsActive(true);
    }

    private function setListingsActive(bool $active): void
    {
        DB::table('shop_catalog_items')
            ->whereIn('item_def_id', DB::table('item_defs')->whereIn('code', self::HAIRCUT_CODES)->select('item_def_id'))
            ->update(['is_active' => $active, 'is_published' => $active, 'updated_at' => now()]);
    }
};
