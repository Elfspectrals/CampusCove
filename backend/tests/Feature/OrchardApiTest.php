<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class OrchardApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_each_pick_puts_one_fresh_apple_in_the_inventory(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/orchard/pick', [], $headers)->assertOk()->assertExactJson(['code' => 'farm_apple', 'quantity' => 1]);
        $this->postJson('/api/orchard/pick', [], $headers)->assertOk()->assertExactJson(['code' => 'farm_apple', 'quantity' => 2]);

        $apple = $this->hotbarItem($player['token'], 'farm_apple');
        $this->assertSame(2, $apple['quantity']);
        $this->assertSame(2, $apple['portions_left']);
        $this->assertSame(0, $this->balance($player['account_id']));
    }

    public function test_picking_stops_once_the_stack_of_twenty_is_full(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $this->grant($player['account_id'], 'farm_apple', 19);

        $this->postJson('/api/orchard/pick', [], $headers)->assertOk()->assertJsonPath('quantity', 20);
        $this->postJson('/api/orchard/pick', [], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'basket_full');

        $this->assertSame(20, $this->hotbarItem($player['token'], 'farm_apple')['quantity']);
    }

    public function test_selling_apples_pays_three_coins_each_and_keeps_the_rest(): void
    {
        $player = $this->registerAndCreditWallet(10, 'coins');
        $this->grant($player['account_id'], 'farm_apple', 7);

        $this->postJson('/api/orchard/sell', ['quantity' => 5], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['sold' => 5, 'coins' => 15, 'balance_after' => 25]);

        $this->assertSame(25, $this->balance($player['account_id']));
        $this->assertSame(2, $this->hotbarItem($player['token'], 'farm_apple')['quantity']);
        $this->assertSame(1, DB::table('transactions')->where('type', 'reward')->where('created_by_account_id', $player['account_id'])->where('meta_json->source', 'orchard_sell')->count());
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'orchard_sell')->where('delta', 15)->count());
    }

    public function test_a_bitten_apple_cannot_be_sold(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $this->grant($player['account_id'], 'farm_apple', 2);
        $this->postJson('/api/survival/consume', ['code' => 'farm_apple'], $headers)->assertOk();

        $this->postJson('/api/orchard/sell', ['quantity' => 2], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'not_enough_apples');
        $this->postJson('/api/orchard/sell', ['quantity' => 1], $headers)
            ->assertOk()
            ->assertExactJson(['sold' => 1, 'coins' => 3, 'balance_after' => 3]);

        $apple = $this->hotbarItem($player['token'], 'farm_apple');
        $this->assertSame(1, $apple['quantity']);
        $this->assertSame(1, $apple['portions_left']);
    }

    public function test_selling_nothing_or_without_apples_is_refused(): void
    {
        $player = $this->registerAndCreditWallet(10, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/orchard/sell', ['quantity' => 0], $headers)->assertStatus(422)->assertJsonValidationErrors('quantity');
        $this->postJson('/api/orchard/sell', ['quantity' => 1], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'not_enough_apples');

        $this->assertSame(10, $this->balance($player['account_id']));
    }

    public function test_fresh_apples_are_not_sold_in_any_shop(): void
    {
        $codes = collect($this->getJson('/api/shop/items')->assertOk()->json('items'))
            ->map(fn (array $row) => $row['item']['code'])
            ->all();

        $this->assertNotContains('farm_apple', $codes);
        $this->assertSame('/assets/items/farm/apple/model.glb', ItemDef::query()->where('code', 'farm_apple')->value('model_glb'));
    }

    public function test_orchard_routes_need_the_realtime_server(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $this->grant($player['account_id'], 'farm_apple', 3);
        $headers = $this->auth($player['token']);

        $this->postJson('/api/orchard/pick', [], $headers)->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->postJson('/api/orchard/sell', ['quantity' => 3], $headers)->assertForbidden();

        $this->assertSame(3, $this->hotbarItem($player['token'], 'farm_apple')['quantity']);
        $this->assertSame(0, $this->balance($player['account_id']));
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter([
            'Authorization' => 'Bearer '.$token,
            'X-Realtime-Secret' => $secret,
        ]);
    }

    private function grant(int $accountId, string $code, int $quantity): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', $code)->firstOrFail(), $quantity);
    }

    /** @return array<string, mixed>|null */
    private function hotbarItem(string $token, string $code): ?array
    {
        $items = $this->getJson('/api/apartments/assets', $this->auth($token))->assertOk()->json('items');

        return collect($items)->firstWhere('code', $code);
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
