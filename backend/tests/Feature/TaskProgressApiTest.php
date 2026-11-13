<?php

namespace Tests\Feature;

use App\Enums\ActionCounter;
use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\ActionCounterService;
use App\Services\OrchardService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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

    public function test_selling_apples_counts_each_apple_sold(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);
        $this->grant($player['account_id'], 'farm_apple', 5);

        $this->postJson('/api/orchard/sell', ['quantity' => 6], $headers)->assertStatus(422);
        $this->assertSame(0, $this->counter($player['account_id'], ActionCounter::ApplesSold));

        $this->postJson('/api/orchard/sell', ['quantity' => 5], $headers)->assertOk();
        $this->assertSame(5, $this->counter($player['account_id'], ActionCounter::ApplesSold));
    }

    public function test_each_bite_counts_one_food_eaten(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);
        $this->grant($player['account_id'], 'farm_apple', 1);

        $this->postJson('/api/survival/consume', ['code' => 'farm_apple'], $headers)->assertOk();
        $this->assertSame(1, $this->counter($player['account_id'], ActionCounter::FoodEaten));
        $this->postJson('/api/survival/consume', ['code' => 'farm_apple'], $headers)->assertOk();
        $this->assertSame(2, $this->counter($player['account_id'], ActionCounter::FoodEaten));

        $this->postJson('/api/survival/consume', ['code' => 'farm_apple'], $headers)->assertStatus(422);
        $this->assertSame(2, $this->counter($player['account_id'], ActionCounter::FoodEaten));
    }

    public function test_each_deposit_counts_once_whatever_the_amount(): void
    {
        $player = $this->registerAndCreditWallet(80, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/bank/deposit', ['ref' => 'atm-1', 'amount' => 50], $headers)->assertOk();
        $this->postJson('/api/bank/deposit', ['ref' => 'atm-1', 'amount' => 50], $headers)->assertStatus(409);
        $this->postJson('/api/bank/deposit', ['ref' => 'atm-2', 'amount' => 31], $headers)->assertStatus(422);
        $this->assertSame(1, $this->counter($player['account_id'], ActionCounter::AtmDeposits));

        $this->postJson('/api/bank/deposit', ['ref' => 'atm-3', 'amount' => 1], $headers)->assertOk();
        $this->assertSame(2, $this->counter($player['account_id'], ActionCounter::AtmDeposits));
    }

    public function test_each_finished_darts_game_counts_even_on_reward_cooldown(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        $headers = $this->auth($player['token'], self::SECRET);

        $this->postJson('/api/pub/reward', ['game' => 'darts', 'placement' => 1, 'score' => 50], $headers)->assertOk()->assertJsonPath('cooldown', false);
        $this->postJson('/api/pub/reward', ['game' => 'darts', 'placement' => 2, 'score' => 10], $headers)->assertOk()->assertJsonPath('cooldown', true);
        $this->postJson('/api/pub/reward', ['game' => 'drink_fast', 'placement' => 1, 'score' => 9000], $headers)->assertOk();

        $this->assertSame(2, $this->counter($player['account_id'], ActionCounter::DartsPlayed));
    }

    public function test_the_tenth_darts_game_reaches_the_first_darts_tier(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');

        app(ActionCounterService::class)->bump($player['account_id'], ActionCounter::DartsPlayed, 9);
        $this->assertSame([], $this->tiers($player['account_id']));
        app(ActionCounterService::class)->bump($player['account_id'], ActionCounter::DartsPlayed);

        $this->assertSame([['darts', 1]], $this->tiers($player['account_id']));
    }

    public function test_the_socket_is_told_once_when_a_tier_is_reached(): void
    {
        config(['services.realtime.url' => 'http://socket.test:3000']);
        Http::fake(['socket.test:3000/*' => Http::response(['ok' => true])]);
        $player = $this->registerAndCreditWallet(0, 'cash');
        $counters = app(ActionCounterService::class);

        $counters->bump($player['account_id'], ActionCounter::DartsPlayed, 9);
        Http::assertNothingSent();
        $counters->bump($player['account_id'], ActionCounter::DartsPlayed);
        $counters->bump($player['account_id'], ActionCounter::DartsPlayed);

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request): bool => $request->url() === 'http://socket.test:3000/internal/task-tier-reached'
            && $request->header('X-Realtime-Secret') === [self::SECRET]
            && $request->data() === ['accountId' => $player['account_id'], 'task' => 'darts', 'tier' => 1, 'threshold' => 10]);
    }

    public function test_the_tasks_menu_lists_every_task_with_its_progress(): void
    {
        $player = $this->registerAndCreditWallet(0, 'cash');
        app(ActionCounterService::class)->bump($player['account_id'], ActionCounter::ApplesPicked, 340);

        $this->getJson('/api/tasks', $this->auth($player['token']))
            ->assertOk()
            ->assertExactJson(['tasks' => [
                ['task' => 'orchard', 'value' => 340, 'tiers' => [100, 1000, 5000], 'reached' => [1]],
                ['task' => 'darts', 'value' => 0, 'tiers' => [10, 50, 200], 'reached' => []],
            ]]);
    }

    public function test_the_tasks_menu_needs_a_signed_in_player(): void
    {
        $this->getJson('/api/tasks')->assertUnauthorized();
    }

    private function counter(int $accountId, ActionCounter $counter): int
    {
        return app(ActionCounterService::class)->value($accountId, $counter);
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
