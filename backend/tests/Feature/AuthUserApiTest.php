<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuthUserApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_endpoint_includes_wallet_summary_with_zero_balances_for_new_account(): void
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
        $token = $reg->json('token');

        $reg->assertJsonPath('user.wallet_summary.coins', 0);
        $reg->assertJsonPath('user.wallet_summary.premium', 0);

        $response = $this->getJson('/api/user', [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $response->assertJsonStructure([
            'user' => [
                'account_id',
                'wallet_summary' => [
                    'coins',
                    'premium',
                ],
            ],
        ]);
        $response->assertJsonPath('user.wallet_summary.coins', 0);
        $response->assertJsonPath('user.wallet_summary.premium', 0);
    }

    public function test_user_endpoint_wallet_summary_matches_wallet_ledger_sums(): void
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

        $this->creditWallet($accountId, 'coins', 7_500);
        $this->creditWallet($accountId, 'premium', 42);
        $this->creditWallet($accountId, 'coins', -100);

        $response = $this->getJson('/api/user', [
            'Authorization' => 'Bearer '.$token,
        ]);

        $response->assertOk();
        $response->assertJsonPath('user.wallet_summary.coins', 7_400);
        $response->assertJsonPath('user.wallet_summary.premium', 42);
    }

    public function test_user_endpoint_reflects_balance_after_shop_purchase(): void
    {
        $this->seed(\Database\Seeders\ShopSeeder::class);

        $catalog = DB::table('shop_catalog_items')->where('currency', 'coins')->first();
        $this->assertNotNull($catalog);

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

        $this->creditWallet($accountId, 'coins', 10_000);

        $purchase = $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$token,
        ]);
        $purchase->assertOk();
        $expectedCoins = $purchase->json('purchase.balance_after');

        $user = $this->getJson('/api/user', [
            'Authorization' => 'Bearer '.$token,
        ]);
        $user->assertOk();
        $user->assertJsonPath('user.wallet_summary.coins', $expectedCoins);
        $user->assertJsonPath('user.wallet_summary.premium', 0);
    }

    private function creditWallet(int $accountId, string $currency, int $delta): void
    {
        $walletId = DB::table('wallets')->where([
            ['owner_type', '=', 'account'],
            ['owner_id', '=', $accountId],
            ['currency', '=', $currency],
        ])->value('wallet_id');

        if ($walletId === null) {
            $walletId = (int) DB::table('wallets')->insertGetId([
                'owner_type' => 'account',
                'owner_id' => $accountId,
                'currency' => $currency,
                'created_at' => now(),
            ], 'wallet_id');
        }

        DB::table('wallet_ledger')->insert([
            'wallet_id' => $walletId,
            'tx_id' => null,
            'delta' => $delta,
            'reason' => 'test_credit',
            'created_at' => now(),
        ]);
    }
}
