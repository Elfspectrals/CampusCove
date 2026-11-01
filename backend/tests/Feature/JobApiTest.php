<?php

namespace Tests\Feature;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

/**
 * Paid jobs (docs/JOBS.md). The whole test runs in one database transaction, so Postgres now() does not move:
 * time passes by moving a shift's started_at back (worked()).
 */
class JobApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_starting_a_shift_returns_the_rules_of_the_job(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');

        $res = $this->postJson('/api/jobs/shifts', $this->devStation(), $this->auth($player['token'], self::SECRET))
            ->assertCreated()
            ->assertJsonPath('job', 'dev')
            ->assertJsonPath('building', 'tech_hub')
            ->assertJsonPath('station', 'station_dev_03')
            ->assertJsonPath('salary_coins', 10)
            ->assertJsonPath('period_seconds', 60)
            ->assertJsonPath('survival_drain_factor', 0.25);

        $shift = DB::table('job_shifts')->where('shift_id', $res->json('shift_id'))->first();
        $this->assertSame($player['account_id'], (int) $shift->account_id);
        $this->assertSame('station_dev_03', $shift->station_id);
        $this->assertNull($shift->ended_at);
    }

    public function test_the_salary_and_period_come_from_the_config_and_are_kept_by_the_shift(): void
    {
        config(['jobs.jobs.dev.salary_coins' => 25, 'jobs.jobs.dev.period_seconds' => 30]);
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $shiftId = $this->postJson('/api/jobs/shifts', $this->devStation(), $headers)
            ->assertJsonPath('salary_coins', 25)
            ->assertJsonPath('period_seconds', 30)
            ->json('shift_id');
        config(['jobs.jobs.dev.salary_coins' => 99]);
        $this->worked($shiftId, 31);

        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $headers)->assertOk()->assertJsonPath('coins', 25);
        $this->assertSame(25, $this->balance($player['account_id'], 'coins'));
    }

    public function test_unknown_jobs_other_buildings_and_bad_stations_are_refused(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/jobs/shifts', ['job' => 'astronaut', 'building' => 'tech_hub', 'station' => 'station_dev_01'], $headers)
            ->assertStatus(404)->assertJsonPath('code', 'unknown_job');
        $this->postJson('/api/jobs/shifts', ['job' => 'dev', 'building' => 'cafe', 'station' => 'station_dev_01'], $headers)
            ->assertStatus(422)->assertJsonPath('code', 'wrong_building');
        $this->postJson('/api/jobs/shifts', ['job' => 'dev', 'building' => 'tech_hub', 'station' => 'Station 1; DROP'], $headers)
            ->assertStatus(422);
        $this->assertSame(0, DB::table('job_shifts')->count());
    }

    public function test_the_first_salary_is_paid_after_a_full_period_in_coins_only(): void
    {
        $player = $this->registerAndCreditWallet(100, 'coins');
        $this->setWalletBalance($player['account_id'], 'premium', 7);
        $headers = $this->auth($player['token'], self::SECRET);
        $shiftId = $this->startShift($headers);

        $this->worked($shiftId, 45);
        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'period_not_complete');
        $this->assertSame(100, $this->balance($player['account_id'], 'coins'));

        $this->worked($shiftId, 16);
        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $headers)
            ->assertOk()
            ->assertExactJson(['shift_id' => $shiftId, 'period' => 1, 'coins' => 10, 'already_paid' => false, 'balance_after' => 110]);

        $this->assertSame(110, $this->balance($player['account_id'], 'coins'));
        $this->assertSame(7, $this->balance($player['account_id'], 'premium'));
        $entry = DB::table('wallet_ledger')->where('reason', 'job_salary_dev')->sole();
        $this->assertSame(10, (int) $entry->delta);
        $tx = DB::table('transactions')->where('tx_id', $entry->tx_id)->sole();
        $this->assertSame('reward', $tx->type);
        $meta = json_decode($tx->meta_json, true);
        $this->assertSame(['dev', $shiftId, 1, 'tech_hub', 'station_dev_03'], [$meta['job'], $meta['shift_id'], $meta['period'], $meta['building'], $meta['station']]);
        $payment = DB::table('job_salary_payments')->sole();
        $this->assertSame([$shiftId, 1, 10, (int) $tx->tx_id], [(int) $payment->shift_id, (int) $payment->period, (int) $payment->coins, (int) $payment->tx_id]);
    }

    public function test_a_replayed_period_is_never_paid_twice(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $shiftId = $this->startShift($headers);
        $this->worked($shiftId, 125);

        foreach ([[1, false], [1, true], [2, false], [1, true], [2, true]] as [$period, $alreadyPaid]) {
            $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => $period], $headers)
                ->assertOk()
                ->assertJsonPath('coins', 10)
                ->assertJsonPath('already_paid', $alreadyPaid);
        }
        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 3], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'period_not_complete');

        $this->assertSame(20, $this->balance($player['account_id'], 'coins'));
        $this->assertSame(2, DB::table('wallet_ledger')->where('reason', 'job_salary_dev')->count());
        $this->assertSame(2, DB::table('job_salary_payments')->where('shift_id', $shiftId)->count());
    }

    public function test_the_database_refuses_a_second_payment_of_the_same_period(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $shiftId = $this->startShift($this->auth($player['token'], self::SECRET));
        DB::table('job_salary_payments')->insert(['shift_id' => $shiftId, 'period' => 1, 'coins' => 10]);

        $this->expectException(UniqueConstraintViolationException::class);
        DB::table('job_salary_payments')->insert(['shift_id' => $shiftId, 'period' => 1, 'coins' => 10]);
    }

    public function test_the_database_refuses_a_second_open_shift_for_one_account(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $this->startShift($this->auth($player['token'], self::SECRET));

        $this->expectException(UniqueConstraintViolationException::class);
        DB::table('job_shifts')->insert([
            'account_id' => $player['account_id'], 'job' => 'dev', 'building_key' => 'tech_hub', 'station_id' => 'station_dev_04',
            'salary_coins' => 10, 'period_seconds' => 60,
        ]);
    }

    public function test_a_new_shift_closes_the_one_left_open_and_its_periods_stay_unpaid(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $old = $this->startShift($headers);
        $this->worked($old, 600);

        $new = $this->startShift($headers);

        $this->assertNotSame($old, $new);
        $closed = DB::table('job_shifts')->where('shift_id', $old)->sole();
        $this->assertSame('superseded', $closed->end_reason);
        $this->assertSame($closed->last_activity_at, $closed->ended_at);
        $this->postJson("/api/jobs/shifts/$old/salary", ['period' => 1], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'shift_ended');
        $this->postJson("/api/jobs/shifts/$new/salary", ['period' => 1], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'period_not_complete');
        $this->assertSame(0, $this->balance($player['account_id'], 'coins'));
        $this->assertSame(1, DB::table('job_shifts')->whereNull('ended_at')->count());
    }

    public function test_ending_keeps_completed_periods_payable_and_nothing_after(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $shiftId = $this->startShift($headers);
        $this->worked($shiftId, 90);

        $this->postJson("/api/jobs/shifts/$shiftId/end", ['reason' => 'left'], $headers)
            ->assertOk()->assertExactJson(['shift_id' => $shiftId, 'ended' => true]);
        $this->postJson("/api/jobs/shifts/$shiftId/end", ['reason' => 'disconnected'], $headers)
            ->assertOk()->assertExactJson(['shift_id' => $shiftId, 'ended' => false]);
        // the clock goes on after the end: period 2 would be complete now, but it ended at 90 s
        $this->worked($shiftId, 600);

        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $headers)->assertOk()->assertJsonPath('coins', 10);
        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 2], $headers)
            ->assertStatus(409)->assertJsonPath('code', 'shift_ended');
        $this->assertSame(10, $this->balance($player['account_id'], 'coins'));
        $this->assertSame('left', DB::table('job_shifts')->where('shift_id', $shiftId)->value('end_reason'));
    }

    public function test_a_shift_only_pays_its_own_account(): void
    {
        $owner = $this->registerAndCreditWallet(0, 'coins');
        $thief = $this->registerAndCreditWallet(0, 'coins');
        $shiftId = $this->startShift($this->auth($owner['token'], self::SECRET));
        $this->worked($shiftId, 61);
        $thiefHeaders = $this->auth($thief['token'], self::SECRET);

        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $thiefHeaders)
            ->assertStatus(404)->assertJsonPath('code', 'shift_not_found');
        $this->postJson("/api/jobs/shifts/$shiftId/end", ['reason' => 'left'], $thiefHeaders)
            ->assertStatus(404)->assertJsonPath('code', 'shift_not_found');
        $this->assertSame(0, $this->balance($thief['account_id'], 'coins'));
        $this->assertSame(0, $this->balance($owner['account_id'], 'coins'));
    }

    public function test_job_routes_need_the_realtime_server(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $shiftId = $this->startShift($this->auth($player['token'], self::SECRET));
        $this->worked($shiftId, 61);
        $headers = $this->auth($player['token']);

        $this->postJson('/api/jobs/shifts', $this->devStation(), $headers)->assertStatus(403)->assertJsonPath('code', 'realtime_only');
        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $headers)->assertStatus(403)->assertJsonPath('code', 'realtime_only');
        $this->postJson("/api/jobs/shifts/$shiftId/end", ['reason' => 'left'], $headers)->assertStatus(403)->assertJsonPath('code', 'realtime_only');
        $this->assertSame(0, $this->balance($player['account_id'], 'coins'));
    }

    public function test_a_banned_account_is_not_paid(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $shiftId = $this->startShift($headers);
        $this->worked($shiftId, 61);
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['banned_at' => now(), 'ban_reason' => 'test']);

        $this->postJson("/api/jobs/shifts/$shiftId/salary", ['period' => 1], $this->auth($player['token'], self::SECRET))
            ->assertStatus(403)->assertJsonPath('code', 'account_banned');
        $this->assertSame(0, $this->balance($player['account_id'], 'coins'));
    }

    public function test_stale_shifts_are_closed_at_their_last_activity(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = $this->auth($player['token'], self::SECRET);
        $fresh = $this->startShift($headers);
        $this->worked($fresh, 61);
        $this->postJson("/api/jobs/shifts/$fresh/salary", ['period' => 1], $headers)->assertOk();
        $other = $this->registerAndCreditWallet(0, 'coins');
        $otherHeaders = $this->auth($other['token'], self::SECRET);
        $stale = $this->startShift($otherHeaders);
        // started 10 min ago and never paid since: the realtime server that ran it is gone
        $this->worked($stale, 600);

        $this->artisan('jobs:close-stale')->expectsOutput('Closed 1 stale shift(s).')->assertSuccessful();

        $closed = DB::table('job_shifts')->where('shift_id', $stale)->sole();
        $this->assertSame(['stale', $closed->started_at], [$closed->end_reason, $closed->ended_at]);
        $this->assertNull(DB::table('job_shifts')->where('shift_id', $fresh)->value('ended_at'));
        $this->postJson("/api/jobs/shifts/$stale/salary", ['period' => 1], $otherHeaders)
            ->assertStatus(409)->assertJsonPath('code', 'shift_ended');
        $this->assertSame(0, $this->balance($other['account_id'], 'coins'));
    }

    /** @return array{job: string, building: string, station: string} */
    private function devStation(): array
    {
        return ['job' => 'dev', 'building' => 'tech_hub', 'station' => 'station_dev_03'];
    }

    /** @param array<string, string> $headers */
    private function startShift(array $headers): int
    {
        return (int) $this->postJson('/api/jobs/shifts', $this->devStation(), $headers)->assertCreated()->json('shift_id');
    }

    /** `seconds` pass: every timestamp of the shift moves that far into the past (an open end stays open). */
    private function worked(int $shiftId, int $seconds): void
    {
        $interval = "interval '$seconds seconds'";
        DB::table('job_shifts')->where('shift_id', $shiftId)->update([
            'started_at' => DB::raw("started_at - $interval"),
            'last_activity_at' => DB::raw("last_activity_at - $interval"),
            'ended_at' => DB::raw("ended_at - $interval"),
        ]);
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
