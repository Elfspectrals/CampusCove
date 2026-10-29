<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class TradeApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    private const TEE = 'COS_WEAR_TOP_TEE';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_only_the_realtime_server_can_execute_a_trade(): void
    {
        $alice = $this->registerAndCreditWallet(100, 'coins');
        $bob = $this->registerAndCreditWallet(0, 'coins');
        $body = $this->body($bob['account_id'], ['coins' => 100, 'items' => []], ['coins' => 0, 'items' => []]);

        $this->postJson('/api/trades/execute', $body, $this->auth($alice['token']))
            ->assertForbidden()
            ->assertJsonPath('code', 'realtime_only');
        $this->assertSame(100, $this->balance($alice['account_id']));
    }

    public function test_offerable_lists_coins_and_tradable_items_only(): void
    {
        $alice = $this->registerAndCreditWallet(250, 'coins');
        $this->grant($alice['account_id'], 'food_sandwich', 3);
        $this->grant($alice['account_id'], self::TEE, 1);
        $this->grant($alice['account_id'], 'COS_WEAR_TOP_HOODIE', 1);
        $this->wear($alice['account_id'], 'top', 'COS_WEAR_TOP_HOODIE');
        $this->grant($alice['account_id'], 'COS_WEAR_BODY_NEON_RONIN', 1);
        $this->grant($alice['account_id'], 'house_key', 1);

        $response = $this->getJson('/api/trades/offerable', $this->auth($alice['token']))->assertOk();

        $response->assertJsonPath('coins', 250);
        $codes = collect($response->json('items'))->pluck('quantity', 'code')->all();
        $this->assertSame(3, $codes['food_sandwich'] ?? null);
        $this->assertSame(1, $codes[self::TEE] ?? null);
        $this->assertArrayNotHasKey('COS_WEAR_TOP_HOODIE', $codes, 'worn clothes stay out of trades');
        $this->assertArrayNotHasKey('COS_WEAR_BODY_NEON_RONIN', $codes, 'premium skins are never tradable');
        $this->assertArrayNotHasKey('house_key', $codes);
        $this->assertArrayNotHasKey('COS_WEAR_TOP_DEFAULT', $codes, 'the free starter outfit is bound');
    }

    public function test_both_offers_are_swapped_in_one_transaction(): void
    {
        $alice = $this->registerAndCreditWallet(500, 'coins');
        $bob = $this->registerAndCreditWallet(40, 'coins');
        $this->grant($alice['account_id'], 'food_sandwich', 3);
        $this->grant($bob['account_id'], self::TEE, 1);

        $this->execute($alice, $bob['account_id'],
            ['coins' => 120, 'items' => [['code' => 'food_sandwich', 'quantity' => 2]]],
            ['coins' => 15, 'items' => [['code' => self::TEE, 'quantity' => 1]]],
        )->assertOk()
            ->assertJsonPath('my_coins', 500 - 120 + 15)
            ->assertJsonPath('partner_coins', 40 + 120 - 15);

        $this->assertSame(395, $this->balance($alice['account_id']));
        $this->assertSame(145, $this->balance($bob['account_id']));
        $this->assertSame(1, $this->owned($alice['token'], 'food_sandwich'));
        $this->assertSame(2, $this->owned($bob['token'], 'food_sandwich'));
        $this->assertSame(1, $this->owned($alice['token'], self::TEE));
        $this->assertSame(0, $this->owned($bob['token'], self::TEE));
        $this->assertSame(1, DB::table('transactions')->where('type', 'trade')->count());
    }

    public function test_a_player_cannot_trade_with_themselves(): void
    {
        $alice = $this->registerAndCreditWallet(100, 'coins');

        $this->execute($alice, $alice['account_id'], ['coins' => 10, 'items' => []], ['coins' => 10, 'items' => []])
            ->assertStatus(422)
            ->assertJsonPath('code', 'trade_self');
    }

    public function test_coins_are_checked_at_execution_time_and_nothing_moves_on_failure(): void
    {
        $alice = $this->registerAndCreditWallet(100, 'coins');
        $bob = $this->registerAndCreditWallet(30, 'coins');
        $this->grant($alice['account_id'], 'food_sandwich', 1);

        $this->execute($alice, $bob['account_id'],
            ['coins' => 0, 'items' => [['code' => 'food_sandwich', 'quantity' => 1]]],
            ['coins' => 31, 'items' => []],
        )->assertStatus(422)->assertJsonPath('code', 'trade_insufficient_coins');

        $this->assertSame(100, $this->balance($alice['account_id']));
        $this->assertSame(30, $this->balance($bob['account_id']));
        $this->assertSame(1, $this->owned($alice['token'], 'food_sandwich'));
        $this->assertSame(0, DB::table('transactions')->where('type', 'trade')->count());
    }

    public function test_items_no_longer_owned_fail_the_whole_trade(): void
    {
        $alice = $this->registerAndCreditWallet(100, 'coins');
        $bob = $this->registerAndCreditWallet(0, 'coins');
        $this->grant($alice['account_id'], 'food_sandwich', 1);

        $this->execute($alice, $bob['account_id'],
            ['coins' => 50, 'items' => [['code' => 'food_sandwich', 'quantity' => 2]]],
            ['coins' => 0, 'items' => []],
        )->assertStatus(422)->assertJsonPath('code', 'trade_item_missing');

        $this->assertSame(100, $this->balance($alice['account_id']));
        $this->assertSame(0, $this->balance($bob['account_id']));
        $this->assertSame(1, $this->owned($alice['token'], 'food_sandwich'));
    }

    public function test_premium_and_bound_items_cannot_be_traded(): void
    {
        $alice = $this->registerAndCreditWallet(0, 'coins');
        $bob = $this->registerAndCreditWallet(1000, 'coins');
        $this->grant($alice['account_id'], 'COS_WEAR_BODY_NEON_RONIN', 1);
        $this->grant($alice['account_id'], 'house_key', 1);

        foreach (['COS_WEAR_BODY_NEON_RONIN', 'house_key', 'COS_WEAR_TOP_DEFAULT'] as $code) {
            $this->execute($alice, $bob['account_id'],
                ['coins' => 0, 'items' => [['code' => $code, 'quantity' => 1]]],
                ['coins' => 1000, 'items' => []],
            )->assertStatus(422)->assertJsonPath('code', 'trade_item_not_tradable');
        }
        $this->assertSame(1000, $this->balance($bob['account_id']));
        $this->assertSame(0, DB::table('account_locker_cosmetics')
            ->where('account_id', $bob['account_id'])
            ->where('item_def_id', $this->def('COS_WEAR_BODY_NEON_RONIN')->item_def_id)
            ->count());
    }

    public function test_worn_clothes_must_be_taken_off_first(): void
    {
        $alice = $this->registerAndCreditWallet(0, 'coins');
        $bob = $this->registerAndCreditWallet(100, 'coins');
        $this->grant($alice['account_id'], self::TEE, 1);
        $this->wear($alice['account_id'], 'top', self::TEE);

        $this->execute($alice, $bob['account_id'],
            ['coins' => 0, 'items' => [['code' => self::TEE, 'quantity' => 1]]],
            ['coins' => 60, 'items' => []],
        )->assertStatus(422)->assertJsonPath('code', 'trade_item_worn');
    }

    public function test_a_player_cannot_receive_clothes_they_already_own(): void
    {
        $alice = $this->registerAndCreditWallet(0, 'coins');
        $bob = $this->registerAndCreditWallet(100, 'coins');
        $this->grant($alice['account_id'], self::TEE, 1);
        $this->grant($bob['account_id'], self::TEE, 1);

        $this->execute($alice, $bob['account_id'],
            ['coins' => 0, 'items' => [['code' => self::TEE, 'quantity' => 1]]],
            ['coins' => 60, 'items' => []],
        )->assertStatus(422)->assertJsonPath('code', 'trade_inventory_full');
    }

    public function test_a_trade_is_executed_only_once(): void
    {
        $alice = $this->registerAndCreditWallet(100, 'coins');
        $bob = $this->registerAndCreditWallet(0, 'coins');
        $offers = [['coins' => 40, 'items' => []], ['coins' => 0, 'items' => []]];

        $this->execute($alice, $bob['account_id'], ...$offers)->assertOk();
        $this->execute($alice, $bob['account_id'], ...$offers)
            ->assertStatus(409)
            ->assertJsonPath('code', 'trade_already_done');

        $this->assertSame(60, $this->balance($alice['account_id']));
        $this->assertSame(40, $this->balance($bob['account_id']));
    }

    public function test_an_empty_trade_is_refused(): void
    {
        $alice = $this->registerAndCreditWallet(100, 'coins');
        $bob = $this->registerAndCreditWallet(0, 'coins');

        $this->execute($alice, $bob['account_id'], ['coins' => 0, 'items' => []], ['coins' => 0, 'items' => []])
            ->assertStatus(422)
            ->assertJsonPath('code', 'trade_empty');
    }

    /**
     * @param  array{token: string}  $player
     * @param  array<string, mixed>  $myOffer
     * @param  array<string, mixed>  $partnerOffer
     */
    private function execute(array $player, int $partnerAccountId, array $myOffer, array $partnerOffer, string $ref = 'trade-1'): TestResponse
    {
        return $this->postJson(
            '/api/trades/execute',
            $this->body($partnerAccountId, $myOffer, $partnerOffer, $ref),
            $this->auth($player['token'], self::SECRET),
        );
    }

    /**
     * @param  array<string, mixed>  $myOffer
     * @param  array<string, mixed>  $partnerOffer
     * @return array<string, mixed>
     */
    private function body(int $partnerAccountId, array $myOffer, array $partnerOffer, string $ref = 'trade-1'): array
    {
        return ['partner_account_id' => $partnerAccountId, 'trade_ref' => $ref, 'my_offer' => $myOffer, 'partner_offer' => $partnerOffer];
    }

    private function auth(string $token, ?string $secret = null): array
    {
        // the guard keeps the first user of the test otherwise
        $this->app['auth']->forgetGuards();

        return array_filter([
            'Authorization' => 'Bearer '.$token,
            'X-Realtime-Secret' => $secret,
        ]);
    }

    private function def(string $code): ItemDef
    {
        return ItemDef::query()->where('code', $code)->firstOrFail();
    }

    private function grant(int $accountId, string $code, int $quantity): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, $this->def($code), $quantity);
    }

    private function wear(int $accountId, string $slot, string $code): void
    {
        DB::table('account_cosmetic_equipment')->updateOrInsert(
            ['account_id' => $accountId, 'slot' => $slot],
            ['item_def_id' => $this->def($code)->item_def_id, 'updated_at' => now()],
        );
    }

    private function owned(string $token, string $code): int
    {
        $items = $this->getJson('/api/inventory', $this->auth($token))->assertOk()->json('items');

        return (int) (collect($items)->firstWhere('code', $code)['quantity'] ?? 0);
    }

    private function balance(int $accountId): int
    {
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', 'coins')->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }

    /** @return array{token: string, account_id: int, username: string} */
    private function registerAndCreditWallet(int $coins, string $currency): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);

        $reg = $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $token = (string) $reg->json('token');

        $this->setWalletBalance($accountId, $currency, $coins);

        return ['token' => $token, 'account_id' => $accountId, 'username' => $username];
    }
}
