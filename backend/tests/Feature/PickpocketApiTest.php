<?php

namespace Tests\Feature;

use App\Models\ItemDef;
use App\Services\AccountInventoryService;
use App\Services\PickpocketService;
use App\Services\TradeService;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class PickpocketApiTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-realtime-secret';

    private const TEE = 'COS_WEAR_TOP_TEE';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_only_the_realtime_server_opens_an_attempt(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();

        $this->postJson('/api/pickpocket/attempts', ['victim_account_id' => $victim['account_id']], $this->auth($thief['token']))->assertForbidden();
        $this->assertSame(0, DB::table('pickpocket_attempts')->count());
    }

    public function test_a_successful_theft_moves_the_whole_stack(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $this->grant($victim['account_id'], 'food_sandwich', 3);
        $this->grant($thief['account_id'], 'food_sandwich', 1);
        $id = $this->open($thief, $victim)->assertCreated()->json('attempt.id');

        $loot = $this->settle($thief, $id, 'succeeded')->assertOk()->json('loot');
        $this->assertSame(3, collect($loot)->firstWhere('code', 'food_sandwich')['quantity']);

        $this->take($thief, $id, 'food_sandwich')
            ->assertOk()
            ->assertJsonPath('taken.code', 'food_sandwich')
            ->assertJsonPath('taken.quantity', 3);
        $this->assertSame(0, $this->owned($victim['token'], 'food_sandwich'));
        $this->assertSame(4, $this->owned($thief['token'], 'food_sandwich'));
    }

    public function test_the_same_choice_sent_twice_moves_the_stack_once(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $this->grant($victim['account_id'], 'food_sandwich', 3);
        $id = $this->open($thief, $victim)->json('attempt.id');
        $this->settle($thief, $id, 'succeeded');

        $this->take($thief, $id, 'food_sandwich')->assertOk();
        $this->grant($victim['account_id'], 'food_sandwich', 2);
        $this->take($thief, $id, 'food_sandwich')->assertOk()->assertJsonPath('taken.quantity', 3);

        $this->assertSame(2, $this->owned($victim['token'], 'food_sandwich'));
        $this->assertSame(3, $this->owned($thief['token'], 'food_sandwich'));
    }

    public function test_furniture_keys_worn_clothes_and_gem_items_are_never_stolen(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $furniture = ItemDef::query()->where('kind', 'furniture')->value('code');
        $this->grant($victim['account_id'], $furniture, 1);
        $this->grant($victim['account_id'], 'house_key', 1);
        $this->grant($victim['account_id'], 'COS_WEAR_TOP_HOODIE', 1);
        $this->wear($victim['account_id'], 'top', 'COS_WEAR_TOP_HOODIE');
        $this->grant($victim['account_id'], 'COS_WEAR_BODY_NEON_RONIN', 1);
        $this->grant($victim['account_id'], self::TEE, 1);
        $id = $this->open($thief, $victim)->json('attempt.id');

        $codes = collect($this->settle($thief, $id, 'succeeded')->json('loot'))->pluck('code')->all();

        $this->assertSame([self::TEE], $codes);
        foreach ([$furniture, 'house_key', 'COS_WEAR_TOP_HOODIE', 'COS_WEAR_BODY_NEON_RONIN'] as $code) {
            $this->take($thief, $id, $code)->assertUnprocessable()->assertJsonPath('code', 'pickpocket_not_stealable');
            $this->assertSame(1, $this->owned($victim['token'], $code));
        }
        $this->take($thief, $id, self::TEE)->assertOk();
    }

    public function test_nothing_is_taken_from_a_failed_attempt(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $this->grant($victim['account_id'], 'food_sandwich', 3);
        $id = $this->open($thief, $victim)->json('attempt.id');

        $this->settle($thief, $id, 'failed')->assertOk()->assertJsonPath('loot', []);
        $this->take($thief, $id, 'food_sandwich')->assertStatus(409)->assertJsonPath('code', 'pickpocket_not_succeeded');
        $this->settle($thief, $id, 'succeeded')->assertStatus(409)->assertJsonPath('code', 'pickpocket_settled');
        $this->assertSame(3, $this->owned($victim['token'], 'food_sandwich'));
    }

    public function test_only_the_thief_settles_or_takes_their_attempt(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $other = $this->veteran();
        $this->grant($victim['account_id'], 'food_sandwich', 3);
        $id = $this->open($thief, $victim)->json('attempt.id');
        $this->settle($thief, $id, 'succeeded');

        $this->take($other, $id, 'food_sandwich')->assertNotFound()->assertJsonPath('code', 'pickpocket_unknown');
        $this->settle($other, $id, 'failed')->assertNotFound();
        $this->assertSame(3, $this->owned($victim['token'], 'food_sandwich'));
    }

    public function test_a_full_inventory_refuses_the_stack(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $this->grant($victim['account_id'], self::TEE, 1);
        $this->grant($thief['account_id'], self::TEE, 1);
        $id = $this->open($thief, $victim)->json('attempt.id');
        $this->settle($thief, $id, 'succeeded');

        $this->take($thief, $id, self::TEE)->assertUnprocessable()->assertJsonPath('code', 'pickpocket_inventory_full');
        $this->assertSame(1, $this->owned($victim['token'], self::TEE));
    }

    public function test_ten_minutes_between_two_attempts(): void
    {
        $thief = $this->veteran();
        $first = $this->veteran();
        $second = $this->veteran();
        $id = $this->open($thief, $first)->json('attempt.id');
        $this->settle($thief, $id, 'failed');

        $this->open($thief, $second)->assertStatus(409)->assertJsonPath('code', 'pickpocket_cooldown');

        DB::table('pickpocket_attempts')->update(['created_at' => now()->subMinutes(PickpocketService::COOLDOWN_MINUTES)->subSecond()]);
        $this->open($thief, $second)->assertCreated();
    }

    public function test_the_same_victim_is_robbed_once_a_day(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $id = $this->open($thief, $victim)->json('attempt.id');
        $this->settle($thief, $id, 'succeeded');
        DB::table('pickpocket_attempts')->update(['created_at' => now()->subHours(23)]);

        $this->open($thief, $victim)->assertStatus(409)->assertJsonPath('code', 'pickpocket_victim_recent');
        $this->open($this->veteran(), $victim)->assertCreated();

        DB::table('pickpocket_attempts')->where('thief_account_id', $thief['account_id'])->update(['created_at' => now()->subHours(PickpocketService::SAME_VICTIM_HOURS)->subSecond()]);
        $this->open($thief, $victim)->assertCreated();
    }

    public function test_a_failed_attempt_does_not_block_the_victim_for_the_day(): void
    {
        $thief = $this->veteran();
        $victim = $this->veteran();
        $id = $this->open($thief, $victim)->json('attempt.id');
        $this->settle($thief, $id, 'failed');
        DB::table('pickpocket_attempts')->update(['created_at' => now()->subMinutes(PickpocketService::COOLDOWN_MINUTES + 1)]);

        $this->open($thief, $victim)->assertCreated();
    }

    public function test_accounts_younger_than_72_hours_neither_steal_nor_get_robbed(): void
    {
        $veteran = $this->veteran();
        $newcomer = $this->player();
        DB::table('accounts')->where('account_id', $newcomer['account_id'])->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS - 1)]);

        $this->open($newcomer, $veteran)->assertUnprocessable()->assertJsonPath('code', 'pickpocket_account_too_new');
        $this->open($veteran, $newcomer)->assertUnprocessable()->assertJsonPath('code', 'pickpocket_victim_too_new');
        $this->open($veteran, $veteran)->assertUnprocessable()->assertJsonPath('code', 'pickpocket_self');
        $this->assertSame(0, DB::table('pickpocket_attempts')->count());
    }

    /**
     * @param  array{token: string}  $thief
     * @param  array{account_id: int}  $victim
     */
    private function open(array $thief, array $victim): TestResponse
    {
        return $this->postJson('/api/pickpocket/attempts', ['victim_account_id' => $victim['account_id']], $this->auth($thief['token'], self::SECRET));
    }

    /** @param array{token: string} $thief */
    private function settle(array $thief, int $id, string $outcome): TestResponse
    {
        return $this->postJson("/api/pickpocket/attempts/{$id}/outcome", ['outcome' => $outcome], $this->auth($thief['token'], self::SECRET));
    }

    /** @param array{token: string} $thief */
    private function take(array $thief, int $id, string $code): TestResponse
    {
        return $this->postJson("/api/pickpocket/attempts/{$id}/take", ['item_code' => $code], $this->auth($thief['token'], self::SECRET));
    }

    private function grant(int $accountId, string $code, int $quantity): void
    {
        app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', $code)->firstOrFail(), $quantity);
    }

    private function wear(int $accountId, string $slot, string $code): void
    {
        DB::table('account_cosmetic_equipment')->updateOrInsert(
            ['account_id' => $accountId, 'slot' => $slot],
            ['item_def_id' => ItemDef::query()->where('code', $code)->value('item_def_id'), 'updated_at' => now()],
        );
    }

    private function owned(string $token, string $code): int
    {
        $items = $this->getJson('/api/inventory', $this->auth($token))->assertOk()->json('items');

        return (int) (collect($items)->firstWhere('code', $code)['quantity'] ?? 0);
    }

    /** @return array{token: string, account_id: int} */
    private function veteran(): array
    {
        $player = $this->player();
        DB::table('accounts')->where('account_id', $player['account_id'])->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS + 1)]);

        return $player;
    }

    /** @return array{token: string, account_id: int} */
    private function player(): array
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

        return ['token' => (string) $reg->json('token'), 'account_id' => (int) $reg->json('user.account_id')];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
