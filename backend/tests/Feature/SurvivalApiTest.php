<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\SurvivalService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class SurvivalApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_new_player_starts_full(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');

        $this->getJson('/api/survival', $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('stats.health', 100)
            ->assertJsonPath('stats.hunger', 100)
            ->assertJsonPath('stats.thirst', 100);
    }

    public function test_only_the_realtime_server_can_save_stats(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $stats = ['health' => 100, 'hunger' => 100, 'thirst' => 100];

        $this->putJson('/api/survival', $stats, $this->auth($player['token']))
            ->assertForbidden()
            ->assertJsonPath('code', 'realtime_only');
        $this->putJson('/api/survival', $stats, $this->auth($player['token'], 'wrong'))
            ->assertForbidden();

        $this->putJson('/api/survival', ['health' => 140, 'hunger' => 42.5, 'thirst' => -3], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('stats.health', 100)
            ->assertJsonPath('stats.hunger', 42.5)
            ->assertJsonPath('stats.thirst', 0);
        $this->getJson('/api/survival', $this->auth($player['token']))->assertJsonPath('stats.hunger', 42.5);
    }

    public function test_eating_takes_one_portion_then_one_item(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $this->grant($player['account_id'], 'food_sandwich', 2);
        $headers = $this->auth($player['token'], self::SECRET);

        $first = $this->postJson('/api/survival/consume', ['code' => 'food_sandwich'], $headers)->assertOk();
        $first->assertJsonPath('consumed.hunger', 12)
            ->assertJsonPath('consumed.quantity', 2)
            ->assertJsonPath('consumed.portions', 4)
            ->assertJsonPath('consumed.portions_left', 3);
        $this->assertSame(3, $this->hotbarItem($player['token'], 'food_sandwich')['portions_left']);

        foreach ([2, 1] as $left) {
            $this->postJson('/api/survival/consume', ['code' => 'food_sandwich'], $headers)
                ->assertJsonPath('consumed.portions_left', $left);
        }
        $this->postJson('/api/survival/consume', ['code' => 'food_sandwich'], $headers)
            ->assertJsonPath('consumed.quantity', 1)
            ->assertJsonPath('consumed.portions_left', 4);

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/survival/consume', ['code' => 'food_sandwich'], $headers)->assertOk();
        }
        $this->postJson('/api/survival/consume', ['code' => 'food_sandwich'], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'no_item');
        $this->assertNull($this->hotbarItem($player['token'], 'food_sandwich'));
    }

    public function test_eating_needs_the_realtime_server_and_a_food_item(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $this->grant($player['account_id'], 'food_coffee', 1);

        $this->postJson('/api/survival/consume', ['code' => 'food_coffee'], $this->auth($player['token']))
            ->assertForbidden();
        $this->postJson('/api/survival/consume', ['code' => 'chair_campus_basic'], $this->auth($player['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'not_consumable');
        $this->postJson('/api/survival/consume', ['code' => 'food_coffee'], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('consumed.effect', 'speed_boost');
    }

    public function test_cooking_turns_a_raw_fish_into_a_grilled_one(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $this->grant($player['account_id'], 'food_fish_raw', 1);
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/survival/cook', ['code' => 'food_sandwich'], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'not_cookable');
        $this->postJson('/api/survival/cook', ['code' => 'food_fish_raw'], $headers)
            ->assertOk()
            ->assertJsonPath('cooked.code', 'food_fish_grilled');
        $this->assertNull($this->hotbarItem($player['token'], 'food_fish_raw'));
        $this->assertSame(1, $this->hotbarItem($player['token'], 'food_fish_grilled')['quantity']);
        $this->postJson('/api/survival/cook', ['code' => 'food_fish_raw'], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'no_item');
    }

    public function test_hospital_bill_never_goes_below_zero(): void
    {
        $rich = $this->registerAndCreditWallet(500, 'coins');
        $poor = $this->registerAndCreditWallet(15, 'coins');

        $this->postJson('/api/survival/hospital', [], $this->auth($rich['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('billed', SurvivalService::HOSPITAL_FEE);
        $this->postJson('/api/survival/hospital', [], $this->auth($poor['token'], self::SECRET))
            ->assertJsonPath('billed', 15);
        $this->postJson('/api/survival/hospital', [], $this->auth($poor['token'], self::SECRET))
            ->assertJsonPath('billed', 0);

        $this->assertSame(500 - SurvivalService::HOSPITAL_FEE, $this->balance($rich['account_id']));
        $this->assertSame(0, $this->balance($poor['account_id']));
    }

    public function test_food_is_sold_for_coins(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $catalogId = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', 'food_croissant')
            ->value('shop_catalog_items.shop_catalog_item_id');

        $this->postJson('/api/shop/purchase', ['shop_catalog_item_id' => $catalogId, 'quantity' => 2, 'currency' => 'coins'], $this->auth($player['token']))
            ->assertSuccessful();
        $croissant = $this->hotbarItem($player['token'], 'food_croissant');
        $this->assertSame(2, $croissant['quantity']);
        $this->assertSame(2, $croissant['portions_left']);
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        // the guard keeps the first user of the test otherwise
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
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $token = (string) $reg->json('token');

        $this->setWalletBalance($accountId, $currency, $coins);

        return ['token' => $token, 'account_id' => $accountId, 'username' => $username];
    }
}
