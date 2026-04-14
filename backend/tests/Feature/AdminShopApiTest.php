<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdminShopApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\ShopSeeder::class);
    }

    public function test_admin_shop_requires_authentication(): void
    {
        $this->getJson('/api/admin/shop/items')->assertUnauthorized();
    }

    public function test_non_admin_cannot_access_admin_shop(): void
    {
        $token = $this->registerToken();

        $this->getJson('/api/admin/shop/items', [
            'Authorization' => 'Bearer '.$token,
        ])->assertForbidden();
    }

    public function test_admin_can_list_catalog_including_inactive(): void
    {
        $row = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $row->shop_catalog_item_id)
            ->update(['is_active' => false, 'updated_at' => now()]);

        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $response = $this->getJson('/api/admin/shop/items', [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $inactive = collect($response->json('data'))->firstWhere('shop_catalog_item_id', $row->shop_catalog_item_id);
        $this->assertNotNull($inactive);
        $this->assertFalse($inactive['is_active']);
    }

    public function test_admin_list_filters_by_query_currency_and_active(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $this->getJson('/api/admin/shop/items?q=Chair&currency=coins&is_active=1', [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertOk()
            ->assertJsonPath('data.0.item.name', 'Campus Basic Chair');

        $this->getJson('/api/admin/shop/items?currency=premium', [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertOk();

        $allPremium = $this->getJson('/api/admin/shop/items?currency=premium', [
            'Authorization' => 'Bearer '.$token,
        ])->json('data');
        foreach ($allPremium as $row) {
            $this->assertTrue($row['allow_premium']);
        }
    }

    public function test_admin_can_create_item_def_with_dual_currency_catalog_pricing(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $response = $this->postJson('/api/admin/shop/items', [
            'code' => 'admin_test_sofa',
            'name' => 'Admin Test Sofa',
            'kind' => 'furniture',
            'rarity' => 1,
            'preview_image' => '/assets/skins/admin_test_sofa-preview.png',
            'model_glb' => '/assets/skins/admin_test_sofa.glb',
            'prices' => [
                'coins' => 99,
                'premium' => 10,
            ],
            'sort_order' => 5,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('item.allow_coins', true);
        $response->assertJsonPath('item.coins_price', 99);
        $response->assertJsonPath('item.allow_premium', true);
        $response->assertJsonPath('item.premium_price', 10);
        $this->assertSame(url('/assets/skins/admin_test_sofa-preview.png'), $response->json('item.item.preview_image'));
        $this->assertSame(url('/assets/skins/admin_test_sofa.glb'), $response->json('item.item.model_glb'));
        $this->assertFalse($response->json('item.is_published'));

        $this->assertDatabaseHas('item_defs', ['code' => 'admin_test_sofa']);
    }

    public function test_admin_can_create_item_with_uploaded_skin_files(): void
    {
        Storage::fake('public');
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $response = $this->post('/api/admin/shop/items', [
            'code' => 'admin_uploaded_skin',
            'name' => 'Admin Uploaded Skin',
            'kind' => 'cosmetic',
            'cosmetic_slot' => 'body',
            'prices' => ['coins' => 150],
            'preview_image_file' => UploadedFile::fake()->image('preview.png'),
            'model_glb_file' => UploadedFile::fake()->create('skin.glb', 64, 'model/gltf-binary'),
        ], [
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ]);

        $response->assertCreated();
        $this->assertStringContainsString('/storage/skins/previews/', (string) $response->json('item.item.preview_image'));
        $this->assertStringContainsString('/storage/skins/models/', (string) $response->json('item.item.model_glb'));
        $this->assertStringStartsWith('http', (string) $response->json('item.item.preview_image'));
        $this->assertStringStartsWith('http', (string) $response->json('item.item.model_glb'));
    }

    public function test_admin_create_cosmetic_defaults_slot_and_coerces_kind_when_slot_is_set(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $defaults = $this->postJson('/api/admin/shop/items', [
            'code' => 'admin_cosmetic_default_slot',
            'name' => 'Admin Cosmetic Default Slot',
            'kind' => 'cosmetic',
            'prices' => ['coins' => 70],
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $defaults->assertCreated();
        $defaults->assertJsonPath('item.item.kind', 'cosmetic');
        $defaults->assertJsonPath('item.item.cosmetic_slot', 'body');

        $coerced = $this->postJson('/api/admin/shop/items', [
            'code' => 'admin_cosmetic_kind_coerced',
            'name' => 'Admin Cosmetic Kind Coerced',
            'kind' => 'misc',
            'cosmetic_slot' => 'body',
            'prices' => ['coins' => 80],
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $coerced->assertCreated();
        $coerced->assertJsonPath('item.item.kind', 'cosmetic');
        $coerced->assertJsonPath('item.item.cosmetic_slot', 'body');
    }

    public function test_admin_create_validation_requires_at_least_one_price(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $this->postJson('/api/admin/shop/items', [
            'code' => 'no_prices',
            'name' => 'X',
            'kind' => 'misc',
            'prices' => [],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['prices']);
    }

    public function test_admin_can_patch_catalog_and_item_fields(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $create = $this->postJson('/api/admin/shop/items', [
            'code' => 'patch_target',
            'name' => 'Patch Target',
            'kind' => 'misc',
            'prices' => ['coins' => 50],
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $create->assertCreated();
        $id = $create->json('item.shop_catalog_item_id');

        $patch = $this->patchJson('/api/admin/shop/items/'.$id, [
            'name' => 'Patched Name',
            'prices' => ['coins' => 75],
            'is_active' => false,
            'stock_remaining' => 3,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);

        $patch->assertOk();
        $patch->assertJsonPath('item.coins_price', 75);
        $patch->assertJsonPath('item.is_active', false);
        $patch->assertJsonPath('item.stock_remaining', 3);
        $patch->assertJsonPath('item.item.name', 'Patched Name');
    }

    public function test_admin_delete_returns_204(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $create = $this->postJson('/api/admin/shop/items', [
            'code' => 'to_delete',
            'name' => 'Delete Me',
            'kind' => 'misc',
            'prices' => ['coins' => 10],
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $id = $create->json('item.shop_catalog_item_id');

        $this->deleteJson('/api/admin/shop/items/'.$id, [], [
            'Authorization' => 'Bearer '.$token,
        ])->assertNoContent();
    }

    public function test_admin_delete_conflict_returns_409_when_purchases_exist(): void
    {
        $adminToken = $this->registerToken(fn (int $id) => $this->grantAdminRole($id));

        $create = $this->postJson('/api/admin/shop/items', [
            'code' => 'has_purchase',
            'name' => 'Has Purchase',
            'kind' => 'misc',
            'prices' => ['coins' => 20],
        ], [
            'Authorization' => 'Bearer '.$adminToken,
        ]);
        $catalogId = $create->json('item.shop_catalog_item_id');

        $buyerToken = $this->registerToken();
        $buyerId = $this->accountIdFromToken($buyerToken);

        $txId = (int) DB::table('transactions')->insertGetId([
            'server_id' => null,
            'type' => 'shop_purchase',
            'status' => 'committed',
            'created_by_account_id' => $buyerId,
            'created_at' => now(),
            'committed_at' => now(),
            'meta_json' => '{}',
        ], 'tx_id');

        DB::table('account_shop_purchases')->insert([
            'account_id' => $buyerId,
            'shop_catalog_item_id' => $catalogId,
            'tx_id' => $txId,
            'quantity' => 1,
            'unit_price' => 20,
            'total_debit' => 20,
            'currency' => 'coins',
            'is_unique_at_purchase' => false,
            'created_at' => now(),
        ]);

        $this->deleteJson('/api/admin/shop/items/'.$catalogId, [], [
            'Authorization' => 'Bearer '.$adminToken,
        ])
            ->assertStatus(409)
            ->assertJsonStructure(['message']);
    }

    /**
     * @param callable(int): void|null $afterRegister
     */
    private function registerToken(?callable $afterRegister = null): string
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);

        $reg = $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        if ($afterRegister !== null) {
            $afterRegister($accountId);
        }

        return $reg->json('token');
    }

    private function grantAdminRole(int $accountId): void
    {
        $roleId = DB::table('roles')->where('name', 'admin')->value('role_id');
        if ($roleId === null) {
            $roleId = DB::table('roles')->insertGetId([
                'name' => 'admin',
                'created_at' => now(),
            ], 'role_id');
        }

        DB::table('account_roles')->insertOrIgnore([
            'account_id' => $accountId,
            'role_id' => $roleId,
            'created_at' => now(),
        ]);
    }

    private function accountIdFromToken(string $token): int
    {
        $response = $this->getJson('/api/user', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $response->assertOk();

        return (int) $response->json('user.account_id');
    }
}
