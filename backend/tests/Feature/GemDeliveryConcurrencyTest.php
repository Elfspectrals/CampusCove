<?php

namespace Tests\Feature;

use App\Models\GemOrder;
use Illuminate\Foundation\Testing\RefreshDatabaseState;
use Illuminate\Foundation\Testing\Traits\CanConfigureMigrationCommands;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;
use Tests\Concerns\BuysGems;
use Tests\TestCase;

/**
 * Webhook workers delivering the same paid order at the same time, each in its own PHP process with its own
 * PostgreSQL connection (tests/Scripts/apply-checkout-session.php). The test holds the order row lock until all of
 * them wait on it, then releases it so they race. No RefreshDatabase: the other processes must see committed rows,
 * so the database is rebuilt with migrate:fresh before and after.
 */
class GemDeliveryConcurrencyTest extends TestCase
{
    use BuysGems, CanConfigureMigrationCommands;

    private const WORKERS = 3;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('migrate:fresh', $this->migrateFreshUsing());
        $this->setUpGemShop();
    }

    protected function tearDown(): void
    {
        // back to the empty migrated database the RefreshDatabase tests run their transactions on
        $this->artisan('migrate:fresh', $this->migrateFreshUsing());
        RefreshDatabaseState::$migrated = true;
        parent::tearDown();
    }

    public function test_workers_racing_on_the_same_payment_credit_it_once(): void
    {
        $player = $this->registerPlayer();
        [$publicId, $sessionId] = $this->openCheckout($player, 'gems_650');
        $this->stripe->pay($sessionId);
        $snapshot = tempnam(sys_get_temp_dir(), 'gem-session-');
        file_put_contents($snapshot, json_encode($this->stripe->retrieveCheckoutSession($sessionId), JSON_THROW_ON_ERROR));

        $workers = [];
        DB::beginTransaction();
        try {
            DB::table('gem_orders')->where('public_id', $publicId)->lockForUpdate()->first();
            for ($i = 0; $i < self::WORKERS; $i++) {
                $workers[$i] = new Process([PHP_BINARY, base_path('tests/Scripts/apply-checkout-session.php'), $snapshot], base_path(), $this->databaseEnv(), null, 60);
                $workers[$i]->start();
            }
            $this->waitUntilWaitingOnLocks(self::WORKERS);
        } finally {
            DB::rollBack();
        }

        $results = [];
        foreach ($workers as $worker) {
            $worker->wait();
            $this->assertTrue($worker->isSuccessful(), $worker->getErrorOutput().$worker->getOutput());
            $results[] = json_decode($worker->getOutput(), true, flags: JSON_THROW_ON_ERROR);
        }
        @unlink($snapshot);

        $order = GemOrder::query()->where('public_id', $publicId)->sole();
        $this->assertSame('paid', $order->status);
        // every worker ends on the same delivery, made once
        foreach ($results as $result) {
            $this->assertSame('paid', $result['status']);
            $this->assertSame($order->delivery_tx_id, $result['delivery_tx_id']);
        }
        $this->assertSame(1, DB::table('transactions')->where('type', 'premium_purchase')->whereRaw("meta_json->>'gem_order' = ?", [$publicId])->count());
        $this->assertSame(1, DB::table('wallet_ledger')->where('reason', 'gem_purchase')->count());
        $this->assertSame(650, $this->wallet($player['id'])['premium']);
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
        ];
    }

    /**
     * Proves the race: every worker is inside the delivery, waiting on the row this test locked. pg_locks, not
     * pg_stat_activity, whose values stay frozen for the whole transaction this test is in.
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

        $this->fail("Only {$waiting} of {$expected} workers reached the order lock");
    }
}
