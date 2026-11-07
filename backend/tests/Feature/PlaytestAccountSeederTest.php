<?php

namespace Tests\Feature;

use App\Models\AccountAuthLocal;
use App\Services\TradeService;
use Database\Seeders\PlaytestAccountSeeder;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class PlaytestAccountSeederTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
    }

    public function test_it_creates_two_ready_accounts_that_can_sign_in(): void
    {
        $this->seed(PlaytestAccountSeeder::class);

        foreach (array_keys(PlaytestAccountSeeder::ACCOUNTS) as $email) {
            $accountId = (int) AccountAuthLocal::query()->where('email', $email)->value('account_id');
            $account = DB::table('accounts')->where('account_id', $accountId)->first();

            $this->assertTrue((bool) $account->is_admin);
            $this->assertTrue(now()->subHours(TradeService::MIN_GIVER_AGE_HOURS)->greaterThan($account->created_at));
            $this->assertSame(PlaytestAccountSeeder::COINS, $this->coins($accountId));
            $this->postJson('/api/login', ['email' => $email, 'password' => PlaytestAccountSeeder::PASSWORD])->assertOk();
        }
    }

    public function test_running_it_again_resets_the_same_accounts(): void
    {
        $this->seed(PlaytestAccountSeeder::class);
        $accountId = (int) AccountAuthLocal::query()->where('email', 'playtester1@campuscove.test')->value('account_id');
        DB::table('account_survival_stats')->where('account_id', $accountId)->update(['health' => 3]);

        $this->seed(PlaytestAccountSeeder::class);

        $this->assertSame(2, AccountAuthLocal::query()->where('email', 'like', 'playtester%@campuscove.test')->count());
        $this->assertSame(PlaytestAccountSeeder::COINS, $this->coins($accountId));
        $this->assertEquals(100, DB::table('account_survival_stats')->where('account_id', $accountId)->value('health'));
    }

    public function test_it_refuses_to_run_in_production(): void
    {
        $this->app['env'] = 'production';

        $this->expectException(RuntimeException::class);
        $this->app->make(PlaytestAccountSeeder::class)->run();
    }

    private function coins(int $accountId): int
    {
        $walletId = DB::table('wallets')->where('owner_type', 'account')->where('owner_id', $accountId)->where('currency', 'coins')->value('wallet_id');

        return (int) DB::table('wallet_ledger')->where('wallet_id', $walletId)->sum('delta');
    }
}
