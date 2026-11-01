<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Real races on JobService: several PHP processes, each with its own database connection, call it at the same
 * instant (tests/Support/job_race_worker.php). RefreshDatabase would hide this test's rows from the other
 * connections, so the rows are committed here and deleted in tearDown.
 */
class JobConcurrencyTest extends TestCase
{
    private const RACERS = 6;

    private ?int $accountId = null;

    protected function setUp(): void
    {
        parent::setUp();
        Artisan::call('migrate', ['--force' => true]);
        $this->accountId = (int) DB::table('accounts')->insertGetId([], 'account_id');
    }

    protected function tearDown(): void
    {
        if ($this->accountId !== null) {
            $walletIds = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $this->accountId)->pluck('wallet_id');
            DB::table('wallet_ledger')->whereIn('wallet_id', $walletIds)->delete();
            DB::table('wallets')->whereIn('wallet_id', $walletIds)->delete();
            DB::table('transactions')->where('created_by_account_id', $this->accountId)->delete();
            DB::table('accounts')->where('account_id', $this->accountId)->delete();
        }
        parent::tearDown();
    }

    public function test_racing_payments_of_one_period_credit_it_once(): void
    {
        $shiftId = (int) DB::table('job_shifts')->insertGetId([
            'account_id' => $this->accountId, 'job' => 'dev', 'building_key' => 'tech_hub', 'station_id' => 'station_dev_01',
            'salary_coins' => 10, 'period_seconds' => 60,
            'started_at' => DB::raw("now() - interval '61 seconds'"),
            'last_activity_at' => DB::raw("now() - interval '61 seconds'"),
        ], 'shift_id');

        $outcomes = $this->race('pay', (string) $shiftId, '1');

        $this->assertCount(self::RACERS, $outcomes);
        $this->assertTrue(collect($outcomes)->every(fn (array $o): bool => $o['ok'] === true && $o['result']['coins'] === 10), json_encode($outcomes));
        $this->assertSame(1, collect($outcomes)->where('result.already_paid', false)->count());
        $this->assertSame(self::RACERS - 1, collect($outcomes)->where('result.already_paid', true)->count());
        $this->assertSame(1, DB::table('job_salary_payments')->where('shift_id', $shiftId)->count());
        $walletId = DB::table('wallets')->where('owner_id', $this->accountId)->where('currency', 'coins')->value('wallet_id');
        $this->assertSame(1, DB::table('wallet_ledger')->where('wallet_id', $walletId)->count());
        $this->assertSame(10, (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta'));
        $this->assertStartedTogether($outcomes);
    }

    public function test_racing_starts_of_one_account_leave_a_single_open_shift(): void
    {
        $outcomes = $this->race('start', '-', '-');

        $this->assertCount(self::RACERS, $outcomes);
        $started = collect($outcomes)->where('ok', true);
        $this->assertTrue(collect($outcomes)->every(fn (array $o): bool => $o['ok'] === true || $o['code'] === 'already_working'), json_encode($outcomes));
        $this->assertGreaterThanOrEqual(1, $started->count());
        $this->assertSame($started->count(), DB::table('job_shifts')->where('account_id', $this->accountId)->count());
        $this->assertSame(1, DB::table('job_shifts')->where('account_id', $this->accountId)->whereNull('ended_at')->count());
        $this->assertStartedTogether($outcomes);
    }

    /** @return list<array<string, mixed>> */
    private function race(string $action, string $shiftId, string $period): array
    {
        $db = config('database.connections.'.config('database.default'));
        $env = array_merge(getenv(), [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => (string) config('database.default'),
            'DB_HOST' => (string) $db['host'],
            'DB_PORT' => (string) $db['port'],
            'DB_DATABASE' => (string) $db['database'],
            'DB_USERNAME' => (string) $db['username'],
            'DB_PASSWORD' => (string) $db['password'],
        ]);
        // far enough ahead for every process to boot Laravel first
        $startAt = sprintf('%.6F', microtime(true) + 4);
        $processes = [];
        for ($i = 0; $i < self::RACERS; $i++) {
            $command = [PHP_BINARY, base_path('tests/Support/job_race_worker.php'), $action, (string) $this->accountId, $shiftId, $period, $startAt];
            $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), $env);
            $this->assertIsResource($process);
            $processes[] = [$process, $pipes];
        }

        $outcomes = [];
        foreach ($processes as [$process, $pipes]) {
            $out = stream_get_contents($pipes[1]);
            $err = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($process);
            $decoded = json_decode((string) $out, true);
            $this->assertIsArray($decoded, "racer output: $out $err");
            $outcomes[] = $decoded;
        }

        return $outcomes;
    }

    /** @param list<array<string, mixed>> $outcomes */
    private function assertStartedTogether(array $outcomes): void
    {
        $times = array_column($outcomes, 'at');
        // every racer finished within a short window: they ran at the same time, not one after the other's exit
        $this->assertLessThan(1.0, max($times) - min($times));
    }
}
