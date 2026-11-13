<?php

namespace Tests\Feature;

use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Services\AccountInventoryService;
use Carbon\CarbonImmutable;
use Database\Seeders\HousingUnitSeeder;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class AdminGameApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    private const APPLE = 'farm_apple';

    private const PREMIUM_SKIN = 'COS_WEAR_BODY_NEON_RONIN';

    private const GEM_TITLE = 'title_freshman';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_every_route_needs_the_realtime_server_and_an_admin_account(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();
        $routes = [
            ['GET', '/api/admin/game/items'],
            ['GET', '/api/admin/game/wallets'],
            ['POST', '/api/admin/game/money'],
            ['POST', '/api/admin/game/items'],
            ['POST', '/api/admin/game/taxes/collect'],
            ['POST', '/api/admin/game/market/open'],
            ['POST', '/api/admin/game/market/close'],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri, [], $this->auth($player['token'], self::SECRET))
                ->assertForbidden()
                ->assertJsonPath('code', 'admin_required');
            $this->json($method, $uri, [], $this->auth($admin['token']))
                ->assertForbidden()
                ->assertJsonPath('code', 'realtime_only');
        }
    }

    public function test_the_item_list_gives_code_name_and_kind_without_the_items_bought_with_gems(): void
    {
        $admin = $this->player(admin: true);

        $items = collect($this->getJson('/api/admin/game/items', $this->auth($admin['token'], self::SECRET))
            ->assertOk()
            ->json('items'));

        $this->assertSame(['code', 'name', 'kind'], array_keys($items->firstWhere('code', self::APPLE)));
        foreach ([self::PREMIUM_SKIN, self::GEM_TITLE] as $code) {
            $this->assertNull($items->firstWhere('code', $code), "{$code} is bought with gems");
        }
        $this->assertNotNull($items->firstWhere('code', 'COS_WEAR_BODY_STREET_RUNNER'));
    }

    public function test_the_wallets_of_a_player_give_their_cash_and_bank(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player(bank: 1240, cash: 85);

        $this->getJson('/api/admin/game/wallets?account_id='.$player['account_id'], $this->auth($admin['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['cash' => 85, 'bank' => 1240]);
    }

    public function test_the_wallets_need_a_live_account(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['deleted_at' => now()]);

        $this->getJson('/api/admin/game/wallets?account_id='.$player['account_id'], $this->auth($admin['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('account_id');
        $this->getJson('/api/admin/game/wallets', $this->auth($admin['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('account_id');
    }

    public function test_a_grant_to_the_bank_writes_an_admin_grant_ledger_row(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player(bank: 100, cash: 10);
        $ref = (string) Str::uuid();

        $this->grantMoney($admin, $player['account_id'], 'bank', 500, $ref)
            ->assertOk()
            ->assertExactJson(['cash' => 10, 'bank' => 600]);

        $tx = DB::table('transactions')->where('type', 'admin_grant')->sole();
        $this->assertSame($admin['account_id'], (int) $tx->created_by_account_id);
        $meta = json_decode($tx->meta_json, true);
        $this->assertSame($ref, $meta['ref']);
        $this->assertSame($player['account_id'], $meta['to_account_id']);
        $this->assertSame(500, (int) DB::table('wallet_ledger')->where('tx_id', $tx->tx_id)->where('reason', 'admin_grant')->sum('delta'));
        $this->assertSame(600, $this->balance($player['account_id'], Wallet::BANK));
    }

    public function test_a_grant_to_the_cash_credits_the_money_carried(): void
    {
        $admin = $this->player(admin: true);

        $this->grantMoney($admin, $admin['account_id'], 'cash', 250, (string) Str::uuid())
            ->assertOk()
            ->assertExactJson(['cash' => 250, 'bank' => 0]);

        $this->assertSame(250, $this->balance($admin['account_id'], Wallet::CASH));
        $this->assertSame(0, $this->balance($admin['account_id'], Wallet::BANK));
    }

    public function test_a_grant_replayed_with_the_same_ref_pays_once(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();
        $ref = (string) Str::uuid();

        $this->grantMoney($admin, $player['account_id'], 'cash', 300, $ref)->assertOk();
        $this->grantMoney($admin, $player['account_id'], 'cash', 300, $ref)
            ->assertStatus(409)
            ->assertJsonPath('code', 'bank_already_done');

        $this->assertSame(300, $this->balance($player['account_id'], Wallet::CASH));
        $this->assertSame(1, DB::table('transactions')->where('type', 'admin_grant')->count());
    }

    public function test_a_money_grant_checks_its_fields(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();
        $valid = ['account_id' => $player['account_id'], 'wallet' => 'bank', 'amount' => 100_000, 'ref' => (string) Str::uuid()];
        $invalid = [
            'amount' => [0, 100_001, 'ten'],
            'wallet' => ['coins', 'premium', null],
            'ref' => ['not-a-uuid', null],
            'account_id' => [999_999, null],
        ];

        foreach ($invalid as $field => $values) {
            foreach ($values as $value) {
                $this->postJson('/api/admin/game/money', [$field => $value] + $valid, $this->auth($admin['token'], self::SECRET))
                    ->assertUnprocessable()
                    ->assertJsonValidationErrors($field);
            }
        }
        $this->assertSame(0, DB::table('transactions')->where('type', 'admin_grant')->count());

        $this->postJson('/api/admin/game/money', $valid, $this->auth($admin['token'], self::SECRET))->assertOk();
    }

    public function test_a_deleted_account_cannot_be_paid(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['deleted_at' => now()]);

        $this->grantMoney($admin, $player['account_id'], 'bank', 10, (string) Str::uuid())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('account_id');
    }

    public function test_an_item_grant_puts_the_items_in_the_inventory(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();

        $this->grantItem($admin, $player['account_id'], self::APPLE, 12)
            ->assertOk()
            ->assertExactJson(['account_id' => $player['account_id'], 'code' => self::APPLE, 'quantity' => 12]);
        $this->grantItem($admin, $admin['account_id'], self::APPLE, 3)->assertOk();

        $this->assertSame(12, $this->owned($player['token'], self::APPLE));
        $this->assertSame(3, $this->owned($admin['token'], self::APPLE));
    }

    public function test_an_item_grant_refuses_an_unknown_item_and_bad_quantities(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();

        $this->grantItem($admin, $player['account_id'], 'no_such_item', 1)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');
        foreach ([0, 1000] as $quantity) {
            $this->grantItem($admin, $player['account_id'], self::APPLE, $quantity)
                ->assertUnprocessable()
                ->assertJsonValidationErrors('quantity');
        }
        $this->grantItem($admin, 999_999, self::APPLE, 1)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('account_id');
        $this->postJson('/api/admin/game/items', ['account_id' => $player['account_id'], 'code' => self::APPLE, 'quantity' => 1, 'ref' => 'not-a-uuid'], $this->auth($admin['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ref');

        $this->assertSame(0, $this->owned($player['token'], self::APPLE));
    }

    public function test_an_item_bought_with_gems_cannot_be_given(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();

        foreach ([self::PREMIUM_SKIN, self::GEM_TITLE] as $code) {
            $this->grantItem($admin, $player['account_id'], $code, 1)
                ->assertUnprocessable()
                ->assertJsonPath('code', 'admin_item_premium');
        }

        $this->assertSame(0, DB::table('admin_item_grants')->count());
        $premiumSkinId = ItemDef::query()->where('code', self::PREMIUM_SKIN)->value('item_def_id');
        $this->assertFalse(DB::table('account_locker_cosmetics')->where('account_id', $player['account_id'])->where('item_def_id', $premiumSkinId)->exists());
    }

    public function test_an_item_grant_replayed_with_the_same_ref_gives_once(): void
    {
        $admin = $this->player(admin: true);
        $player = $this->player();
        $ref = (string) Str::uuid();

        $this->grantItem($admin, $player['account_id'], self::APPLE, 5, $ref)->assertOk();
        $this->grantItem($admin, $player['account_id'], self::APPLE, 5, $ref)
            ->assertStatus(409)
            ->assertJsonPath('code', 'admin_grant_already_done');

        $this->assertSame(5, $this->owned($player['token'], self::APPLE));
        $row = DB::table('admin_item_grants')->sole();
        $this->assertSame([$ref, $admin['account_id'], $player['account_id'], 5], [$row->ref, (int) $row->admin_account_id, (int) $row->to_account_id, (int) $row->quantity]);
    }

    public function test_collecting_taxes_charges_who_can_pay_and_seizes_the_rest(): void
    {
        $this->seed(HousingUnitSeeder::class);
        $this->travelTo(CarbonImmutable::parse('2026-09-22 12:00:00 UTC'));
        $admin = $this->player(admin: true);
        [$first, $second] = HousingUnit::query()->where('offer_type', 'buy')->orderBy('price_coins')->limit(2)->get()->all();
        $payer = $this->player(bank: $first->price_coins + (int) ceil($first->price_coins * 0.05));
        $broke = $this->player(bank: $second->price_coins);
        $this->postJson("/api/housing/units/{$first->public_id}/buy", [], $this->auth($payer['token']))->assertOk();
        $this->postJson("/api/housing/units/{$second->public_id}/buy", [], $this->auth($broke['token']))->assertOk();

        $this->postJson('/api/admin/game/taxes/collect', [], $this->auth($admin['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['charged' => 0, 'seized' => 0]);

        $this->travelTo(CarbonImmutable::parse('2026-09-23 12:00:01 UTC'));
        $this->postJson('/api/admin/game/taxes/collect', [], $this->auth($admin['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['charged' => 1, 'seized' => 1]);

        $this->assertSame('occupied', $first->refresh()->status);
        $this->assertSame('vacant', $second->refresh()->status);
    }

    public function test_opening_the_market_now_lasts_the_chosen_minutes(): void
    {
        $this->travelToParis('2026-11-12 10:00:00');
        $admin = $this->player(admin: true);
        $this->getJson('/api/market', $this->auth($admin['token']))->assertOk()->assertJsonPath('open', false);

        $this->openMarket($admin, 30)
            ->assertOk()
            ->assertJsonPath('open', true)
            ->assertJsonPath('market_date', '2026-11-12')
            ->assertJsonPath('closes_at', CarbonImmutable::parse('2026-11-12 10:30:00', 'Europe/Paris')->toIso8601String());

        $this->travelToParis('2026-11-12 10:29:59');
        $this->getJson('/api/market', $this->auth($admin['token']))->assertJsonPath('open', true);

        $this->travelToParis('2026-11-12 10:30:00');
        $this->getJson('/api/market', $this->auth($admin['token']))
            ->assertJsonPath('open', false)
            ->assertJsonPath('market_date', '2026-11-14');
    }

    public function test_the_market_open_minutes_are_checked(): void
    {
        $admin = $this->player(admin: true);

        foreach ([0, 241, null] as $minutes) {
            $this->openMarket($admin, $minutes)->assertUnprocessable()->assertJsonValidationErrors('minutes');
        }
    }

    public function test_an_early_opening_runs_on_into_the_saturday_market(): void
    {
        $this->travelToParis('2026-11-14 14:45:00');
        $admin = $this->player(admin: true);

        $this->openMarket($admin, 30)
            ->assertJsonPath('market_date', '2026-11-14')
            ->assertJsonPath('closes_at', CarbonImmutable::parse('2026-11-14 15:15:00', 'Europe/Paris')->toIso8601String());

        $this->travelToParis('2026-11-14 15:15:00');
        $this->getJson('/api/market', $this->auth($admin['token']))
            ->assertJsonPath('open', true)
            ->assertJsonPath('closes_at', CarbonImmutable::parse('2026-11-14 17:00:00', 'Europe/Paris')->toIso8601String());
    }

    public function test_closing_the_saturday_market_returns_the_lots_and_stays_closed_until_its_end(): void
    {
        $this->travelToParis('2026-11-14 15:30:00');
        $admin = $this->player(admin: true);
        $seller = $this->player(cash: 100, ageHours: 100);
        app(AccountInventoryService::class)->grantItem($seller['account_id'], ItemDef::query()->where('code', self::APPLE)->firstOrFail(), 10);
        $this->postJson('/api/market/stalls', ['stall_no' => 1, 'canopy' => 'red'], $this->auth($seller['token'], self::SECRET))->assertOk();
        $this->postJson('/api/market/lots', ['slot' => 1, 'code' => self::APPLE, 'quantity' => 10, 'unit_price' => 5, 'container' => 'crate'], $this->auth($seller['token'], self::SECRET))->assertOk();
        $this->assertSame(0, $this->owned($seller['token'], self::APPLE));

        $this->closeMarket($admin)
            ->assertOk()
            ->assertJsonPath('returned', 1)
            ->assertJsonPath('market.open', false)
            ->assertJsonPath('market.market_date', '2026-11-21')
            ->assertJsonPath('market.stalls', []);
        $this->assertSame(10, $this->owned($seller['token'], self::APPLE));

        $this->travelToParis('2026-11-14 16:59:59');
        $this->getJson('/api/market', $this->auth($admin['token']))->assertJsonPath('open', false);
        $this->postJson('/api/market/stalls', ['stall_no' => 2, 'canopy' => 'red'], $this->auth($seller['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'market_closed');

        $this->travelToParis('2026-11-21 15:00:00');
        $this->getJson('/api/market', $this->auth($admin['token']))->assertJsonPath('open', true);
    }

    public function test_closing_ends_an_admin_opening_and_opening_lifts_a_close(): void
    {
        $this->travelToParis('2026-11-12 10:00:00');
        $admin = $this->player(admin: true);

        $this->openMarket($admin, 60)->assertJsonPath('open', true);
        $this->closeMarket($admin)->assertOk()->assertJsonPath('market.open', false);

        $this->travelToParis('2026-11-14 15:30:00');
        $this->closeMarket($admin)->assertJsonPath('market.open', false);
        $this->openMarket($admin, 10)
            ->assertJsonPath('open', true)
            ->assertJsonPath('closes_at', CarbonImmutable::parse('2026-11-14 17:00:00', 'Europe/Paris')->toIso8601String());
    }

    public function test_closing_wins_over_the_playtest_switch(): void
    {
        $this->app['env'] = 'local';
        config(['market.open_now_in_local' => true]);
        $this->travelToParis('2026-11-12 10:00:00');
        $admin = $this->player(admin: true);
        $this->getJson('/api/market', $this->auth($admin['token']))->assertJsonPath('open', true);

        $this->closeMarket($admin)->assertJsonPath('market.open', false);
        $this->getJson('/api/market', $this->auth($admin['token']))->assertJsonPath('open', false);

        $this->travelToParis('2026-11-13 00:00:00');
        $this->getJson('/api/market', $this->auth($admin['token']))->assertJsonPath('open', true);
    }

    private function grantMoney(array $admin, int $accountId, string $wallet, int $amount, string $ref): TestResponse
    {
        return $this->postJson(
            '/api/admin/game/money',
            ['account_id' => $accountId, 'wallet' => $wallet, 'amount' => $amount, 'ref' => $ref],
            $this->auth($admin['token'], self::SECRET),
        );
    }

    private function grantItem(array $admin, int $accountId, string $code, int $quantity, ?string $ref = null): TestResponse
    {
        return $this->postJson(
            '/api/admin/game/items',
            ['account_id' => $accountId, 'code' => $code, 'quantity' => $quantity, 'ref' => $ref ?? (string) Str::uuid()],
            $this->auth($admin['token'], self::SECRET),
        );
    }

    private function openMarket(array $admin, ?int $minutes): TestResponse
    {
        return $this->postJson('/api/admin/game/market/open', ['minutes' => $minutes], $this->auth($admin['token'], self::SECRET));
    }

    private function closeMarket(array $admin): TestResponse
    {
        return $this->postJson('/api/admin/game/market/close', [], $this->auth($admin['token'], self::SECRET));
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

    private function owned(string $token, string $code): int
    {
        $items = $this->getJson('/api/inventory', $this->auth($token))->assertOk()->json('items');

        return (int) (collect($items)->firstWhere('code', $code)['quantity'] ?? 0);
    }

    private function balance(int $accountId, string $currency): int
    {
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', $currency)->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }

    /** @return array{token: string, account_id: int} */
    private function player(bool $admin = false, int $bank = 0, int $cash = 0, int $ageHours = 0): array
    {
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10),
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $this->setWalletBalance($accountId, Wallet::BANK, $bank);
        $this->setWalletBalance($accountId, Wallet::CASH, $cash);
        DB::table('accounts')->where('account_id', $accountId)->update([
            'is_admin' => $admin,
            'created_at' => now()->subHours($ageHours),
        ]);

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }
}
