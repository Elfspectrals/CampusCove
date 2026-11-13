<?php

namespace Tests\Feature;

use App\Services\PoliceLicenceService;
use App\Services\TradeService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class PoliceApiTest extends TestCase
{
    use RefreshDatabase;
    use SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_only_the_realtime_server_reads_and_buys_the_licence(): void
    {
        $player = $this->player();

        $this->getJson('/api/police/licence', $this->auth($player['token']))->assertForbidden()->assertJsonPath('code', 'realtime_only');
        $this->postJson('/api/police/licence', [], $this->auth($player['token'], 'wrong'))->assertForbidden();
    }

    public function test_a_player_has_no_licence_and_sees_its_price(): void
    {
        $player = $this->player();

        $this->getJson('/api/police/licence', $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('licence.held', false)
            ->assertJsonPath('licence.price', PoliceLicenceService::PRICE);
    }

    public function test_the_licence_is_paid_from_the_bank_and_destroyed(): void
    {
        $player = $this->veteran();
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 450);
        $cashWallet = $this->setWalletBalance($player['account_id'], 'cash', 500);

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('licence.held', true)
            ->assertJsonPath('licence.bank', 150);

        $this->assertSame(150, $this->balance($bankWallet));
        $this->assertSame(500, $this->balance($cashWallet));
        $tx = DB::table('transactions')->where('type', 'police_licence')->sole();
        $entries = DB::table('wallet_ledger')->where('tx_id', $tx->tx_id)->get();
        $this->assertSame([[$bankWallet, -300]], $entries->map(fn ($e) => [(int) $e->wallet_id, (int) $e->delta])->all());
        $this->getJson('/api/police/licence', $this->auth($player['token'], self::SECRET))->assertJsonPath('licence.held', true);
    }

    public function test_buying_twice_takes_the_price_once(): void
    {
        $player = $this->veteran();
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))->assertOk();
        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'police_licence_held');

        $this->assertSame(700, $this->balance($bankWallet));
        $this->assertSame(1, DB::table('transactions')->where('type', 'police_licence')->count());
    }

    public function test_a_young_account_cannot_buy_the_licence(): void
    {
        $player = $this->player();
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS - 1)]);
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 1000);

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'police_account_too_new');

        $this->assertSame(1000, $this->balance($bankWallet));
        $this->getJson('/api/police/licence', $this->auth($player['token'], self::SECRET))->assertJsonPath('licence.held', false);
    }

    public function test_cash_on_hand_does_not_pay_for_the_licence(): void
    {
        $player = $this->veteran();
        $bankWallet = $this->setWalletBalance($player['account_id'], 'coins', 299);
        $this->setWalletBalance($player['account_id'], 'cash', 1000);

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))
            ->assertUnprocessable()
            ->assertJsonPath('code', 'police_insufficient_funds');

        $this->assertSame(299, $this->balance($bankWallet));
        $this->assertSame(0, DB::table('transactions')->where('type', 'police_licence')->count());
    }

    public function test_a_prisoner_cannot_buy_the_licence(): void
    {
        $player = $this->veteran();
        $this->setWalletBalance($player['account_id'], 'coins', 1000);
        $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => 2, 'ms_left' => 240_000], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'police_jailed');
    }

    public function test_a_player_held_by_an_officer_cannot_buy_the_licence(): void
    {
        $player = $this->veteran();
        $this->setWalletBalance($player['account_id'], 'coins', 1000);
        $this->putJson('/api/jail', ['kind' => 'officer', 'stars' => 0, 'ms_left' => 600_000], $this->auth($player['token'], self::SECRET))->assertOk();

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))
            ->assertStatus(409)
            ->assertJsonPath('code', 'police_jailed');
    }

    public function test_the_licence_is_lost_at_the_hospital_and_in_a_cell(): void
    {
        $this->seed(ShopSeeder::class);
        foreach ([[], ['jailed' => true, 'jail_stars' => 1]] as $body) {
            $player = $this->licensed();
            if ($body !== []) {
                $this->putJson('/api/jail', ['kind' => 'npc', 'stars' => 1, 'ms_left' => 120_000], $this->auth($player['token'], self::SECRET))->assertOk();
            }

            $this->postJson('/api/survival/hospital', $body, $this->auth($player['token'], self::SECRET))
                ->assertOk()
                ->assertJsonPath('licence_lost', true);

            $this->getJson('/api/police/licence', $this->auth($player['token'], self::SECRET))->assertJsonPath('licence.held', false);
        }
    }

    public function test_the_licence_is_lost_at_an_alcohol_black_out(): void
    {
        $player = $this->licensed();

        $this->postJson('/api/survival/hangover', [], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('licence_lost', true);

        $this->getJson('/api/police/licence', $this->auth($player['token'], self::SECRET))->assertJsonPath('licence.held', false);
    }

    public function test_a_death_without_licence_reports_nothing_lost_and_the_licence_can_be_bought_again(): void
    {
        $this->seed(ShopSeeder::class);
        $player = $this->licensed();
        $this->postJson('/api/survival/hospital', [], $this->auth($player['token'], self::SECRET))->assertJsonPath('licence_lost', true);
        $this->postJson('/api/survival/hospital', [], $this->auth($player['token'], self::SECRET))->assertJsonPath('licence_lost', false);
        $this->setWalletBalance($player['account_id'], 'coins', 300);

        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))->assertOk()->assertJsonPath('licence.held', true);

        $this->assertSame(2, DB::table('transactions')->where('type', 'police_licence')->count());
    }

    /** @return array{token: string, account_id: int} */
    private function licensed(): array
    {
        $player = $this->veteran();
        $this->setWalletBalance($player['account_id'], 'coins', PoliceLicenceService::PRICE);
        $this->postJson('/api/police/licence', [], $this->auth($player['token'], self::SECRET))->assertOk();

        return $player;
    }

    /** @return array{token: string, account_id: int} */
    private function veteran(): array
    {
        $player = $this->player();
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS + 1)]);

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
