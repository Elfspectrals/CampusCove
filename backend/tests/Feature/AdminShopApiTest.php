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

    public function test_admin_can_list_with_filters_sort_and_pagination(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

        $createA = $this->postJson('/api/admin/shop/items', [
            'code' => 'admin_list_sort_a',
            'name' => 'AAA Sort Item',
            'kind' => 'furniture',
            'prices' => ['coins' => 10],
            'is_active' => true,
            'is_published' => true,
            'sort_order' => 100,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $createA->assertCreated();

        $createZ = $this->postJson('/api/admin/shop/items', [
            'code' => 'admin_list_sort_z',
            'name' => 'ZZZ Sort Item',
            'kind' => 'misc',
            'prices' => ['premium' => 15],
            'is_active' => false,
            'is_published' => false,
            'sort_order' => 200,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $createZ->assertCreated();

        $response = $this->getJson('/api/admin/shop/items?kind=furniture&published=1&active=1&sort_by=name&sort_dir=asc&page=1&per_page=1', [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $response->assertJsonPath('meta.per_page', 1);
        $response->assertJsonPath('meta.current_page', 1);
        $response->assertJsonPath('data.0.item.kind', 'furniture');
        $response->assertJsonPath('data.0.is_published', true);
        $response->assertJsonPath('data.0.is_active', true);
    }

    public function test_admin_list_filters_query_and_currency_backward_compatible_params(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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

    public function test_admin_delete_soft_deletes_and_can_be_listed_when_deleted_filter_is_used(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

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

        $defaultList = $this->getJson('/api/admin/shop/items?q=to_delete', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $defaultList->assertOk();
        $this->assertCount(0, $defaultList->json('data'));

        $deletedOnly = $this->getJson('/api/admin/shop/items?deleted=only&q=to_delete', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $deletedOnly->assertOk();
        $deletedOnly->assertJsonPath('data.0.shop_catalog_item_id', $id);
        $deletedOnly->assertJsonPath('data.0.is_deleted', true);
    }

    public function test_admin_bulk_actions_publish_activate_soft_delete_and_restore(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

        $first = $this->postJson('/api/admin/shop/items', [
            'code' => 'bulk_item_1',
            'name' => 'Bulk Item 1',
            'kind' => 'misc',
            'prices' => ['coins' => 5],
            'is_active' => false,
            'is_published' => false,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $first->assertCreated();
        $firstId = (int) $first->json('item.shop_catalog_item_id');

        $second = $this->postJson('/api/admin/shop/items', [
            'code' => 'bulk_item_2',
            'name' => 'Bulk Item 2',
            'kind' => 'misc',
            'prices' => ['premium' => 8],
            'is_active' => true,
            'is_published' => true,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $second->assertCreated();
        $secondId = (int) $second->json('item.shop_catalog_item_id');

        $this->postJson('/api/admin/shop/items/bulk', [
            'action' => 'publish',
            'ids' => [$firstId],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk()->assertJsonPath('updated', 1);

        $this->postJson('/api/admin/shop/items/bulk', [
            'action' => 'activate',
            'ids' => [$firstId],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk()->assertJsonPath('updated', 1);

        $this->postJson('/api/admin/shop/items/bulk', [
            'action' => 'soft-delete',
            'ids' => [$firstId, $secondId],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk()->assertJsonPath('soft_deleted', 2);

        $this->postJson('/api/admin/shop/items/bulk', [
            'action' => 'restore',
            'ids' => [$firstId, $secondId],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk()->assertJsonPath('restored', 2);

        $withDeleted = $this->getJson('/api/admin/shop/items?deleted=with&q=bulk_item_', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $withDeleted->assertOk();
        $this->assertCount(2, $withDeleted->json('data'));
        foreach ($withDeleted->json('data') as $row) {
            $this->assertFalse($row['is_deleted']);
        }
    }

    public function test_admin_bulk_validation_rejects_unknown_ids(): void
    {
        $token = $this->registerToken(fn (int $id) => $this->setAdminFlag($id));

        $this->postJson('/api/admin/shop/items/bulk', [
            'action' => 'publish',
            'ids' => [999999999],
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertStatus(422)->assertJsonStructure(['message']);
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

    private function setAdminFlag(int $accountId): void
    {
        DB::table('accounts')->where('account_id', $accountId)->update([
            'is_admin' => true,
        ]);
    }

}
