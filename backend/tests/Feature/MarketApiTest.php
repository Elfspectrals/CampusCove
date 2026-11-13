<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\MarketService;
use App\Services\TradeService;
use Carbon\CarbonImmutable;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class MarketApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    private const APPLE = 'farm_apple';

    private const TEE = 'COS_WEAR_TOP_TEE';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelToParis('2026-11-14 15:30:00');
    }

    public function test_the_market_opens_on_saturday_from_three_to_five_paris_time(): void
    {
        $player = $this->registerAndCreditWallet(0);
        $cases = [
            '2026-11-14 14:59:59' => [false, '2026-11-14'],
            '2026-11-14 15:00:00' => [true, '2026-11-14'],
            '2026-11-14 16:59:59' => [true, '2026-11-14'],
            '2026-11-14 17:00:00' => [false, '2026-11-21'],
            '2026-11-15 15:30:00' => [false, '2026-11-21'],
            '2026-11-13 15:30:00' => [false, '2026-11-14'],
        ];
        foreach ($cases as $parisTime => [$open, $marketDate]) {
            $this->travelToParis($parisTime);
            $this->getJson('/api/market', $this->auth($player['token']))
                ->assertOk()
                ->assertJsonPath('open', $open, $parisTime)
                ->assertJsonPath('market_date', $marketDate)
                ->assertJsonPath('opens_at', CarbonImmutable::parse("{$marketDate} 15:00:00", 'Europe/Paris')->toIso8601String())
                ->assertJsonPath('closes_at', CarbonImmutable::parse("{$marketDate} 17:00:00", 'Europe/Paris')->toIso8601String());
        }
    }

    public function test_the_tax_is_five_percent_rounded_down_from_twenty_coins(): void
    {
        $this->assertSame(0, MarketService::tax(19));
        $this->assertSame(1, MarketService::tax(20));
        $this->assertSame(1, MarketService::tax(39));
        $this->assertSame(5, MarketService::tax(100));
    }

    public function test_only_the_realtime_server_can_claim_a_stall(): void
    {
        $seller = $this->registerAndCreditWallet(100);

        $this->postJson('/api/market/stalls', ['stall_no' => 1, 'canopy' => 'red'], $this->auth($seller['token']))
            ->assertForbidden()
            ->assertJsonPath('code', 'realtime_only');
        $this->assertSame(100, $this->balance($seller['account_id']));
    }

    public function test_a_stall_costs_fifteen_coins_once_and_is_held_by_one_player(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $other = $this->registerAndCreditWallet(100);

        $this->claim($seller, 2, 'blue')->assertOk()->assertJsonPath('stall_no', 2)->assertJsonPath('canopy', 'blue');
        $this->claim($seller, 2, 'blue')->assertOk();
        $this->assertSame(85, $this->balance($seller['account_id']));

        $this->claim($seller, 3, 'red')->assertStatus(409)->assertJsonPath('code', 'market_already_has_stall');
        $this->claim($other, 2, 'red')->assertStatus(409)->assertJsonPath('code', 'market_stall_taken');
        $this->assertSame(100, $this->balance($other['account_id']));
    }

    public function test_a_stall_needs_the_fee_in_cash_and_a_known_canopy(): void
    {
        $poor = $this->registerAndCreditWallet(14);

        $this->claim($poor, 1, 'pink')->assertStatus(422)->assertJsonPath('code', 'market_canopy_unknown');
        $this->claim($poor, 1, 'red')->assertStatus(409)->assertJsonPath('code', 'market_insufficient_cash');
        $this->assertSame(14, $this->balance($poor['account_id']));
    }

    public function test_nothing_happens_while_the_market_is_closed(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $this->travelToParis('2026-11-14 17:00:00');

        $this->claim($seller, 1, 'red')->assertStatus(409)->assertJsonPath('code', 'market_closed');
        $this->assertSame(100, $this->balance($seller['account_id']));
    }

    public function test_an_account_younger_than_72_hours_cannot_claim_or_buy(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $newcomer = $this->registerAndCreditWallet(100);
        $this->ageAccount($newcomer['account_id'], TradeService::MIN_GIVER_AGE_HOURS - 1);
        $lotId = $this->openLot($seller, 10, 5);

        $this->claim($newcomer, 4, 'red')->assertForbidden()->assertJsonPath('code', 'market_account_too_new');
        $this->buy($newcomer, $lotId, 1, 'p-1')->assertForbidden()->assertJsonPath('code', 'market_account_too_new');
        $this->assertSame(100, $this->balance($newcomer['account_id']));
    }

    public function test_listing_a_lot_moves_the_items_into_escrow(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $this->grant($seller['account_id'], self::APPLE, 12);
        $this->claim($seller, 1, 'green')->assertOk();

        $this->listLot($seller, 1, self::APPLE, 10, 5, 'basket')
            ->assertOk()
            ->assertJsonPath('container', 'basket')
            ->assertJsonPath('slot', 1)
            ->assertJsonPath('code', self::APPLE)
            ->assertJsonPath('quantity', 10)
            ->assertJsonPath('unit_price', 5);

        $this->assertSame(2, $this->owned($seller['token'], self::APPLE));
        $this->getJson('/api/market', $this->auth($seller['token']))
            ->assertJsonPath('stalls.0.stall_no', 1)
            ->assertJsonPath('stalls.0.lots.0.quantity', 10)
            ->assertJsonPath('stalls.0.lots.0.container', 'basket');
    }

    public function test_a_lot_needs_a_known_container(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $this->grant($seller['account_id'], self::APPLE, 5);
        $this->claim($seller, 1, 'green')->assertOk();

        $this->listLot($seller, 1, self::APPLE, 5, 5, 'barrel')->assertStatus(422)->assertJsonPath('code', 'market_container_unknown');
        $this->assertSame(5, $this->owned($seller['token'], self::APPLE));
    }

    public function test_a_lot_needs_a_stall_a_free_slot_and_the_items(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $this->grant($seller['account_id'], self::APPLE, 5);
        $this->grant($seller['account_id'], self::TEE, 1);
        $this->wear($seller['account_id'], 'top', self::TEE);

        $this->listLot($seller, 1, self::APPLE, 1, 5)->assertStatus(409)->assertJsonPath('code', 'market_no_stall');
        $this->claim($seller, 1, 'green')->assertOk();
        $this->listLot($seller, 1, self::APPLE, 6, 5)->assertStatus(409)->assertJsonPath('code', 'market_item_missing');
        $this->listLot($seller, 1, self::TEE, 1, 50)->assertStatus(409)->assertJsonPath('code', 'market_item_worn');
        $this->listLot($seller, 1, 'COS_WEAR_BODY_NEON_RONIN', 1, 50)->assertStatus(422)->assertJsonPath('code', 'market_item_not_tradable');
        $this->listLot($seller, 1, self::APPLE, 2, 5)->assertOk();
        $this->listLot($seller, 1, self::APPLE, 2, 5)->assertStatus(409)->assertJsonPath('code', 'market_slot_taken');
        $this->assertSame(3, $this->owned($seller['token'], self::APPLE));
    }

    public function test_buying_moves_the_cash_less_the_tax_and_the_items(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $buyer = $this->registerAndCreditWallet(200);
        $lotId = $this->openLot($seller, 20, 5);

        $this->buy($buyer, $lotId, 20, 'p-1')->assertOk()->assertJsonPath('cash', 100)->assertJsonPath('quantity_left', 0);

        $this->assertSame(100, $this->balance($buyer['account_id']));
        $this->assertSame(85 + 100 - 5, $this->balance($seller['account_id']));
        $this->assertSame(20, $this->owned($buyer['token'], self::APPLE));
        $this->getJson('/api/market', $this->auth($buyer['token']))->assertJsonPath('stalls.0.lots', []);
    }

    public function test_a_purchase_retried_with_the_same_ref_happens_once(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $buyer = $this->registerAndCreditWallet(100);
        $other = $this->registerAndCreditWallet(100);
        $lotId = $this->openLot($seller, 10, 3);

        $this->buy($buyer, $lotId, 2, 'p-1')->assertOk()->assertJsonPath('cash', 94)->assertJsonPath('quantity_left', 8);
        $this->buy($buyer, $lotId, 2, 'p-1')->assertOk()->assertJsonPath('cash', 94)->assertJsonPath('quantity_left', 8);
        $this->buy($other, $lotId, 2, 'p-1')->assertStatus(409)->assertJsonPath('code', 'market_already_bought');

        $this->assertSame(2, $this->owned($buyer['token'], self::APPLE));
        $this->assertSame(100, $this->balance($other['account_id']));
        $this->assertSame(85 + 6, $this->balance($seller['account_id']));
    }

    public function test_a_purchase_is_refused_when_it_cannot_be_covered(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $buyer = $this->registerAndCreditWallet(9);
        $lotId = $this->openLot($seller, 3, 5);

        $this->buy($seller, $lotId, 1, 'p-own')->assertStatus(409)->assertJsonPath('code', 'market_own_lot');
        $this->buy($buyer, $lotId, 2, 'p-poor')->assertStatus(409)->assertJsonPath('code', 'market_insufficient_cash');
        $this->buy($buyer, $lotId, 4, 'p-many')->assertStatus(409)->assertJsonPath('code', 'market_item_missing');
        $this->buy($buyer, 999_999, 1, 'p-none')->assertStatus(409)->assertJsonPath('code', 'market_lot_gone');

        $this->assertSame(9, $this->balance($buyer['account_id']));
        $this->assertSame(0, $this->owned($buyer['token'], self::APPLE));
    }

    public function test_a_buyer_cannot_carry_more_than_a_stack(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $buyer = $this->registerAndCreditWallet(100);
        $maxStack = (int) $this->def(self::APPLE)->max_stack;
        $this->grant($buyer['account_id'], self::APPLE, $maxStack);
        $lotId = $this->openLot($seller, 1, 1);

        $this->buy($buyer, $lotId, 1, 'p-1')->assertStatus(409)->assertJsonPath('code', 'market_inventory_full');
        $this->assertSame(100, $this->balance($buyer['account_id']));
    }

    public function test_the_seller_can_withdraw_a_lot_and_nobody_else(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $other = $this->registerAndCreditWallet(100);
        $lotId = $this->openLot($seller, 10, 5);

        $this->withdraw($other, $lotId)->assertForbidden()->assertJsonPath('code', 'market_not_your_lot');
        $this->withdraw($seller, $lotId)->assertOk()->assertJsonPath('returned', 10);
        $this->withdraw($seller, $lotId)->assertStatus(409)->assertJsonPath('code', 'market_lot_gone');

        $this->assertSame(10, $this->owned($seller['token'], self::APPLE));
    }

    public function test_closing_gives_the_unsold_lots_back_once(): void
    {
        $seller = $this->registerAndCreditWallet(100);
        $buyer = $this->registerAndCreditWallet(100);
        $lotId = $this->openLot($seller, 10, 5);
        $this->buy($buyer, $lotId, 4, 'p-1')->assertOk();

        $this->artisan('market:close')->assertSuccessful();
        $this->assertSame(0, $this->owned($seller['token'], self::APPLE), 'lots stay out while the market is open');

        $this->travelToParis('2026-11-14 17:00:00');
        $this->artisan('market:close')->assertSuccessful();
        $this->artisan('market:close')->assertSuccessful();

        $this->assertSame(6, $this->owned($seller['token'], self::APPLE));
        $this->assertSame(4, $this->owned($buyer['token'], self::APPLE));
    }

    private function openLot(array $seller, int $quantity, int $unitPrice): int
    {
        $this->grant($seller['account_id'], self::APPLE, $quantity);
        $this->claim($seller, 1, 'yellow')->assertOk();

        return (int) $this->listLot($seller, 1, self::APPLE, $quantity, $unitPrice)->assertOk()->json('lot_id');
    }

    private function claim(array $player, int $stallNo, string $canopy): TestResponse
    {
        return $this->postJson('/api/market/stalls', ['stall_no' => $stallNo, 'canopy' => $canopy], $this->auth($player['token'], self::SECRET));
    }

    private function listLot(array $player, int $slot, string $code, int $quantity, int $unitPrice, string $container = 'crate'): TestResponse
    {
        return $this->postJson(
            '/api/market/lots',
            ['slot' => $slot, 'code' => $code, 'quantity' => $quantity, 'unit_price' => $unitPrice, 'container' => $container],
            $this->auth($player['token'], self::SECRET),
        );
    }

    private function buy(array $player, int $lotId, int $quantity, string $ref): TestResponse
    {
        return $this->postJson(
            "/api/market/lots/{$lotId}/buy",
            ['quantity' => $quantity, 'purchase_ref' => $ref],
            $this->auth($player['token'], self::SECRET),
        );
    }

    private function withdraw(array $player, int $lotId): TestResponse
    {
        return $this->postJson("/api/market/lots/{$lotId}/withdraw", [], $this->auth($player['token'], self::SECRET));
    }

    private function travelToParis(string $parisTime): void
    {
        $this->travelTo(CarbonImmutable::parse($parisTime, 'Europe/Paris'));
    }

    private function auth(string $token, ?string $secret = null): array
    {
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
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', 'cash')->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }

    /** @return array{token: string, account_id: int, username: string} */
    private function registerAndCreditWallet(int $cash): array
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

        $this->setWalletBalance($accountId, 'cash', $cash);
        $this->ageAccount($accountId, TradeService::MIN_GIVER_AGE_HOURS + 1);

        return ['token' => $token, 'account_id' => $accountId, 'username' => $username];
    }

    private function ageAccount(int $accountId, int $hours): void
    {
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours($hours)]);
    }
}
