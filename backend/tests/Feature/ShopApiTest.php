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
                    'is_active',
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
            $this->assertSame('premium', $item['currency']);
        }
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

        $token = $this->registerAndCreditWallet(10_000, 'coins');

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

    public function test_purchase_fails_when_insufficient_funds(): void
    {
        $catalog = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        $token = $this->registerAndCreditWallet(1, 'coins');

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ])
            ->assertStatus(422)
            ->assertJsonPath('code', 'insufficient_funds');
    }

    public function test_purchase_fails_for_unknown_public_id(): void
    {
        $token = $this->registerAndCreditWallet(5000, 'coins');

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

        $token = $this->registerAndCreditWallet(10_000, 'coins');

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

        $token = $this->registerAndCreditWallet(50_000, 'coins');

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

        $tokenA = $this->registerAndCreditWallet(50_000, 'coins');
        $tokenB = $this->registerAndCreditWallet(50_000, 'coins');

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

    private function registerAndCreditWallet(int $coins, string $currency): string
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
        $accountId = $reg->json('user.account_id');
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

        return $token;
    }
}
