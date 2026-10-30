<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountCosmeticService;
use App\Services\AccountInventoryService;
use App\Services\PubService;
use App\Services\SurvivalService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class PubApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_ordering_a_drink_debits_its_price_and_serves_one_glass(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');

        $this->postJson('/api/pub/order', ['code' => 'drink_stout'], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['code' => 'drink_stout', 'price' => 25, 'balance_after' => 75]);

        $this->assertSame(75, $this->balance($player['account_id']));
        $stout = $this->hotbarItem($player['token'], 'drink_stout');
        $this->assertSame(1, $stout['quantity']);
        $this->assertSame(3, $stout['portions_left']);
        $this->assertSame(1, DB::table('transactions')->where('type', 'pub_order')->where('created_by_account_id', $player['account_id'])->count());
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'pub_order')->where('delta', -25)->count());
    }

    public function test_the_bar_only_serves_its_drinks(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        foreach (['drink_mead', 'food_coffee', 'chair_campus_basic'] as $code) {
            $this->postJson('/api/pub/order', ['code' => $code], $headers)
                ->assertStatus(404)
                ->assertJsonPath('code', 'unknown_drink');
        }
        $this->assertSame(100, $this->balance($player['account_id']));
    }

    public function test_ordering_without_enough_coins_is_refused(): void
    {
        $player = $this->registerAndCreditWallet(24, 'coins');

        $this->postJson('/api/pub/order', ['code' => 'drink_stout'], $this->auth($player['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'insufficient_funds');

        $this->assertSame(24, $this->balance($player['account_id']));
        $this->assertNull($this->hotbarItem($player['token'], 'drink_stout'));
    }

    public function test_playing_charges_the_entry_fee_and_tells_the_alcohol_of_the_game(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $balance = 100;

        foreach (['drink_fast' => [20, 24], 'meter_shot' => [35, 50], 'darts' => [10, 0]] as $game => [$fee, $alcohol]) {
            $balance -= $fee;
            $this->postJson('/api/pub/play', ['game' => $game], $headers)
                ->assertOk()
                ->assertExactJson(['game' => $game, 'fee' => $fee, 'alcohol' => $alcohol, 'balance_after' => $balance]);
        }

        $this->assertSame($balance, $this->balance($player['account_id']));
        $this->assertSame(3, DB::table('transactions')->where('type', 'pub_play')->where('created_by_account_id', $player['account_id'])->count());
    }

    public function test_playing_an_unknown_game_or_without_coins_is_refused(): void
    {
        $player = $this->registerAndCreditWallet(19, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/pub/play', ['game' => 'poker'], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'unknown_game');
        $this->postJson('/api/pub/play', ['game' => 'drink_fast'], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'insufficient_funds');
        $this->postJson('/api/pub/reward', ['game' => 'poker', 'placement' => 1, 'score' => 0], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'unknown_game');

        $this->assertSame(19, $this->balance($player['account_id']));
    }

    /** @return array<string, array{string, int, int, int}> */
    public static function rewardTable(): array
    {
        return [
            'drink_fast 1st' => ['drink_fast', 1, 15000, 40],
            'drink_fast 2nd' => ['drink_fast', 2, 15000, 15],
            'drink_fast 3rd' => ['drink_fast', 3, 15000, 0],
            'drink_fast solo under 20 s' => ['drink_fast', 0, 19999, 15],
            'drink_fast solo over 20 s' => ['drink_fast', 0, 20000, 0],
            'meter_shot under 6 s' => ['meter_shot', 0, 5999, 30],
            'meter_shot 6 s' => ['meter_shot', 0, 6000, 15],
            'meter_shot under 9 s' => ['meter_shot', 0, 8999, 15],
            'meter_shot 9 s' => ['meter_shot', 0, 9000, 0],
            'darts 1st' => ['darts', 1, 79, 30],
            'darts 1st with bonus' => ['darts', 1, 80, 50],
            'darts 2nd' => ['darts', 2, 150, 0],
            'darts solo 45' => ['darts', 0, 45, 10],
            'darts solo under 45' => ['darts', 0, 44, 0],
        ];
    }

    /** @dataProvider rewardTable */
    public function test_rewards_follow_the_table(string $game, int $placement, int $score, int $coins): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');

        $this->postJson('/api/pub/reward', ['game' => $game, 'placement' => $placement, 'score' => $score], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['coins' => $coins, 'cooldown' => false, 'balance_after' => 100 + $coins]);

        $this->assertSame(100 + $coins, $this->balance($player['account_id']));
        $this->assertSame($coins > 0 ? 1 : 0, DB::table('transactions')->where('type', 'reward')->where('created_by_account_id', $player['account_id'])->where('meta_json->source', 'pub_reward_'.$game)->count());
        $this->assertSame($coins > 0 ? 1 : 0, DB::table('wallet_ledger')->where('reason', 'pub_reward_'.$game)->where('delta', $coins)->count());
    }

    public function test_one_reward_per_game_and_per_account_every_sixty_seconds(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $win = fn (string $game) => $this->postJson('/api/pub/reward', ['game' => $game, 'placement' => 1, 'score' => 50], $headers)->assertOk();

        $win('drink_fast')->assertJsonPath('coins', 40)->assertJsonPath('cooldown', false);
        $win('drink_fast')->assertExactJson(['coins' => 0, 'cooldown' => true, 'balance_after' => 140]);
        $win('darts')->assertJsonPath('coins', 30)->assertJsonPath('cooldown', false);
        $this->assertSame(170, $this->balance($player['account_id']));

        $this->travel(PubService::REWARD_COOLDOWN_SECONDS + 1)->seconds();
        $win('drink_fast')->assertExactJson(['coins' => 40, 'cooldown' => false, 'balance_after' => 210]);
        $this->assertSame(210, $this->balance($player['account_id']));
    }

    public function test_a_hangover_bills_forty_coins_and_nothing_else(): void
    {
        $player = $this->registerAndCreditWallet(500, 'coins');
        $accountId = $player['account_id'];
        foreach (['food_sandwich' => 3, 'decor_cactus' => 1, 'drink_lager' => 1, 'COS_WEAR_TOP_HOODIE' => 1] as $code => $qty) {
            $this->grant($accountId, $code, $qty);
        }
        app(AccountCosmeticService::class)->setLoadout($accountId, [
            'top' => (int) ItemDef::query()->where('code', 'COS_WEAR_TOP_HOODIE')->value('item_def_id'),
        ]);

        $this->postJson('/api/survival/hangover', [], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['billed' => SurvivalService::HANGOVER_FEE, 'balance_after' => 500 - SurvivalService::HANGOVER_FEE]);

        $this->assertSame(500 - SurvivalService::HANGOVER_FEE, $this->balance($accountId));
        $this->assertSame(3, $this->hotbarItem($player['token'], 'food_sandwich')['quantity']);
        $this->assertNotNull($this->hotbarItem($player['token'], 'decor_cactus'));
        $this->assertNotNull($this->hotbarItem($player['token'], 'drink_lager'));
        $this->assertSame('COS_WEAR_TOP_HOODIE', app(AccountCosmeticService::class)->getLoadout($accountId)['top']['code']);
        $this->assertTrue(DB::table('account_locker_cosmetics')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'account_locker_cosmetics.item_def_id')
            ->where('account_id', $accountId)
            ->where('item_defs.code', 'COS_WEAR_TOP_HOODIE')
            ->exists());
        $this->assertSame(1, DB::table('transactions')->where('type', 'hangover')->where('created_by_account_id', $accountId)->count());
    }

    public function test_a_hangover_bill_is_capped_at_the_balance(): void
    {
        $poor = $this->registerAndCreditWallet(15, 'coins');
        $headers = $this->auth($poor['token'], self::SECRET);

        $this->postJson('/api/survival/hangover', [], $headers)
            ->assertOk()
            ->assertExactJson(['billed' => 15, 'balance_after' => 0]);
        $this->postJson('/api/survival/hangover', [], $headers)
            ->assertOk()
            ->assertExactJson(['billed' => 0, 'balance_after' => 0]);

        $this->assertSame(0, $this->balance($poor['account_id']));
    }

    public function test_pub_routes_need_the_realtime_server(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $headers = $this->auth($player['token']);

        $this->postJson('/api/pub/order', ['code' => 'drink_stout'], $headers)->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->postJson('/api/pub/play', ['game' => 'darts'], $headers)->assertForbidden();
        $this->postJson('/api/pub/reward', ['game' => 'darts', 'placement' => 1, 'score' => 100], $headers)->assertForbidden();
        $this->postJson('/api/survival/hangover', [], $headers)->assertForbidden();

        $this->assertSame(100, $this->balance($player['account_id']));
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
