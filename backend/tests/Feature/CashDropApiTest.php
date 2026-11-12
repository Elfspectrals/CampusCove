<?php

namespace Tests\Feature;

use App\Models\Wallet;
use App\Services\CashDropService;
use App\Services\SurvivalService;
use App\Services\TradeService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class CashDropApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_dying_drops_all_the_cash_carried_and_keeps_the_bank(): void
    {
        $player = $this->player(cash: 240, bank: 500);

        $drop = $this->die($player)->assertOk()->json('cash_drop');

        $this->assertSame(240, $drop['amount']);
        $this->assertSame(0, $this->balance($player['account_id'], Wallet::CASH));
        $this->assertSame(500 - SurvivalService::HOSPITAL_FEE, $this->balance($player['account_id'], Wallet::BANK));
    }

    public function test_dying_without_cash_drops_nothing(): void
    {
        $player = $this->player(cash: 0, bank: 500);

        $this->die($player)->assertOk()->assertJsonPath('cash_drop', null);
        $this->assertSame(0, DB::table('cash_drops')->count());
    }

    public function test_a_new_account_loses_its_cash_without_leaving_a_bag(): void
    {
        $player = $this->player(cash: 300, bank: 0, ageHours: TradeService::MIN_GIVER_AGE_HOURS - 1);

        $this->die($player)->assertOk()->assertJsonPath('cash_drop', null);

        $this->assertSame(0, $this->balance($player['account_id'], Wallet::CASH));
        $this->assertSame(0, DB::table('cash_drops')->count());
    }

    public function test_anyone_can_pick_up_the_bag_once(): void
    {
        $victim = $this->player(cash: 240, bank: 0);
        $finder = $this->player(cash: 10, bank: 0);
        $other = $this->player(cash: 0, bank: 0);
        $drop = $this->die($victim)->json('cash_drop');

        $this->pick($finder, $drop['id'])->assertOk()->assertExactJson(['amount' => 240, 'cash' => 250]);
        $this->pick($other, $drop['id'])->assertStatus(409)->assertJsonPath('code', 'cash_drop_gone');

        $this->assertSame(0, $this->balance($other['account_id'], Wallet::CASH));
    }

    public function test_the_owner_can_pick_up_their_own_bag(): void
    {
        $victim = $this->player(cash: 80, bank: 0);
        $drop = $this->die($victim)->json('cash_drop');

        $this->pick($victim, $drop['id'])->assertOk()->assertJsonPath('cash', 80);
    }

    public function test_the_killer_cannot_take_the_bag_of_the_player_they_knocked_out(): void
    {
        $victim = $this->player(cash: 240, bank: 0);
        $killer = $this->player(cash: 0, bank: 0);
        $drop = $this->die($victim, $killer['account_id'])->json('cash_drop');

        $this->pick($killer, $drop['id'])->assertForbidden()->assertJsonPath('code', 'cash_drop_killer');

        $this->assertSame(0, $this->balance($killer['account_id'], Wallet::CASH));
        $this->assertNull(DB::table('cash_drops')->where('id', $drop['id'])->value('picked_at'));
    }

    public function test_the_bag_can_be_picked_until_five_minutes_and_is_gone_after(): void
    {
        $victim = $this->player(cash: 50, bank: 0);
        $early = $this->player(cash: 0, bank: 0);
        $late = $this->player(cash: 0, bank: 0);
        $first = $this->die($victim)->json('cash_drop');
        $this->setWalletBalance($victim['account_id'], Wallet::CASH, 60);
        $second = $this->die($victim)->json('cash_drop');

        $this->travel(CashDropService::LIFETIME_MINUTES * 60 - 1)->seconds();
        $this->pick($early, $first['id'])->assertOk();
        $this->travel(2)->seconds();
        $this->pick($late, $second['id'])->assertStatus(409)->assertJsonPath('code', 'cash_drop_gone');
    }

    public function test_the_browser_cannot_pick_up_a_bag_without_the_socket(): void
    {
        $victim = $this->player(cash: 50, bank: 0);
        $finder = $this->player(cash: 0, bank: 0);
        $drop = $this->die($victim)->json('cash_drop');

        $this->postJson("/api/cash-drops/{$drop['id']}/pick", [], $this->auth($finder['token']))->assertForbidden();
    }

    /** @param array{token: string} $player */
    private function die(array $player, ?int $killerAccountId = null): TestResponse
    {
        return $this->postJson('/api/survival/hospital', array_filter(['killer_account_id' => $killerAccountId]), $this->auth($player['token'], self::SECRET));
    }

    /** @param array{token: string} $player */
    private function pick(array $player, int $dropId): TestResponse
    {
        return $this->postJson("/api/cash-drops/{$dropId}/pick", [], $this->auth($player['token'], self::SECRET));
    }

    /** @return array{token: string, account_id: int} */
    private function player(int $cash, int $bank, int $ageHours = TradeService::MIN_GIVER_AGE_HOURS + 1): array
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
