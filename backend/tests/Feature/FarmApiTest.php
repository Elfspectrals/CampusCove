<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\FarmService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class FarmApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_each_pick_puts_one_crop_of_the_field_in_the_inventory(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/farm/pick', ['crop' => 'corn'], $headers)->assertOk()->assertExactJson(['code' => 'farm_corn', 'quantity' => 1]);
        $this->travel(FarmService::MIN_PICK_INTERVAL_MS)->milliseconds();
        $this->postJson('/api/farm/pick', ['crop' => 'potato'], $headers)->assertOk()->assertExactJson(['code' => 'farm_potato', 'quantity' => 1]);
        $this->travel(FarmService::MIN_PICK_INTERVAL_MS)->milliseconds();
        $this->postJson('/api/farm/pick', ['crop' => 'corn'], $headers)->assertOk()->assertExactJson(['code' => 'farm_corn', 'quantity' => 2]);
        $this->travel(FarmService::MIN_PICK_INTERVAL_MS)->milliseconds();
        $this->postJson('/api/farm/pick', ['crop' => 'pumpkin'], $headers)->assertOk()->assertExactJson(['code' => 'farm_pumpkin', 'quantity' => 1]);

        $this->assertSame(2, $this->hotbarItem($player['token'], 'farm_corn')['quantity']);
        $this->assertSame(1, $this->hotbarItem($player['token'], 'farm_potato')['quantity']);
        $this->assertSame(0, $this->balance($player['account_id']));
    }

    public function test_picks_of_one_account_are_at_least_two_and_a_half_seconds_apart_whatever_the_crop(): void
    {
        $this->freezeTime();
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/farm/pick', ['crop' => 'corn'], $headers)->assertOk();
        $this->travel(FarmService::MIN_PICK_INTERVAL_MS - 1)->milliseconds();
        $this->postJson('/api/farm/pick', ['crop' => 'potato'], $headers)->assertStatus(422)->assertJsonPath('code', 'pick_too_fast');
        $this->travel(1)->milliseconds();
        $this->postJson('/api/farm/pick', ['crop' => 'potato'], $headers)->assertOk();
    }

    public function test_picking_stops_once_the_stack_is_full(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $corn = ItemDef::query()->where('code', 'farm_corn')->firstOrFail();
        $this->grant($player['account_id'], 'farm_corn', $corn->max_stack);

        $this->postJson('/api/farm/pick', ['crop' => 'corn'], $headers)->assertStatus(422)->assertJsonPath('code', 'basket_full');

        $this->assertSame($corn->max_stack, $this->hotbarItem($player['token'], 'farm_corn')['quantity']);
    }

    public function test_an_unknown_crop_is_refused(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');

        $this->postJson('/api/farm/pick', ['crop' => 'apple'], $this->auth($player['token'], self::SECRET))->assertStatus(422)->assertJsonValidationErrors('crop');
        $this->assertNull($this->hotbarItem($player['token'], 'farm_apple'));
    }

    /** GreenCart sells the crops (decided 2026-11-12), always above what the farm stand pays (ZoneShopApiTest). */
    public function test_crops_are_sold_in_the_shop_with_their_farm_model(): void
    {
        $codes = collect($this->getJson('/api/shop/items')->assertOk()->json('items'))
            ->map(fn (array $row) => $row['item']['code'])
            ->all();

        foreach (FarmService::CROPS as $crop => $code) {
            $this->assertContains($code, $codes);
            $this->assertSame("/assets/items/farm/{$crop}/model.glb", ItemDef::query()->where('code', $code)->value('model_glb'));
        }
    }

    public function test_farm_produce_exists_as_food_but_is_not_sold(): void
    {
        $codes = collect($this->getJson('/api/shop/items')->assertOk()->json('items'))
            ->map(fn (array $row) => $row['item']['code'])
            ->all();

        foreach (['egg', 'milk'] as $asset) {
            $this->assertNotContains("farm_{$asset}", $codes);
            $this->assertSame("/assets/items/farm/{$asset}/model.glb", ItemDef::query()->where('code', "farm_{$asset}")->value('model_glb'));
        }
    }

    public function test_farm_route_needs_the_realtime_server(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');

        $this->postJson('/api/farm/pick', ['crop' => 'corn'], $this->auth($player['token']))->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->assertNull($this->hotbarItem($player['token'], 'farm_corn'));
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
