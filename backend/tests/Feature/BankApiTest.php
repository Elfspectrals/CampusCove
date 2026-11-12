<?php

namespace Tests\Feature;

use App\Models\Wallet;
use App\Services\TradeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class BankApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_withdraw_moves_money_from_the_bank_to_the_cash_on_you(): void
    {
        $player = $this->player(bank: 500, cash: 20);

        $this->postJson('/api/bank/withdraw', ['ref' => uniqid(), 'amount' => 200], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['cash' => 220, 'bank' => 300]);

        $this->assertSame(300, $this->balance($player['account_id'], Wallet::BANK));
        $this->assertSame(220, $this->balance($player['account_id'], Wallet::CASH));
    }

    public function test_deposit_moves_cash_into_the_bank(): void
    {
        $player = $this->player(bank: 0, cash: 80);

        $this->postJson('/api/bank/deposit', ['ref' => uniqid(), 'amount' => 80], $this->auth($player['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['cash' => 0, 'bank' => 80]);
    }

    public function test_withdrawing_more_than_the_bank_holds_moves_nothing(): void
    {
        $player = $this->player(bank: 100, cash: 0);

        $this->postJson('/api/bank/withdraw', ['ref' => uniqid(), 'amount' => 101], $this->auth($player['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'bank_insufficient_funds');

        $this->assertSame(100, $this->balance($player['account_id'], Wallet::BANK));
        $this->assertSame(0, $this->balance($player['account_id'], Wallet::CASH));
    }

    public function test_depositing_more_cash_than_carried_is_refused(): void
    {
        $player = $this->player(bank: 0, cash: 10);

        $this->postJson('/api/bank/deposit', ['ref' => uniqid(), 'amount' => 11], $this->auth($player['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'bank_insufficient_funds');
    }

    public function test_the_same_withdrawal_sent_twice_is_done_once(): void
    {
        $player = $this->player(bank: 500, cash: 0);
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/bank/withdraw', ['ref' => 'atm-1', 'amount' => 100], $headers)->assertOk();
        $this->postJson('/api/bank/withdraw', ['ref' => 'atm-1', 'amount' => 100], $headers)
            ->assertStatus(409)
            ->assertJsonPath('code', 'bank_already_done');

        $this->assertSame(400, $this->balance($player['account_id'], Wallet::BANK));
        $this->assertSame(100, $this->balance($player['account_id'], Wallet::CASH));
    }

    public function test_the_same_transfer_sent_twice_is_done_once(): void
    {
        $sender = $this->player(bank: 300, cash: 0, ageHours: TradeService::MIN_GIVER_AGE_HOURS + 1);
        $receiver = $this->player(bank: 0, cash: 0);
        $body = ['ref' => 'atm-2', 'username' => $receiver['username'], 'tag' => $receiver['tag'], 'amount' => 50];
        $headers = $this->auth($sender['token'], self::SECRET);

        $this->postJson('/api/bank/transfer', $body, $headers)->assertOk();
        $this->postJson('/api/bank/transfer', $body, $headers)->assertStatus(409);

        $this->assertSame(50, $this->balance($receiver['account_id'], Wallet::BANK));
    }

    public function test_an_amount_of_zero_is_refused(): void
    {
        $player = $this->player(bank: 100, cash: 0);

        $this->postJson('/api/bank/withdraw', ['ref' => uniqid(), 'amount' => 0], $this->auth($player['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonValidationErrors('amount');
    }

    public function test_the_browser_cannot_move_money_without_the_socket(): void
    {
        $player = $this->player(bank: 100, cash: 0);

        $this->postJson('/api/bank/withdraw', ['ref' => uniqid(), 'amount' => 50], $this->auth($player['token']))->assertForbidden();
        $this->postJson('/api/bank/deposit', ['ref' => uniqid(), 'amount' => 50], $this->auth($player['token']))->assertForbidden();

        $this->assertSame(100, $this->balance($player['account_id'], Wallet::BANK));
    }

    public function test_a_transfer_moves_bank_money_to_another_player_and_shows_in_both_histories(): void
    {
        $sender = $this->player(bank: 300, cash: 0, ageHours: TradeService::MIN_GIVER_AGE_HOURS + 1);
        $receiver = $this->player(bank: 0, cash: 0);

        $this->postJson('/api/bank/transfer', [
            'ref' => uniqid(),
            'username' => strtoupper($receiver['username']),
            'tag' => $receiver['tag'],
            'amount' => 120,
        ], $this->auth($sender['token'], self::SECRET))
            ->assertOk()
            ->assertExactJson(['bank' => 180]);

        $this->assertSame(120, $this->balance($receiver['account_id'], Wallet::BANK));
        $sent = $this->getJson('/api/bank', $this->auth($sender['token']))->assertOk()->json('history.0');
        $this->assertSame(['bank_transfer_out', -120], [$sent['reason'], $sent['delta']]);
        $received = $this->getJson('/api/bank', $this->auth($receiver['token']))->assertOk()->json('history.0');
        $this->assertSame(['bank_transfer_in', 120], [$received['reason'], $received['delta']]);
        $this->assertSame($sent['from'], $received['from']);
        $this->assertStringStartsWith($receiver['username'].'#', $received['to']);
    }

    public function test_a_new_account_can_receive_a_transfer_but_not_send_one(): void
    {
        $sender = $this->player(bank: 300, cash: 0, ageHours: TradeService::MIN_GIVER_AGE_HOURS - 1);
        $receiver = $this->player(bank: 0, cash: 0);

        $this->postJson('/api/bank/transfer', ['ref' => uniqid(), 'username' => $receiver['username'], 'tag' => $receiver['tag'], 'amount' => 10], $this->auth($sender['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'bank_account_too_new');

        $this->assertSame(300, $this->balance($sender['account_id'], Wallet::BANK));
    }

    public function test_a_transfer_to_yourself_or_to_nobody_is_refused(): void
    {
        $sender = $this->player(bank: 300, cash: 0, ageHours: TradeService::MIN_GIVER_AGE_HOURS + 1);
        $headers = $this->auth($sender['token'], self::SECRET);

        $this->postJson('/api/bank/transfer', ['ref' => uniqid(), 'username' => $sender['username'], 'tag' => $sender['tag'], 'amount' => 10], $headers)
            ->assertStatus(422)
            ->assertJsonPath('code', 'bank_self_transfer');
        $this->postJson('/api/bank/transfer', ['ref' => uniqid(), 'username' => 'nobody_here', 'tag' => 1, 'amount' => 10], $headers)
            ->assertNotFound()
            ->assertJsonPath('code', 'bank_unknown_recipient');
    }

    public function test_a_transfer_beyond_the_bank_balance_moves_nothing(): void
    {
        $sender = $this->player(bank: 50, cash: 500, ageHours: TradeService::MIN_GIVER_AGE_HOURS + 1);
        $receiver = $this->player(bank: 0, cash: 0);

        $this->postJson('/api/bank/transfer', ['ref' => uniqid(), 'username' => $receiver['username'], 'tag' => $receiver['tag'], 'amount' => 51], $this->auth($sender['token'], self::SECRET))
            ->assertStatus(422)
            ->assertJsonPath('code', 'bank_insufficient_funds');

        $this->assertSame(0, $this->balance($receiver['account_id'], Wallet::BANK));
    }

    public function test_the_bank_screen_shows_both_balances(): void
    {
        $player = $this->player(bank: 700, cash: 45);

        $this->getJson('/api/bank', $this->auth($player['token']))
            ->assertOk()
            ->assertJsonPath('cash', 45)
            ->assertJsonPath('bank', 700);
    }

    /** @return array{token: string, account_id: int, username: string, tag: int} */
    private function player(int $bank, int $cash, int $ageHours = 0): array
    {
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $reg = $this->postJson('/api/register', [
            'email' => 'u'.uniqid('', true).'@test.com',
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $this->setWalletBalance($accountId, Wallet::BANK, $bank);
        $this->setWalletBalance($accountId, Wallet::CASH, $cash);
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours($ageHours)]);

        return [
            'token' => (string) $reg->json('token'),
            'account_id' => $accountId,
            'username' => $username,
            'tag' => (int) DB::table('account_handles')->where('account_id', $accountId)->value('tag'),
        ];
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

    private function balance(int $accountId, string $currency): int
    {
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', $currency)->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }
}
