<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\ActionCounterService;
use App\Services\OrchardService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class TaskProgressApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_each_successful_pick_counts_one_apple(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/orchard/pick', [], $headers)->assertOk();
        $this->travel(OrchardService::MIN_PICK_INTERVAL_MS)->milliseconds();
        $this->postJson('/api/orchard/pick', [], $headers)->assertOk();

        $this->assertSame(2, $this->applesPicked($player['account_id']));
        $this->assertSame([], $this->tiers($player['account_id']));
    }

    public function test_a_rejected_pick_counts_nothing(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);
        $this->grant($player['account_id'], 'farm_apple', 20);

        $this->postJson('/api/orchard/pick', [], $headers)->assertStatus(422)->assertJsonPath('code', 'basket_full');

        $this->assertSame(0, $this->applesPicked($player['account_id']));
    }

    public function test_the_hundredth_apple_reaches_the_first_orchard_tier_once(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);
        $this->setApplesPicked($player['account_id'], 99);

        $this->postJson('/api/orchard/pick', [], $headers)->assertOk();
        $this->assertSame(100, $this->applesPicked($player['account_id']));
        $this->assertSame([['orchard', 1]], $this->tiers($player['account_id']));

        $this->travel(OrchardService::MIN_PICK_INTERVAL_MS)->milliseconds();
        $this->postJson('/api/orchard/pick', [], $headers)->assertOk();
        $this->assertSame([['orchard', 1]], $this->tiers($player['account_id']));
    }

    public function test_a_bump_past_two_thresholds_reaches_both_tiers(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');

        app(ActionCounterService::class)->bump($player['account_id'], ActionCounter::ApplesPicked, 1000);

        $this->assertSame([['orchard', 1], ['orchard', 2]], $this->tiers($player['account_id']));
    }

    public function test_a_tier_missed_earlier_is_recorded_at_the_next_bump(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $this->setApplesPicked($player['account_id'], 150);

        app(ActionCounterService::class)->bump($player['account_id'], ActionCounter::ApplesPicked);

        $this->assertSame([['orchard', 1]], $this->tiers($player['account_id']));
    }

    public function test_a_counter_never_goes_down(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');

        $this->expectException(InvalidArgumentException::class);
        app(ActionCounterService::class)->bump($player['account_id'], ActionCounter::ApplesPicked, 0);
    }

    private function applesPicked(int $accountId): int
    {
        return app(ActionCounterService::class)->value($accountId, ActionCounter::ApplesPicked);
    }

    private function setApplesPicked(int $accountId, int $value): void
    {
        DB::table('account_counters')->insert([
            'account_id' => $accountId,
            'counter' => ActionCounter::ApplesPicked->value,
            'value' => $value,
        ]);
    }

    /** @return list<array{0: string, 1: int}> */
    private function tiers(int $accountId): array
    {
        return DB::table('account_task_tiers')
            ->where('account_id', $accountId)
            ->orderBy('task')
            ->orderBy('tier')
            ->get()
            ->map(fn (object $row): array => [(string) $row->task, (int) $row->tier])
            ->all();
    }

    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter([
            'Authorization' => 'Bearer '.$token,
            'X-Realtime-Secret' => $secret,
        ]);
    }

    private function grant(int $accountId, string $code, int $quantity): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', $code)->firstOrFail(), $quantity);
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
