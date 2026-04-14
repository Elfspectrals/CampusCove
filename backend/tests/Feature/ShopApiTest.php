<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ShopApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\ShopSeeder::class);
    }

    public function test_public_shop_catalog_lists_active_items(): void
    {
        $response = $this->getJson('/api/shop/items');

        $response->assertOk();
        $response->assertJsonStructure([
            'items' => [
                [
                    'shop_catalog_item_id',
                    'public_id',
                    'currency',
                    'price',
                    'allow_coins',
                    'coins_price',
                    'allow_premium',
                    'premium_price',
                    'is_active',
                    'is_published',
                    'is_unique_per_account',
                    'stock_remaining',
                    'sort_order',
                    'item' => [
                        'code',
                        'name',
                        'kind',
                    ],
                ],
            ],
        ]);
        $this->assertGreaterThanOrEqual(1, count($response->json('items')));
    }

    public function test_shop_catalog_filters_by_currency(): void
    {
        $response = $this->getJson('/api/shop/items?currency=premium');

        $response->assertOk();
        foreach ($response->json('items') as $item) {
            $this->assertTrue($item['allow_premium']);
        }
    }

    public function test_public_shop_catalog_hides_unpublished_items(): void
    {
        $row = DB::table('shop_catalog_items')->first();
        $this->assertNotNull($row);

        DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $row->shop_catalog_item_id)
            ->update(['is_published' => false, 'updated_at' => now()]);

        $response = $this->getJson('/api/shop/items');
        $response->assertOk();
        $ids = array_column($response->json('items'), 'shop_catalog_item_id');
        $this->assertNotContains($row->shop_catalog_item_id, $ids);
    }

    public function test_purchase_requires_authentication(): void
    {
        $publicId = DB::table('shop_catalog_items')->value('public_id');

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $publicId,
            'quantity' => 1,
        ])->assertUnauthorized();
    }

    public function test_purchase_success_returns_balance_after(): void
    {
        $catalog = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        $this->assertNotNull($catalog);

        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $response = $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $response->assertJsonPath('purchase.total_debit', (int) $catalog->price);
        $response->assertJsonPath('purchase.currency', 'coins');
        $this->assertIsInt($response->json('purchase.balance_after'));
        $this->assertSame(10_000 - (int) $catalog->price, $response->json('purchase.balance_after'));
    }

    public function test_purchase_increases_stackable_inventory_stacks(): void
    {
        $catalog = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'lamp_study')
            ->select('shop_catalog_items.*', 'item_defs.item_def_id')
            ->first();
        $this->assertNotNull($catalog);

        ['token' => $token, 'account_id' => $accountId] = $this->registerAndCreditWallet(10_000, 'coins');

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 2,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $containerId = DB::table('gift_inboxes')->where('account_id', $accountId)->value('container_id');
        $this->assertNotNull($containerId);

        $qty = (int) DB::table('inventory_stacks')
            ->where('container_id', $containerId)
            ->where('item_def_id', $catalog->item_def_id)
            ->value('quantity');
        $this->assertSame(2, $qty);
    }

    public function test_purchase_non_stackable_creates_item_instances(): void
    {
        $catalog = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'chair_campus_basic')
            ->select('shop_catalog_items.*', 'item_defs.item_def_id')
            ->first();
        $this->assertNotNull($catalog);

        ['token' => $token, 'account_id' => $accountId] = $this->registerAndCreditWallet(10_000, 'coins');

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $containerId = DB::table('gift_inboxes')->where('account_id', $accountId)->value('container_id');
        $this->assertNotNull($containerId);

        $count = (int) DB::table('item_instances')
            ->where('container_id', $containerId)
            ->where('item_def_id', $catalog->item_def_id)
            ->where('owner_account_id', $accountId)
            ->count();
        $this->assertSame(1, $count);
    }

    public function test_purchase_fails_when_insufficient_funds(): void
    {
        $catalog = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        $token = $this->registerAndCreditWallet(1, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'insufficient_funds');
    }

    public function test_purchase_with_dual_currency_requires_selection_and_uses_chosen_wallet(): void
    {
        $row = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        $this->assertNotNull($row);
        DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $row->shop_catalog_item_id)
            ->update([
                'allow_coins' => true,
                'coins_price' => 20,
                'allow_premium' => true,
                'premium_price' => 3,
                'updated_at' => now(),
            ]);

        $account = $this->registerAndCreditWallet(1000, 'coins');
        $token = $account['token'];
        $accountId = $account['account_id'];
        $premiumWalletId = (int) DB::table('wallets')->insertGetId([
            'owner_type' => 'account',
            'owner_id' => $accountId,
            'currency' => 'premium',
            'created_at' => now(),
        ], 'wallet_id');
        DB::table('wallet_ledger')->insert([
            'wallet_id' => $premiumWalletId,
            'tx_id' => null,
            'delta' => 10,
            'reason' => 'test_credit',
            'created_at' => now(),
        ]);

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertStatus(422)->assertJsonPath('code', 'currency_required');

        $response = $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'currency' => 'premium',
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $response->assertJsonPath('purchase.currency', 'premium');
        $response->assertJsonPath('purchase.total_debit', 3);
    }

    public function test_purchase_fails_for_unknown_public_id(): void
    {
        $token = $this->registerAndCreditWallet(5000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => '00000000-0000-4000-8000-000000000001',
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(404)
            ->assertJsonPath('code', 'invalid_shop_item');
    }

    public function test_purchase_fails_when_item_not_active(): void
    {
        $row = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $row->shop_catalog_item_id)
            ->update(['is_active' => false, 'updated_at' => now()]);

        $token = $this->registerAndCreditWallet(10_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'item_unavailable');
    }

    public function test_unique_item_cannot_be_purchased_twice(): void
    {
        $row = DB::table('shop_catalog_items')
            ->where('is_unique_per_account', true)
            ->where('currency', 'coins')
            ->first();
        $this->assertNotNull($row);

        $token = $this->registerAndCreditWallet(50_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])->assertOk();

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'already_owned');
    }

    public function test_stock_limited_item_returns_unavailable_when_exhausted(): void
    {
        $row = DB::table('shop_catalog_items')
            ->whereNotNull('stock_remaining')
            ->where('currency', 'coins')
            ->first();
        $this->assertNotNull($row);

        DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $row->shop_catalog_item_id)
            ->update(['stock_remaining' => 1, 'updated_at' => now()]);

        $tokenA = $this->registerAndCreditWallet(50_000, 'coins')['token'];
        $tokenB = $this->registerAndCreditWallet(50_000, 'coins')['token'];

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$tokenA,
        ])->assertOk();

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $row->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$tokenB,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'item_unavailable');
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
