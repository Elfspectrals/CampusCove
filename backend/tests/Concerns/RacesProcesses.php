<?php

namespace Tests\Concerns;

use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Foundation\Testing\Traits\CanConfigureMigrationCommands;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

/**
 * Real races: PHP worker processes (tests/Scripts/*.php), each with its own PostgreSQL connection, released at the
 * same time on a row lock the test holds. No RefreshDatabase: the workers must see committed rows, so the test
 * database (DB_DATABASE=campus_cove_test, phpunit.xml) is rebuilt with migrate:fresh before and after.
 */
trait RacesProcesses
{
    use CanConfigureMigrationCommands;

    protected function setUpRace(): void
    {
        $this->assertStringEndsWith('_test', (string) config('database.connections.'.config('database.default').'.database'), 'races only run on the test database');
        $this->artisan('migrate:fresh', $this->migrateFreshUsing());
    }

    protected function tearDownRace(): void
    {
        // back to the empty migrated database the RefreshDatabase tests run their transactions on
        $this->artisan('migrate:fresh', $this->migrateFreshUsing());
        RefreshDatabaseState::$migrated = true;
    }

    /**
     * Starts the workers while this test holds `$lock` (a FOR UPDATE query), waits until all of them wait on it,
     * then releases it so they race. Returns each worker's JSON answer.
     *
     * @param  callable(): mixed  $lock
     * @param  list<list<string>>  $commands  script path (relative to the backend) and arguments, one per worker
     * @param  array<string, string>  $env  extra environment of the workers
     * @return list<array<string, mixed>>
     */
    protected function race(callable $lock, array $commands, array $env = []): array
    {
        $workers = [];
        DB::beginTransaction();
        try {
            $lock();
            foreach ($commands as $i => $command) {
                $script = array_shift($command);
                $workers[$i] = new Process([PHP_BINARY, base_path($script), ...$command], base_path(), $env + $this->databaseEnv(), null, 60);
                $workers[$i]->start();
            }
            $this->waitUntilWaitingOnLocks(count($commands));
        } finally {
            DB::rollBack();
        }

        $results = [];
        foreach ($workers as $worker) {
            $worker->wait();
            $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput().$worker->getOutput());
            $results[] = json_decode($worker->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }

        return $results;
    }

    /** Connection settings of this test run, so the workers write to the same test database. */
    private function databaseEnv(): array
    {
        $db = config('database.connections.'.config('database.default'));

        return [
            'APP_ENV' => 'testing',
            'DB_CONNECTION' => config('database.default'),
            'DB_HOST' => $db['host'],
            'DB_PORT' => (string) $db['port'],
            'DB_DATABASE' => $db['database'],
            'DB_USERNAME' => $db['username'],
            'DB_PASSWORD' => $db['password'],
            'MAIL_MAILER' => 'array',
            'CACHE_STORE' => 'array',
            // never the developer's real Stripe test keys: the worker scripts bind a fake gateway
            'GEMS_CHECKOUT_MODE' => 'off',
            'STRIPE_SECRET_KEY' => '',
            'STRIPE_WEBHOOK_SECRET' => '',
        ];
    }

    /**
     * Proves the race: every worker is waiting on the row this test locked. pg_locks, not pg_stat_activity, whose
     * values stay frozen for the whole transaction this test is in.
     */
    private function waitUntilWaitingOnLocks(int $expected): void
    {
        $deadline = microtime(true) + 30;
        do {
            $waiting = (int) DB::scalar('SELECT count(DISTINCT pid) FROM pg_locks WHERE NOT granted AND pid <> pg_backend_pid()');
            if ($waiting >= $expected) {
                return;
            }
            usleep(50_000);
        } while (microtime(true) < $deadline);

        $this->fail("Only {$waiting} of {$expected} workers reached the lock");
    }
}
