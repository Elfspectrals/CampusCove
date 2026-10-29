<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Player trades: the Cove Threads clothes (sold for coins) can change hands. Body skins, the free starter outfit
 * and anything premium-only stay bound to the account.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->clothes()->update(['tradable' => true, 'bind' => 'none']);
    }

    public function down(): void
    {
        $this->clothes()->update(['tradable' => false, 'bind' => 'bound']);
    }

    private function clothes(): \Illuminate\Database\Query\Builder
    {
        return DB::table('item_defs')
            ->where('kind', 'cosmetic')
            ->whereIn('cosmetic_slot', ['hair', 'head_accessory', 'top', 'bottom', 'shoes'])
            ->where('code', 'like', 'COS\_WEAR\_%')
            ->where('code', 'not like', '%\_DEFAULT')
            ->where('code', '!=', 'COS_WEAR_HEAD_EMPTY')
            ->where('premium_only', false);
    }
};
