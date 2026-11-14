<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Models\Wallet;
use App\Services\AccountInventoryService;
use App\Services\SportsGearService;
use App\Services\SurvivalService;
use Carbon\CarbonImmutable;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class SportsApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
        $this->travelTo(CarbonImmutable::parse('2026-11-14 10:00:00'));
    }

    public function test_a_player_without_a_pass_sees_no_end_and_the_prices(): void
    {
        $player = $this->player(cash: 0);

        $this->getJson('/api/sports/pass', $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['pass' => ['validUntil' => null, 'prices' => ['day' => 40, 'week' => 200]]]);
    }

    public function test_a_day_pass_costs_40_cash_destroyed_and_lasts_24_hours(): void
    {
        $player = $this->player(cash: 100, bank: 500);

        $reply = $this->buy($player, 'day', 'r1')->assertOk();

        $this->assertSame(60, $reply->json('cash'));
        $this->assertEndsIn($reply->json('pass.validUntil'), hours: 24);
        $this->assertSame(60, $this->balance($player['account_id'], Wallet::CASH));
        $this->assertSame(500, $this->balance($player['account_id'], Wallet::BANK));
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'sports_pass')->where('delta', -40)->count());
        $this->assertSame(1, DB::table('transactions')->where('type', 'sports_pass')->count());
        $this->assertEndsIn($this->getJson('/api/sports/pass', $this->auth($player['token'], self::SECRET))->json('pass.validUntil'), hours: 24);
    }

    public function test_a_week_pass_costs_200_and_lasts_7_days(): void
    {
        $player = $this->player(cash: 200);

        $reply = $this->buy($player, 'week', 'r1')->assertOk()->assertJsonPath('cash', 0);

        $this->assertEndsIn($reply->json('pass.validUntil'), hours: 168);
    }

    public function test_the_same_ref_twice_charges_once_and_returns_the_first_result(): void
    {
        $player = $this->player(cash: 100);
        $first = $this->buy($player, 'day', 'same')->assertOk()->json();

        $this->buy($player, 'day', 'same')->assertOk()->assertExactJson($first);
        $this->buy($player, 'week', 'same')->assertOk()->assertExactJson($first);

        $this->assertSame(60, $this->balance($player['account_id'], Wallet::CASH));
        $this->assertSame(1, DB::table('sports_pass_purchases')->count());
    }

    public function test_buying_while_valid_extends_from_the_current_end(): void
    {
        $player = $this->player(cash: 400);
        $this->buy($player, 'day', 'r1')->assertOk();
        $this->travel(6)->hours();

        $reply = $this->buy($player, 'week', 'r2')->assertOk()->assertJsonPath('cash', 160);

        $this->assertEndsIn($reply->json('pass.validUntil'), hours: 24 + 168 - 6);
    }

    public function test_buying_after_expiry_starts_from_now(): void
    {
        $player = $this->player(cash: 100);
        $this->buy($player, 'day', 'r1')->assertOk();
        $this->travel(30)->hours();

        $this->getJson('/api/sports/pass', $this->auth($player['token'], self::SECRET))->assertJsonPath('pass.validUntil', null);
        $this->assertEndsIn($this->buy($player, 'day', 'r2')->assertOk()->json('pass.validUntil'), hours: 24);
    }

    public function test_a_pass_ending_more_than_14_days_ahead_is_refused(): void
    {
        $player = $this->player(cash: 1000);
        $this->buy($player, 'week', 'r1')->assertOk();
        $this->buy($player, 'week', 'r2')->assertOk();

        $this->buy($player, 'day', 'r3')->assertStatus(409)->assertJsonPath('code', 'sports_pass_cap');

        $this->assertSame(600, $this->balance($player['account_id'], Wallet::CASH));
        $this->travel(1)->hours();
        $this->buy($player, 'day', 'r4')->assertStatus(409)->assertJsonPath('code', 'sports_pass_cap');
        $this->travel(23)->hours();
        $this->buy($player, 'day', 'r5')->assertOk()->assertJsonPath('cash', 560);
    }

    public function test_the_pass_is_paid_in_cash_only(): void
    {
        $player = $this->player(cash: 39, bank: 5000);

        $this->buy($player, 'day', 'r1')->assertUnprocessable()->assertJsonPath('code', 'sports_pass_insufficient_cash');

        $this->assertSame(39, $this->balance($player['account_id'], Wallet::CASH));
        $this->assertSame(0, DB::table('sports_pass_purchases')->count());
    }

    public function test_an_unknown_kind_is_refused(): void
    {
        $player = $this->player(cash: 1000);

        $this->buy($player, 'month', 'r1')->assertUnprocessable()->assertJsonPath('code', 'sports_pass_invalid_kind');
        $this->postJson('/api/sports/pass', ['kind' => 'day', 'ref' => str_repeat('a', 65)], $this->auth($player['token'], self::SECRET))->assertUnprocessable();
        $this->assertSame(1000, $this->balance($player['account_id'], Wallet::CASH));
    }

    public function test_the_browser_cannot_buy_a_pass_without_the_socket(): void
    {
        $player = $this->player(cash: 100);

        $this->postJson('/api/sports/pass', ['kind' => 'day', 'ref' => 'r1'], $this->auth($player['token']))->assertForbidden();
        $this->assertSame(100, $this->balance($player['account_id'], Wallet::CASH));
    }

    public function test_the_six_gear_items_are_seeded_with_their_sport_and_slot_and_not_on_sale(): void
    {
        $gear = DB::table('item_defs')->where('kind', SportsGearService::KIND)->orderBy('code')->get();

        $this->assertSame(
            ['gear_boules', 'gear_boxing_gloves', 'gear_ice_skates', 'gear_running_spikes', 'gear_swimsuit', 'gear_tennis_racket'],
            $gear->pluck('code')->all(),
        );
        $this->assertEquals(['sport' => 'skating', 'slot' => 'shoes'], json_decode($gear->firstWhere('code', 'gear_ice_skates')->meta_json, true));
        $this->assertTrue($gear->every(fn (object $def): bool => $def->tradable && $def->max_uses === null && ! $def->weapon && $def->model_glb === null));
        $this->assertSame(0, DB::table('shop_catalog_items')->whereIn('item_def_id', $gear->pluck('item_def_id'))->count());
    }

    public function test_gear_lists_the_codes_owned_in_the_inventory(): void
    {
        $player = $this->player(cash: 0);
        $this->grant($player['account_id'], 'gear_tennis_racket');
        $this->grant($player['account_id'], 'gear_tennis_racket');
        $this->grant($player['account_id'], 'gear_boules');
        $this->grant($player['account_id'], 'tool_hammer');

        $this->getJson('/api/sports/gear', $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['gear' => ['gear_boules', 'gear_tennis_racket']]);
    }

    public function test_the_clothes_lost_at_death_never_include_gear(): void
    {
        $player = $this->player(cash: 0, bank: 500, ageHours: 1);
        $this->grant($player['account_id'], 'gear_swimsuit');

        $this->postJson('/api/survival/hospital', [], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->assertSame(500 - SurvivalService::HOSPITAL_FEE, $this->balance($player['account_id'], Wallet::BANK));
        $this->getJson('/api/sports/gear', $this->auth($player['token'], self::SECRET))->assertExactJson(['gear' => ['gear_swimsuit']]);
    }

    public function test_no_zone_buyer_buys_gear(): void
    {
        $gear = DB::table('item_defs')->where('kind', SportsGearService::KIND)->pluck('code')->all();

        foreach (glob(resource_path('zones/*.json')) as $path) {
            $book = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            foreach ($book['buyers'] ?? [] as $area => $offers) {
                $this->assertSame([], array_values(array_intersect(array_keys($offers), $gear)), basename($path)." buyer {$area} buys sports gear");
            }
        }
    }

    public function test_a_match_is_recorded_once_with_one_row_per_player(): void
    {
        $red = $this->player(cash: 0);
        $blue = $this->player(cash: 0);
        $body = $this->match([
            ['accountId' => $red['account_id'], 'team' => 'red', 'result' => 'win', 'score' => 3],
            ['accountId' => $blue['account_id'], 'team' => 'blue', 'result' => 'loss', 'score' => 1],
        ]);

        $id = $this->recordMatch($red, $body)->assertOk()->assertJsonPath('match.recorded', true)->json('match.id');
        $this->recordMatch($red, $body)->assertOk()->assertExactJson(['match' => ['id' => $id, 'recorded' => false]]);

        $this->assertSame(1, DB::table('sports_matches')->count());
        $row = DB::table('sports_matches')->first();
        $this->assertSame('football', $row->sport);
        $this->assertEquals(['length' => 5, 'format' => '3v3'], json_decode($row->settings, true));
        $this->assertSame(1_763_114_400_000, CarbonImmutable::parse($row->started_at)->getTimestampMs());
        $players = DB::table('sports_match_players')->orderBy('score', 'desc')->get();
        $this->assertSame([$red['account_id'], $blue['account_id']], $players->pluck('account_id')->map(fn ($id): int => (int) $id)->all());
        $this->assertSame(['win', 'loss'], $players->pluck('result')->all());
    }

    public function test_a_solo_race_records_place_time_and_dnf(): void
    {
        $first = $this->player(cash: 0);
        $out = $this->player(cash: 0);
        $body = array_merge($this->match([
            ['accountId' => $first['account_id'], 'team' => null, 'result' => 'finished', 'place' => 1, 'timeMs' => 31_250],
            ['accountId' => $out['account_id'], 'team' => null, 'result' => 'dnf'],
        ]), ['sport' => 'swimming', 'venue' => 'pool_lanes', 'settings' => []]);

        $this->recordMatch($first, $body)->assertOk();

        $row = DB::table('sports_match_players')->where('account_id', $first['account_id'])->first();
        $this->assertSame(1, (int) $row->place);
        $this->assertSame(31_250, (int) $row->time_ms);
        $this->assertNull(DB::table('sports_match_players')->where('account_id', $out['account_id'])->value('time_ms'));
    }

    public function test_a_match_is_validated_strictly(): void
    {
        $player = $this->player(cash: 0);
        $good = $this->match([['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'win']]);
        $bad = [
            ['sport' => 'golf'],
            ['venue' => 'Court 1'],
            ['startedAt' => '1763114400000'],
            ['endedAt' => 1_763_114_399_999],
            ['settings' => ['format' => ['3v3']]],
            ['players' => []],
            ['players' => [['accountId' => $player['account_id'], 'team' => 'green', 'result' => 'win']]],
            ['players' => [['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'champion']]],
            ['players' => [['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'win', 'score' => 2.5]]],
            ['players' => [['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'win', 'coins' => 50]]],
            ['players' => [['accountId' => 999_999, 'team' => 'red', 'result' => 'win']]],
            ['players' => [
                ['accountId' => $player['account_id'], 'team' => 'red', 'result' => 'win'],
                ['accountId' => $player['account_id'], 'team' => 'blue', 'result' => 'loss'],
            ]],
        ];

        foreach ($bad as $i => $patch) {
            $this->recordMatch($player, array_merge($good, $patch, ['ref' => "bad-{$i}"]))->assertUnprocessable();
        }
        $this->postJson('/api/sports/matches', $good, $this->auth($player['token']))->assertForbidden();
        $this->assertSame(0, DB::table('sports_matches')->count());
    }

    private function assertEndsIn(?string $validUntil, int $hours): void
    {
        $this->assertNotNull($validUntil);
        $this->assertSame(
            CarbonImmutable::now()->addHours($hours)->getTimestampMs(),
            CarbonImmutable::parse($validUntil)->getTimestampMs(),
        );
    }

    /**
     * @param  list<array<string, mixed>>  $players
     * @return array<string, mixed>
     */
    private function match(array $players): array
    {
        return [
            'ref' => 'match-1',
            'sport' => 'football',
            'venue' => 'gym_court',
            'settings' => ['length' => 5, 'format' => '3v3'],
            'startedAt' => 1_763_114_400_000,
            'endedAt' => 1_763_114_700_000,
            'players' => $players,
        ];
    }

    /**
     * @param  array{token: string}  $player
     * @param  array<string, mixed>  $body
     */
    private function recordMatch(array $player, array $body): TestResponse
    {
        return $this->postJson('/api/sports/matches', $body, $this->auth($player['token'], self::SECRET));
    }

    /** @param array{token: string} $player */
    private function buy(array $player, string $kind, string $ref): TestResponse
    {
        return $this->postJson('/api/sports/pass', ['kind' => $kind, 'ref' => $ref], $this->auth($player['token'], self::SECRET));
    }

    private function grant(int $accountId, string $code): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', $code)->firstOrFail(), 1);
    }

    /** @return array{token: string, account_id: int} */
    private function player(int $cash, int $bank = 0, int $ageHours = 100): array
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
        $this->setWalletBalance($accountId, Wallet::CASH, $cash);
        $this->setWalletBalance($accountId, Wallet::BANK, $bank);
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours($ageHours)]);

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }

    private function balance(int $accountId, string $currency): int
    {
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', $currency)->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }
}
