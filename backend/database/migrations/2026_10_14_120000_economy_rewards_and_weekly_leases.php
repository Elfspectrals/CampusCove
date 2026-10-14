<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * - tx_type 'reward' for coins granted by the game (welcome bonus, future rewards).
 * - Rent leases last a week instead of a day (same price): a day of rent cost a full day of earnings.
 * - Night Owl becomes premium-only: premium skins are never sold for coins.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::unprepared(<<<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname = 'tx_type'
          AND e.enumlabel = 'reward'
    ) THEN
        ALTER TYPE tx_type ADD VALUE 'reward';
    END IF;
END $$;
SQL);

        DB::statement('ALTER TABLE housing_units ALTER COLUMN rent_duration_hours SET DEFAULT 168');
        DB::table('housing_units')
            ->where('offer_type', 'rent')
            ->where('rent_duration_hours', 24)
            ->update(['rent_duration_hours' => 168, 'updated_at' => now()]);

        $nightOwlId = DB::table('item_defs')->where('code', 'COS_WEAR_BODY_NIGHT_OWL')->value('item_def_id');
        if ($nightOwlId !== null) {
            DB::table('item_defs')->where('item_def_id', $nightOwlId)->update(['premium_only' => true]);
            DB::statement(<<<'SQL'
UPDATE shop_catalog_items
SET allow_coins = FALSE,
    coins_price = NULL,
    allow_premium = TRUE,
    premium_price = COALESCE(premium_price, 120),
    currency = 'premium',
    price = COALESCE(premium_price, 120),
    updated_at = now()
WHERE item_def_id = ?
SQL, [$nightOwlId]);
        }
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE housing_units ALTER COLUMN rent_duration_hours SET DEFAULT 24');
        DB::table('housing_units')
            ->where('offer_type', 'rent')
            ->where('rent_duration_hours', 168)
            ->update(['rent_duration_hours' => 24, 'updated_at' => now()]);

        $nightOwlId = DB::table('item_defs')->where('code', 'COS_WEAR_BODY_NIGHT_OWL')->value('item_def_id');
        if ($nightOwlId !== null) {
            DB::table('item_defs')->where('item_def_id', $nightOwlId)->update(['premium_only' => false]);
            DB::table('shop_catalog_items')->where('item_def_id', $nightOwlId)->update([
                'allow_coins' => true,
                'coins_price' => 1200,
                'currency' => 'coins',
                'price' => 1200,
                'updated_at' => now(),
            ]);
        }
        // Postgres cannot drop an enum value: 'reward' stays in tx_type.
    }
};
