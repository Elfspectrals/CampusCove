<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class InventoryApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\ShopSeeder::class);
    }

    public function test_inventory_requires_authentication(): void
    {
        $this->getJson('/api/inventory')->assertUnauthorized();
    }

    public function test_inventory_lists_items_after_purchase(): void
    {
        $catalog = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'chair_campus_basic')
            ->select('shop_catalog_items.*')
            ->first();
        $this->assertNotNull($catalog);

        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $response = $this->getJson('/api/inventory', [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $items = $response->json('items');
        $this->assertIsArray($items);
        $chair = collect($items)->firstWhere('code', 'chair_campus_basic');
        $this->assertNotNull($chair);
        $this->assertSame(1, $chair['quantity']);
        $this->assertSame('furniture', $chair['kind']);
        $this->assertArrayHasKey('preview_image', $chair);
        $this->assertArrayHasKey('model_glb', $chair);
    }

    public function test_inventory_filters_by_kind(): void
    {
        $chair = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'chair_campus_basic')
            ->select('shop_catalog_items.*')
            ->first();
        $this->assertNotNull($chair);

        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $chair->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $all = $this->getJson('/api/inventory', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $all->assertOk();
        $this->assertGreaterThanOrEqual(1, count($all->json('items')));

        $cosmeticOnly = $this->getJson('/api/inventory?kind=cosmetic', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $cosmeticOnly->assertOk();
        foreach ($cosmeticOnly->json('items') as $row) {
            $this->assertSame('cosmetic', $row['kind']);
        }
    }

    public function test_inventory_filters_by_q(): void
    {
        $lamp = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'lamp_study')
            ->select('shop_catalog_items.*')
            ->first();
        $this->assertNotNull($lamp);

        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $lamp->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $hit = $this->getJson('/api/inventory?q=Study', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $hit->assertOk();
        $this->assertGreaterThanOrEqual(1, count($hit->json('items')));

        $miss = $this->getJson('/api/inventory?q=zzznomatch', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $miss->assertOk();
        $this->assertSame([], $miss->json('items'));
    }

    public function test_purchased_body_cosmetic_is_visible_in_cosmetic_inventory_filter(): void
    {
        $itemDefId = (int) DB::table('item_defs')->insertGetId([
            'code' => 'cosmetic_shop_body_test',
            'name' => 'Cosmetic Shop Body Test',
            'kind' => 'cosmetic',
            'rarity' => 2,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 1,
            'cosmetic_slot' => 'body',
            'preview_image' => '/storage/skins/previews/test-body.jpg',
            'model_glb' => '/storage/skins/models/test-body.glb',
            'created_at' => now(),
        ], 'item_def_id');

        $publicId = DB::table('shop_catalog_items')->insertGetId([
            'item_def_id' => $itemDefId,
            'currency' => 'coins',
            'price' => 250,
            'allow_coins' => true,
            'coins_price' => 250,
            'allow_premium' => false,
            'premium_price' => null,
            'is_active' => true,
            'is_published' => true,
            'is_unique_per_account' => false,
            'stock_remaining' => null,
            'sort_order' => 99,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'shop_catalog_item_id');
        $this->assertGreaterThan(0, $publicId);

        $catalog = DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $publicId)
            ->first();
        $this->assertNotNull($catalog);

        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $response = $this->getJson('/api/inventory?kind=cosmetic', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $response->assertOk();

        $item = collect($response->json('items'))->firstWhere('code', 'cosmetic_shop_body_test');
        $this->assertNotNull($item);
        $this->assertSame('cosmetic', $item['kind']);
        $this->assertSame('body', $item['cosmetic_slot']);
        $this->assertSame(1, $item['quantity']);
        $this->assertStringStartsWith('http', (string) $item['preview_image']);
        $this->assertStringStartsWith('http', (string) $item['model_glb']);
    }

    /**
     * @return array{token: string, account_id: int}
     */
    private function registerAndCreditWallet(int $coins, string $currency): array
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
        $token = $reg->json('token');

        $walletId = (int) DB::table('wallets')->insertGetId([
            'owner_type' => 'account',
            'owner_id' => $accountId,
            'currency' => $currency,
            'created_at' => now(),
        ], 'wallet_id');

        DB::table('wallet_ledger')->insert([
            'wallet_id' => $walletId,
            'tx_id' => null,
            'delta' => $coins,
            'reason' => 'test_credit',
            'created_at' => now(),
        ]);

        return ['token' => $token, 'account_id' => $accountId];
    }
}
