<?php

namespace Tests\Feature;

use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ShopSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_shop_seeder_preserves_existing_catalog_and_item_values_when_run_again(): void
    {
        $this->seed(ShopSeeder::class);

        $itemDefId = (int) DB::table('item_defs')
            ->where('code', 'lamp_study')
            ->value('item_def_id');

        DB::table('item_defs')->where('item_def_id', $itemDefId)->update([
            'name' => 'Stale lamp name',
            'rarity' => 0,
        ]);
        DB::table('shop_catalog_items')->where('item_def_id', $itemDefId)->update([
            'coins_price' => 9999,
            'price' => 9999,
            'stock_remaining' => 0,
            'is_active' => false,
            'is_published' => false,
        ]);

        $this->seed(ShopSeeder::class);

        $this->assertDatabaseHas('item_defs', [
            'item_def_id' => $itemDefId,
            'name' => 'Stale lamp name',
            'rarity' => 0,
        ]);
        $this->assertDatabaseHas('shop_catalog_items', [
            'item_def_id' => $itemDefId,
            'currency' => 'coins',
            'price' => 9999,
            'coins_price' => 9999,
            'stock_remaining' => 0,
            'is_active' => false,
            'is_published' => false,
        ]);
        $this->assertSame(
            1,
            DB::table('shop_catalog_items')->where('item_def_id', $itemDefId)->count()
        );
    }

    public function test_seeded_body_cosmetics_do_not_reference_a_missing_preview_file(): void
    {
        $this->seed(ShopSeeder::class);

        $this->assertDatabaseHas('item_defs', [
            'code' => 'COS_WEAR_BODY_DEFAULT',
            'preview_image' => null,
            'model_glb' => '/models/CharacterDefault.glb',
        ]);
    }

    public function test_starter_grants_and_reseeding_preserve_admin_edited_body_definition(): void
    {
        $this->seed(ShopSeeder::class);

        DB::table('item_defs')->where('code', 'COS_WEAR_BODY_DEFAULT')->update([
            'name' => 'Custom Campus Body',
            'rarity' => 4,
            'preview_image' => '/custom/body-preview.webp',
            'model_glb' => '/custom/body.glb',
        ]);

        $registration = $this->postJson('/api/register', [
            'email' => 'custom-body@test.com',
            'username' => 'custom_body_user',
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ]);
        $registration->assertCreated();

        $this->getJson('/api/inventory?kind=cosmetic', [
            'Authorization' => 'Bearer '.$registration->json('token'),
        ])->assertOk();
        $this->seed(ShopSeeder::class);

        $this->assertDatabaseHas('item_defs', [
            'code' => 'COS_WEAR_BODY_DEFAULT',
            'name' => 'Custom Campus Body',
            'rarity' => 4,
            'preview_image' => '/custom/body-preview.webp',
            'model_glb' => '/custom/body.glb',
        ]);
    }
}
