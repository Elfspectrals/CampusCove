<?php

namespace Tests\Feature;

use App\Services\JailService;
use App\Services\SurvivalService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class JailApiTest extends TestCase
{
    use RefreshDatabase;
    use SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_only_the_realtime_server_reads_saves_and_pays(): void
    {
        $player = $this->player();

        $this->getJson('/api/jail', $this->auth($player['token']))->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => 1, 'ms_left' => 1000], $this->auth($player['token']))->assertForbidden();
        $this->postJson('/api/jail/pay', ['stars' => 1], $this->auth($player['token'], 'wrong'))->assertForbidden();
    }

    public function test_a_new_player_has_no_sentence(): void
    {
        $player = $this->player();

        $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('jail.kind', null)
            ->assertJsonPath('jail.stars', 0)
            ->assertJsonPath('jail.ms_left', 0);
    }

    public function test_an_officer_hold_survives_a_reconnect_and_has_no_fine(): void
    {
        $player = $this->player();
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->putJson('/api/jail', ['kind' => 'officer', 'stars' => 0, 'ms_left' => JailService::OFFICER_HOLD_MS], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))
            ->assertJsonPath('jail.kind', 'officer')
            ->assertJsonPath('jail.stars', 0)
            ->assertJsonPath('jail.ms_left', JailService::OFFICER_HOLD_MS);
        $this->postJson('/api/jail/pay', ['stars' => 1], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'jail_held_by_officer');
        $this->assertSame(1000, $this->balance($bankWallet));
        $this->putJson('/api/jail', ['kind' => null, 'stars' => 0, 'ms_left' => 0], $this->auth($player['token'], self::SECRET))->assertOk();
        $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))->assertJsonPath('jail.kind', null)->assertJsonPath('jail.ms_left', 0);
    }

    public function test_the_time_left_survives_a_reconnect_and_keeps_the_wanted_level(): void
    {
        $player = $this->player();
        $this->putJson('/api/wanted', ['stars' => 2, 'decay_ms' => 90_000], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => 3, 'ms_left' => 200_000], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))
            ->assertJsonPath('jail.kind', 'npc')
            ->assertJsonPath('jail.stars', 3)
            ->assertJsonPath('jail.ms_left', 200_000);
        $this->getJson('/api/wanted', $this->auth($player['token'], self::SECRET))
            ->assertJsonPath('wanted.stars', 2)
            ->assertJsonPath('wanted.decay_ms', 90_000);
    }

    public function test_a_broken_sentence_is_refused(): void
    {
        $player = $this->player();

        foreach ([
            ['kind' => 'npc', 'stars' => 2, 'ms_left' => 0],
            ['kind' => 'npc', 'stars' => 0, 'ms_left' => 1000],
            ['kind' => 'npc', 'stars' => 6, 'ms_left' => 1000],
            ['kind' => 'npc', 'stars' => 2, 'ms_left' => JailService::MAX_SENTENCE_MS + 1],
            ['kind' => 'officer', 'stars' => 2, 'ms_left' => 1000],
            ['kind' => 'officer', 'stars' => 0, 'ms_left' => JailService::OFFICER_HOLD_MS + 1],
            ['kind' => null, 'stars' => 2, 'ms_left' => 1000],
            ['kind' => 'cell', 'stars' => 2, 'ms_left' => 1000],
            ['stars' => 2, 'ms_left' => 1000],
        ] as $body) {
            $this->putJson('/api/jail', $body, $this->auth($player['token'], self::SECRET))->assertUnprocessable();
        }
    }

    public function test_the_fine_is_taken_from_the_bank_then_from_cash_and_destroyed(): void
    {
        $player = $this->jailed(3);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 250);
        $cashWallet = $this->setWalletBalance($player['account_id'], 'cash', 100);

        $this->postJson('/api/jail/pay', ['stars' => 3], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('fine', 300)
            ->assertJsonPath('bank', 0)
            ->assertJsonPath('cash', 50);

        $this->assertSame(0, $this->balance($bankWallet));
        $this->assertSame(50, $this->balance($cashWallet));
        $entries = DB::table('wallet_ledger')->where('reason', 'jail_fine')->orderBy('entry_id')->get();
        $this->assertSame([[$bankWallet, -250], [$cashWallet, -50]], $entries->map(fn ($e) => [(int) $e->wallet_id, (int) $e->delta])->all());
        $tx = DB::table('transactions')->where('type', 'jail_fine')->sole();
        $this->assertSame([(int) $tx->tx_id], $entries->pluck('tx_id')->map(fn ($id) => (int) $id)->unique()->values()->all());
        $this->assertSame(0, (int) DB::table('wallet_ledger')->where('tx_id', $tx->tx_id)->where('delta', '>', 0)->count());
        $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))->assertJsonPath('jail.stars', 0)->assertJsonPath('jail.ms_left', 0);
    }

    public function test_a_rich_player_pays_from_the_bank_only(): void
    {
        $player = $this->jailed(1);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);
        $cashWallet = $this->setWalletBalance($player['account_id'], 'cash', 80);

        $this->postJson('/api/jail/pay', ['stars' => 1], $this->auth($player['token'], self::SECRET))->assertOk()->assertJsonPath('fine', 100);

        $this->assertSame(900, $this->balance($bankWallet));
        $this->assertSame(80, $this->balance($cashWallet));
    }

    public function test_the_fine_stops_at_500_coins(): void
    {
        $player = $this->jailed(5);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 2000);

        $this->postJson('/api/jail/pay', ['stars' => 5], $this->auth($player['token'], self::SECRET))->assertOk()->assertJsonPath('fine', 500);

        $this->assertSame(1500, $this->balance($bankWallet));
    }

    public function test_a_player_who_cannot_afford_the_fine_stays_in_the_cell_and_pays_nothing(): void
    {
        $player = $this->jailed(2);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 120);
        $cashWallet = $this->setWalletBalance($player['account_id'], 'cash', 79);

        $this->postJson('/api/jail/pay', ['stars' => 2], $this->auth($player['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'jail_insufficient_funds');

        $this->assertSame(120, $this->balance($bankWallet));
        $this->assertSame(79, $this->balance($cashWallet));
        $this->assertSame(0, DB::table('transactions')->where('type', 'jail_fine')->count());
        $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))->assertJsonPath('jail.stars', 2);
    }

    public function test_paying_twice_takes_the_fine_once(): void
    {
        $player = $this->jailed(2);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/jail/pay', ['stars' => 2], $this->auth($player['token'], self::SECRET))->assertOk();
        $this->postJson('/api/jail/pay', ['stars' => 2], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'not_in_jail');

        $this->assertSame(800, $this->balance($bankWallet));
        $this->assertSame(1, DB::table('transactions')->where('type', 'jail_fine')->count());
    }

    public function test_the_fine_follows_the_recorded_stars_not_the_ones_sent(): void
    {
        $player = $this->jailed(4);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/jail/pay', ['stars' => 1], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'jail_mismatch');
        $this->postJson('/api/jail/pay', ['stars' => 0], $this->auth($player['token'], self::SECRET))->assertUnprocessable();

        $this->assertSame(1000, $this->balance($bankWallet));
    }

    public function test_a_free_player_has_no_fine_to_pay(): void
    {
        $player = $this->player();
        $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/jail/pay', ['stars' => 1], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'not_in_jail');
    }

    public function test_a_death_in_an_npc_cell_pays_the_hospital_and_the_jail_tax(): void
    {
        $this->seed(ShopSeeder::class);

        foreach ([1 => 50, 3 => 150, 5 => 250] as $stars => $tax) {
            $player = $this->jailed($stars);
            $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

            $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => $stars], $this->auth($player['token'], self::SECRET))
                ->assertOk()
                ->assertJsonPath('billed', SurvivalService::HOSPITAL_FEE)
                ->assertJsonPath('jail_tax', $tax)
                ->assertJsonPath('balance_after', 1000 - SurvivalService::HOSPITAL_FEE - $tax)
                ->assertJsonStructure(['lost' => ['items', 'clothes']]);

            $this->assertSame(1000 - SurvivalService::HOSPITAL_FEE - $tax, $this->balance($bankWallet));
            $tx = DB::table('transactions')->where('type', 'jail_tax')->where('created_by_account_id', $player['account_id'])->sole();
            $this->assertEquals(['amount' => $tax, 'stars' => $stars, 'bank' => $tax, 'cash' => 0], json_decode($tx->meta_json, true));
            $this->assertSame([[$bankWallet, -$tax]], DB::table('wallet_ledger')->where('tx_id', $tx->tx_id)->get()->map(fn ($e) => [(int) $e->wallet_id, (int) $e->delta])->all());
            $this->getJson('/api/jail', $this->auth($player['token'], self::SECRET))->assertJsonPath('jail.stars', $stars)->assertJsonPath('jail.ms_left', $stars * 120_000);
        }
    }

    public function test_a_player_short_of_money_pays_what_is_left_from_the_bank_then_cash_down_to_zero(): void
    {
        $this->seed(ShopSeeder::class);
        $player = $this->jailed(3);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 60);
        $cashWallet = $this->setWalletBalance($player['account_id'], 'cash', 70);

        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 3], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('billed', SurvivalService::HOSPITAL_FEE)
            ->assertJsonPath('jail_tax', 90)
            ->assertJsonPath('balance_after', 0)
            ->assertJsonPath('cash_drop', null);

        $this->assertSame(0, $this->balance($bankWallet));
        $this->assertSame(0, $this->balance($cashWallet));
        $entries = DB::table('wallet_ledger')->where('reason', 'jail_tax')->orderBy('entry_id')->get();
        $this->assertSame([[$bankWallet, -20], [$cashWallet, -70]], $entries->map(fn ($e) => [(int) $e->wallet_id, (int) $e->delta])->all());
    }

    public function test_a_death_without_stars_pays_the_hospital_only(): void
    {
        $this->seed(ShopSeeder::class);
        $player = $this->player();
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 500);

        $this->postJson('/api/survival/hospital', [], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('billed', SurvivalService::HOSPITAL_FEE)
            ->assertJsonPath('jail_tax', 0);
        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 2], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'jail_mismatch');

        $this->assertSame(500 - SurvivalService::HOSPITAL_FEE, $this->balance($bankWallet));
        $this->assertSame(0, DB::table('transactions')->where('type', 'jail_tax')->count());
    }

    public function test_the_jail_tax_follows_the_recorded_stars_not_the_ones_sent(): void
    {
        $this->seed(ShopSeeder::class);
        $player = $this->jailed(2);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 5], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'jail_mismatch');
        $this->postJson('/api/survival/hospital', ['jailed' => true], $this->auth($player['token'], self::SECRET))->assertUnprocessable();

        $this->assertSame(1000, $this->balance($bankWallet));
    }

    public function test_a_death_in_an_officer_cell_pays_nothing(): void
    {
        $this->seed(ShopSeeder::class);
        $player = $this->player();
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 500);
        $this->putJson('/api/jail', ['kind' => 'officer', 'stars' => 0, 'ms_left' => JailService::OFFICER_HOLD_MS], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 0], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('billed', 0)
            ->assertJsonPath('jail_tax', 0)
            ->assertJsonPath('balance_after', null);

        $this->assertSame(500, $this->balance($bankWallet));
        $this->assertSame(0, DB::table('transactions')->whereIn('type', ['hospital_bill', 'jail_tax'])->count());
    }

    public function test_a_sentence_pays_its_hospital_and_jail_tax_once(): void
    {
        $this->seed(ShopSeeder::class);
        $player = $this->jailed(2);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 2], $this->auth($player['token'], self::SECRET))->assertOk()->assertJsonPath('jail_tax', 100);
        $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => 2, 'ms_left' => 100_000], $this->auth($player['token'], self::SECRET))->assertOk();
        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 2], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('billed', 0)
            ->assertJsonPath('jail_tax', 0);

        $this->assertSame(1000 - SurvivalService::HOSPITAL_FEE - 100, $this->balance($bankWallet));
        $this->assertSame(1, DB::table('transactions')->where('type', 'hospital_bill')->count());
        $this->assertSame(1, DB::table('transactions')->where('type', 'jail_tax')->count());

        $this->putJson('/api/jail', ['kind' => null, 'stars' => 0, 'ms_left' => 0], $this->auth($player['token'], self::SECRET))->assertOk();
        $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => 1, 'ms_left' => 120_000], $this->auth($player['token'], self::SECRET))->assertOk();
        $this->postJson('/api/survival/hospital', ['jailed' => true, 'jail_stars' => 1], $this->auth($player['token'], self::SECRET))->assertOk()->assertJsonPath('jail_tax', 50);
    }

    /** @return array{token: string, account_id: int} */
    private function jailed(int $stars): array
    {
        $player = $this->player();
        $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => $stars, 'ms_left' => $stars * 120_000], $this->auth($player['token'], self::SECRET))->assertOk();

        return $player;
    }

    private function balance(int $walletId): int
    {
        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }

    /** @return array{token: string, account_id: int} */
    private function player(): array
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

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id')];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
