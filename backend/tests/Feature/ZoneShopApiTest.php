<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\OrchardService;
use App\Services\ZonePriceBook;
use App\Support\SaleCurve;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class ZoneShopApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    private const ZONE = 'test_zone';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
        file_put_contents($this->zoneFile(), json_encode([
            'version' => 1,
            'zone' => self::ZONE,
            'prices' => ['decor_bar_stool' => 5],
            'buyers' => ['farmer' => ['farm_corn' => ['price' => 4, 'quota' => 3, 'overPrice' => 1]]],
        ]));
    }

    protected function tearDown(): void
    {
        @unlink($this->zoneFile());
        parent::tearDown();
    }

    public function test_a_zone_checkout_charges_the_price_set_in_the_zone(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $stool = $this->catalogId('decor_bar_stool');

        $this->postJson('/api/zone/checkout', ['zone' => self::ZONE, 'items' => [$stool]], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('balance_after', 95)
            ->assertJsonPath('purchases.0.unit_price', 5);
        $this->assertSame(95, $this->balance($player['account_id']));
    }

    public function test_an_item_the_zone_does_not_sell_buys_nothing(): void
    {
        $player = $this->registerAndCreditWallet(1_000, 'coins');
        $items = [$this->catalogId('decor_bar_stool'), $this->catalogId('decor_sofa_classic')];

        $this->postJson('/api/zone/checkout', ['zone' => self::ZONE, 'items' => $items], $this->auth($player['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'not_sold_here');
        $this->assertSame(1_000, $this->balance($player['account_id']));
    }

    public function test_a_zone_without_a_price_list_sells_nothing(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');

        $this->postJson('/api/zone/checkout', ['zone' => 'nowhere', 'items' => [$this->catalogId('decor_bar_stool')]], $this->auth($player['token'], self::SECRET))
            ->assertNotFound()
            ->assertJsonPath('code', 'unknown_zone');
    }

    public function test_only_the_realtime_server_checks_out_in_a_zone(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');

        $this->postJson('/api/zone/checkout', ['zone' => self::ZONE, 'items' => [$this->catalogId('decor_bar_stool')]], $this->auth($player['token']))
            ->assertForbidden()
            ->assertJsonPath('code', 'realtime_only');
        $this->assertSame(100, $this->balance($player['account_id']));
    }

    public function test_every_committed_zone_price_list_is_valid(): void
    {
        $files = glob(resource_path('zones/*.json'));
        $this->assertNotEmpty($files);
        foreach ($files as $file) {
            $zone = basename($file, '.json');
            $book = json_decode((string) file_get_contents($file), true);
            $codes = [...array_keys(app(ZonePriceBook::class)->prices($zone)), ...array_merge([], ...array_map('array_keys', array_values($book['buyers'])))];
            foreach ($codes as $code) {
                $this->assertTrue(DB::table('item_defs')->where('code', $code)->exists(), "{$zone}: {$code} is not an item");
            }
        }
    }

    public function test_a_buyer_pays_the_full_price_up_to_the_daily_quota_then_the_lower_one(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $this->grant($player['account_id'], 'farm_corn', 7);
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/zone/sell', $this->sale(2), $headers)->assertOk()->assertJson(['sold' => 2, 'coins' => 8, 'full_price_left' => 1]);
        $this->postJson('/api/zone/sell', $this->sale(3), $headers)->assertOk()->assertJson(['sold' => 3, 'coins' => 6, 'full_price_left' => 0, 'balance_after' => 14]);
        $this->travel(1)->days();
        $this->travel(1)->seconds();
        $this->postJson('/api/zone/sell', $this->sale(2), $headers)->assertOk()->assertJson(['coins' => 8, 'full_price_left' => 1]);
        $this->assertSame(22, $this->balance($player['account_id']));
    }

    public function test_a_buyer_only_buys_what_the_player_holds_and_what_it_lists(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $this->grant($player['account_id'], 'farm_corn', 1);
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/zone/sell', $this->sale(2), $headers)->assertStatus(422)->assertJsonPath('code', 'not_enough_items');
        $this->postJson('/api/zone/sell', [...$this->sale(1), 'code' => 'farm_potato'], $headers)->assertStatus(422)->assertJsonPath('code', 'not_bought_here');
        $this->postJson('/api/zone/sell', [...$this->sale(1), 'area' => 'baker'], $headers)->assertStatus(422)->assertJsonPath('code', 'not_bought_here');
        $this->postJson('/api/zone/sell', $this->sale(1), $this->auth($player['token']))->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->assertSame(0, $this->balance($player['account_id']));
    }

    public function test_the_sale_curve_gives_the_same_coins_as_sharemath_ts(): void
    {
        $shared = json_decode((string) file_get_contents(base_path('tests/fixtures/sale_curve_vectors.json')), true);
        foreach ($shared['vectors'] as $v) {
            $this->assertSame(
                ['coins' => $v['coins'], 'full_price_left' => $v['fullPriceLeft']],
                SaleCurve::payout($v['curve']['price'], $v['curve']['quota'], $v['curve']['overPrice'], $v['soldToday'], $v['quantity']),
                json_encode($v)
            );
        }
        $this->assertSame(
            $shared['apple'],
            ['price' => OrchardService::APPLE_PRICE, 'quota' => OrchardService::DAILY_FULL_PRICE_APPLES, 'overPrice' => OrchardService::APPLE_PRICE_OVER_DAILY_QUOTA]
        );
    }

    /** @return array{zone: string, area: string, code: string, quantity: int} */
    private function sale(int $quantity): array
    {
        return ['zone' => self::ZONE, 'area' => 'farmer', 'code' => 'farm_corn', 'quantity' => $quantity];
    }

    private function grant(int $accountId, string $code, int $quantity): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', $code)->firstOrFail(), $quantity);
    }

    private function zoneFile(): string
    {
        return resource_path('zones/'.self::ZONE.'.json');
    }

    private function catalogId(string $code): int
    {
        $id = DB::table('shop_catalog_items')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'shop_catalog_items.item_def_id')
            ->where('item_defs.code', $code)
            ->value('shop_catalog_items.shop_catalog_item_id');
        $this->assertNotNull($id, $code);

        return (int) $id;
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
