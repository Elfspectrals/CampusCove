<?php

namespace Tests\Feature;

use App\Services\PubQuizService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class PubQuizApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_the_prize_grows_by_8_per_extra_valid_contestant_up_to_120(): void
    {
        $this->assertSame(0, PubQuizService::prizeCoins(0));
        $this->assertSame(0, PubQuizService::prizeCoins(1));
        $this->assertSame(8, PubQuizService::prizeCoins(2));
        $this->assertSame(72, PubQuizService::prizeCoins(10));
        $this->assertSame(120, PubQuizService::prizeCoins(16));
        $this->assertSame(120, PubQuizService::prizeCoins(20));
    }

    public function test_the_winner_is_paid_in_cash_and_gets_a_pint(): void
    {
        [$winner, $second, $third] = [$this->player(), $this->player(), $this->player()];

        $this->reward($winner, 'room:1', [$this->entry($winner, 15), $this->entry($second, 12), $this->entry($third, 14)])
            ->assertOk()
            ->assertExactJson(['coins' => 16, 'pint' => true, 'valid_contestants' => 3]);

        $this->assertSame(16, $this->balance($winner['account_id']));
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'pub_reward_quiz')->where('delta', 16)->count());
    }

    public function test_a_quiz_pays_once_however_often_the_socket_asks(): void
    {
        [$winner, $other] = [$this->player(), $this->player()];
        $contestants = [$this->entry($winner, 15), $this->entry($other, 15)];

        $this->reward($winner, 'room:1', $contestants)->assertOk()->assertJsonPath('coins', 8);
        $this->reward($winner, 'room:1', $contestants)->assertOk()->assertJsonPath('coins', 8);
        $this->reward($other, 'room:1', $contestants)->assertOk()->assertJsonPath('coins', 8);

        $this->assertSame(8, $this->balance($winner['account_id']));
        $this->assertSame(0, $this->balance($other['account_id']));
        $this->assertSame(1, DB::table('pub_quiz_wins')->count());
    }

    public function test_fewer_than_12_answers_or_an_account_under_72_hours_does_not_count(): void
    {
        $winner = $this->player();
        $elevenAnswers = $this->player();
        $exactly72Hours = $this->player(hoursOld: 72);
        $justUnder72Hours = $this->player(hoursOld: 71.99);

        $this->reward($winner, 'room:1', [
            $this->entry($winner, 12),
            $this->entry($elevenAnswers, 11),
            $this->entry($exactly72Hours, 12),
            $this->entry($justUnder72Hours, 15),
        ])->assertOk()->assertExactJson(['coins' => 8, 'pint' => true, 'valid_contestants' => 2]);
    }

    public function test_a_winner_alone_with_invalid_contestants_gets_nothing(): void
    {
        $winner = $this->player();
        $alt = $this->player(hoursOld: 1);

        $this->reward($winner, 'room:1', [$this->entry($winner, 15), $this->entry($alt, 15)])
            ->assertOk()
            ->assertExactJson(['coins' => 0, 'pint' => false, 'valid_contestants' => 1]);

        $this->assertSame(0, $this->balance($winner['account_id']));
        $this->postJson('/api/pub/order', ['code' => 'drink_stout'], $this->auth($winner['token'], self::SECRET))->assertStatus(422);
    }

    public function test_the_winner_must_be_a_contestant(): void
    {
        [$winner, $other] = [$this->player(), $this->player()];

        $this->reward($winner, 'room:1', [$this->entry($other, 15)])
            ->assertStatus(422)
            ->assertJsonPath('code', 'quiz_not_contestant');
        $this->assertSame(0, DB::table('pub_quiz_wins')->count());
    }

    public function test_the_pint_is_one_free_stout_or_lager_within_24_hours(): void
    {
        [$winner, $other] = [$this->player(), $this->player()];
        $this->setWalletBalance($winner['account_id'], 'cash', 100);
        $this->reward($winner, 'room:1', [$this->entry($winner, 15), $this->entry($other, 15)])->assertOk();
        $headers = $this->auth($winner['token'], self::SECRET);

        $this->postJson('/api/pub/order', ['code' => 'drink_whisky'], $headers)->assertOk()->assertJsonPath('price', 40);
        $this->postJson('/api/pub/order', ['code' => 'drink_lager'], $headers)
            ->assertOk()
            ->assertExactJson(['code' => 'drink_lager', 'price' => 0, 'balance_after' => 68]);
        $this->postJson('/api/pub/order', ['code' => 'drink_lager'], $headers)->assertOk()->assertJsonPath('price', 22);
    }

    public function test_an_expired_pint_is_charged(): void
    {
        [$winner, $other] = [$this->player(), $this->player()];
        $this->setWalletBalance($winner['account_id'], 'cash', 100);
        $this->reward($winner, 'room:1', [$this->entry($winner, 15), $this->entry($other, 15)])->assertOk();
        DB::table('pub_quiz_wins')->update(['pint_expires_at' => now()->subSecond()]);

        $this->postJson('/api/pub/order', ['code' => 'drink_stout'], $this->auth($winner['token'], self::SECRET))
            ->assertOk()
            ->assertJsonPath('price', 25);
    }

    public function test_the_payload_is_checked(): void
    {
        $winner = $this->player();

        $this->reward($winner, 'room:1', [['account_id' => $winner['account_id'], 'answered' => 16]])->assertStatus(422);
        $this->reward($winner, 'room:1', [])->assertStatus(422);
        $this->reward($winner, 'room:1', [$this->entry($winner, 15), $this->entry($winner, 15)])->assertStatus(422);
    }

    public function test_only_the_realtime_server_can_pay_a_quiz(): void
    {
        [$winner, $other] = [$this->player(), $this->player()];

        $this->postJson('/api/pub/quiz/reward', [
            'quiz_id' => 'room:1',
            'contestants' => [$this->entry($winner, 15), $this->entry($other, 15)],
        ], $this->auth($winner['token']))->assertForbidden();
        $this->assertSame(0, $this->balance($winner['account_id']));
    }

    /**
     * @param  array{token: string, account_id: int}  $winner
     * @param  list<array{account_id: int, answered: int}>  $contestants
     */
    private function reward(array $winner, string $quizId, array $contestants): TestResponse
    {
        return $this->postJson('/api/pub/quiz/reward', ['quiz_id' => $quizId, 'contestants' => $contestants], $this->auth($winner['token'], self::SECRET));
    }

    /**
     * @param  array{account_id: int}  $player
     * @return array{account_id: int, answered: int}
     */
    private function entry(array $player, int $answered): array
    {
        return ['account_id' => $player['account_id'], 'answered' => $answered];
    }

    /** @return array{token: string, account_id: int} */
    private function player(float $hoursOld = 100): array
    {
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $reg = $this->postJson('/api/register', [
            'email' => $username.'@test.com',
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subSeconds((int) round($hoursOld * 3600))]);
        $this->setWalletBalance($accountId, 'cash', 0);

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }

    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter([
            'Authorization' => 'Bearer '.$token,
            'X-Realtime-Secret' => $secret,
        ]);
    }

    private function balance(int $accountId, string $currency = 'cash'): int
    {
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', $currency)->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }
}
