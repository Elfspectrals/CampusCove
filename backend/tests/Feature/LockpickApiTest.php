<?php

namespace Tests\Feature;

use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Services\AccountInventoryService;
use App\Services\HouseAlarmService;
use App\Services\HousingService;
use App\Services\LockpickService;
use App\Services\TradeService;
use App\Services\ZonePriceBook;
use Database\Seeders\HousingUnitSeeder;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Lottery;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class LockpickApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        $this->seed(HousingUnitSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    protected function tearDown(): void
    {
        Lottery::determineResultNormally();
        parent::tearDown();
    }

    public function test_the_lockpick_is_a_tool_sold_at_crispins_hardware_for_120(): void
    {
        $itemDefId = ItemDef::query()->where('code', LockpickService::ITEM_CODE)->where('kind', 'tool')->value('item_def_id');

        $this->assertNotNull($itemDefId);
        $this->assertDatabaseHas('shop_catalog_items', ['item_def_id' => $itemDefId, 'coins_price' => 120, 'allow_coins' => true]);
        $this->assertSame(120, app(ZonePriceBook::class)->prices('crispins_hardware')[LockpickService::ITEM_CODE]);
        $this->assertSame(600, app(ZonePriceBook::class)->prices('crispins_hardware')[LockpickService::REINFORCED_LOCK_CODE]);
    }

    public function test_a_burglar_without_a_lockpick_cannot_start(): void
    {
        $unit = $this->lockedHouse($this->player());

        $this->start($this->player(), $unit)->assertStatus(422)->assertJsonPath('code', 'no_lockpick');
    }

    public function test_a_success_unlocks_the_door_and_spends_one_use(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 1);

        $attempt = $this->start($burglar, $unit)->assertOk()->json('attempt_id');
        $this->succeed($burglar, $attempt)->assertOk();

        $this->assertFalse((bool) HousingUnit::query()->whereKey($unit->unit_id)->value('door_locked'));
        $this->assertSame(1, $this->lockpicks($burglar));
        $this->assertSame(1, (int) DB::table('lockpick_wear')->where('account_id', $burglar['account_id'])->value('uses_spent'));
    }

    public function test_a_door_that_is_not_locked_needs_no_lockpick(): void
    {
        $unit = $this->lockedHouse($this->player());
        $unit->update(['door_locked' => false]);

        $this->start($this->player(lockpicks: 1), $unit)->assertStatus(409)->assertJsonPath('code', 'door_not_locked');
    }

    public function test_a_miss_can_break_the_lockpick_once_even_if_the_socket_sends_it_twice(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 2);
        $attempt = $this->start($burglar, $unit)->json('attempt_id');

        Lottery::alwaysWin();
        $this->miss($burglar, $attempt, 1)->assertOk()->assertExactJson(['broke' => true, 'alarm' => false]);
        $this->miss($burglar, $attempt, 1)->assertOk()->assertExactJson(['broke' => true, 'alarm' => false]);

        $this->assertSame(1, $this->lockpicks($burglar));
        $this->assertNull(DB::table('lockpick_wear')->where('account_id', $burglar['account_id'])->value('uses_spent'));
        $this->succeed($burglar, $attempt)->assertStatus(409)->assertJsonPath('code', 'attempt_over');
    }

    public function test_a_miss_that_does_not_break_is_counted_once(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 1);
        $attempt = $this->start($burglar, $unit)->json('attempt_id');

        Lottery::alwaysLose();
        $this->miss($burglar, $attempt, 1)->assertExactJson(['broke' => false, 'alarm' => false]);
        $this->miss($burglar, $attempt, 1)->assertExactJson(['broke' => false, 'alarm' => false]);
        $this->miss($burglar, $attempt, 2)->assertExactJson(['broke' => false, 'alarm' => false]);

        $this->assertSame(2, (int) DB::table('lockpick_attempts')->where('id', $attempt)->value('misses'));
        $this->assertSame(1, $this->lockpicks($burglar));
    }

    public function test_a_lockpick_wears_out_after_five_sessions(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 1);

        for ($session = 1; $session <= LockpickService::USES_PER_PICK; $session++) {
            $this->assertSame(1, $this->lockpicks($burglar), "session {$session}");
            $attempt = $this->start($burglar, $unit)->assertOk()->json('attempt_id');
            $this->abandon($burglar, $attempt)->assertOk();
        }

        $this->assertSame(0, $this->lockpicks($burglar));
        $this->start($burglar, $unit)->assertStatus(422)->assertJsonPath('code', 'no_lockpick');
    }

    public function test_starting_again_abandons_the_open_attempt(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 1);
        $first = $this->start($burglar, $unit)->json('attempt_id');

        $this->start($burglar, $unit)->assertOk();

        $this->assertSame('abandoned', DB::table('lockpick_attempts')->where('id', $first)->value('outcome'));
        $this->assertSame(2, (int) DB::table('lockpick_wear')->where('account_id', $burglar['account_id'])->value('uses_spent'));
    }

    public function test_a_burgled_house_is_protected_for_24_hours(): void
    {
        $unit = $this->lockedHouse($this->player());
        $first = $this->player(lockpicks: 1);
        $second = $this->player(lockpicks: 1);
        $this->succeed($first, $this->start($first, $unit)->json('attempt_id'))->assertOk();
        $unit->refresh()->update(['door_locked' => true]);

        $this->travel(LockpickService::HOUSE_PROTECTION_HOURS * 60 - 1)->minutes();
        $this->start($second, $unit)->assertStatus(409)->assertJsonPath('code', 'house_recently_burgled');
        $this->travel(2)->minutes();
        $this->start($second, $unit)->assertOk();
    }

    public function test_a_burglar_waits_30_minutes_after_a_success_but_not_after_a_failure(): void
    {
        $houseA = $this->lockedHouse($this->player());
        $houseB = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 2);

        $this->abandon($burglar, $this->start($burglar, $houseA)->json('attempt_id'));
        $this->succeed($burglar, $this->start($burglar, $houseA)->json('attempt_id'))->assertOk();

        $this->travel(LockpickService::BURGLAR_COOLDOWN_MINUTES - 1)->minutes();
        $this->start($burglar, $houseB)->assertStatus(429)->assertJsonPath('code', 'burglar_cooldown');
        $this->travel(2)->minutes();
        $this->start($burglar, $houseB)->assertOk();
    }

    public function test_new_accounts_can_neither_pick_nor_be_picked(): void
    {
        $tooNew = TradeService::MIN_GIVER_AGE_HOURS - 1;
        $house = $this->lockedHouse($this->player());
        $newcomerHouse = $this->lockedHouse($this->player(ageHours: $tooNew));
        $veteran = $this->player(lockpicks: 1);

        $this->start($this->player(lockpicks: 1, ageHours: $tooNew), $house)->assertForbidden()->assertJsonPath('code', 'burglar_too_new');
        $this->start($veteran, $newcomerHouse)->assertForbidden()->assertJsonPath('code', 'owner_too_new');
    }

    public function test_the_owner_and_key_holders_cannot_pick_their_own_door(): void
    {
        $owner = $this->player(lockpicks: 1);
        $holder = $this->player(lockpicks: 1);
        $unit = $this->lockedHouse($owner);
        $this->postJson('/api/housing/keys', ['account_id' => $holder['account_id']], $this->auth($owner['token']))->assertOk();

        $this->start($owner, $unit)->assertForbidden()->assertJsonPath('code', 'has_house_key');
        $this->start($holder, $unit)->assertForbidden()->assertJsonPath('code', 'has_house_key');
    }

    public function test_a_plain_door_has_three_pins_and_a_reinforced_one_five(): void
    {
        $owner = $this->player();
        $unit = $this->lockedHouse($owner);
        $burglar = $this->player(lockpicks: 2);
        $first = $this->start($burglar, $unit)->assertOk()->assertJsonPath('pins', LockpickService::PINS_PLAIN)->json('attempt_id');
        $this->abandon($burglar, $first);
        $this->grant($owner, LockpickService::REINFORCED_LOCK_CODE);

        $this->fitLock($owner, $unit)->assertOk();

        $this->start($burglar, $unit)->assertOk()->assertJsonPath('pins', LockpickService::PINS_REINFORCED);
        $this->assertSame(0, $this->quantity($owner, LockpickService::REINFORCED_LOCK_CODE));
    }

    public function test_only_the_owner_fits_a_reinforced_lock_and_only_once(): void
    {
        $owner = $this->player();
        $holder = $this->player();
        $unit = $this->lockedHouse($owner);
        $this->postJson('/api/housing/keys', ['account_id' => $holder['account_id']], $this->auth($owner['token']))->assertOk();
        $this->grant($holder, LockpickService::REINFORCED_LOCK_CODE);
        $this->grant($owner, LockpickService::REINFORCED_LOCK_CODE);

        $this->fitLock($owner, $this->lockedHouse($this->player()))->assertForbidden()->assertJsonPath('code', 'not_your_house');
        $this->fitLock($holder, $unit)->assertForbidden()->assertJsonPath('code', 'not_your_house');
        $this->fitLock($owner, $unit)->assertOk();
        $this->grant($owner, LockpickService::REINFORCED_LOCK_CODE);
        $this->fitLock($owner, $unit)->assertStatus(409)->assertJsonPath('code', 'lock_already_reinforced');
    }

    public function test_a_lock_needs_the_item_and_goes_with_a_lost_house(): void
    {
        $owner = $this->player();
        $unit = $this->lockedHouse($owner);

        $this->fitLock($owner, $unit)->assertStatus(422)->assertJsonPath('code', 'no_reinforced_lock');
        $this->grant($owner, LockpickService::REINFORCED_LOCK_CODE);
        $this->fitLock($owner, $unit)->assertOk();
        app(HousingService::class)->resetExpiredUnit($unit->refresh());

        $this->assertFalse((bool) $unit->refresh()->reinforced_lock);
    }

    public function test_an_alarm_goes_off_on_the_second_miss_once_per_session(): void
    {
        $owner = $this->player();
        $unit = $this->lockedHouse($owner);
        $this->placeAlarm($owner);
        $burglar = $this->player(lockpicks: 1);
        $attempt = $this->start($burglar, $unit)->json('attempt_id');

        Lottery::alwaysLose();
        $this->miss($burglar, $attempt, 1)->assertExactJson(['broke' => false, 'alarm' => false]);
        $this->miss($burglar, $attempt, 2)->assertExactJson(['broke' => false, 'alarm' => true]);
        $this->miss($burglar, $attempt, 3)->assertExactJson(['broke' => false, 'alarm' => false]);
        $this->succeed($burglar, $attempt)->assertExactJson(['alarm' => false]);

        $this->assertSame(1, DB::table('house_alarm_events')->count());
    }

    public function test_an_alarm_goes_off_when_the_door_opens(): void
    {
        $owner = $this->player();
        $unit = $this->lockedHouse($owner);
        $this->placeAlarm($owner);
        $burglar = $this->player(lockpicks: 1);

        $this->succeed($burglar, $this->start($burglar, $unit)->json('attempt_id'))->assertExactJson(['alarm' => true]);
    }

    public function test_a_house_without_an_alarm_stays_silent(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 1);

        $this->succeed($burglar, $this->start($burglar, $unit)->json('attempt_id'))->assertExactJson(['alarm' => false]);
    }

    public function test_the_owner_reads_the_alarms_of_their_absence_once(): void
    {
        $owner = $this->player();
        $unit = $this->lockedHouse($owner);
        $this->placeAlarm($owner);
        $burglar = $this->player(lockpicks: 1);
        $this->succeed($burglar, $this->start($burglar, $unit)->json('attempt_id'));

        $this->postJson('/api/house-alarms/report', [], $this->auth($owner['token']))->assertOk()->assertJsonPath('count', 1);
        $this->postJson('/api/house-alarms/report', [], $this->auth($owner['token']))->assertOk()->assertExactJson(['count' => 0, 'last_at' => null]);
        $this->postJson('/api/house-alarms/report', [], $this->auth($burglar['token']))->assertExactJson(['count' => 0, 'last_at' => null]);
    }

    public function test_the_browser_cannot_pick_without_the_socket(): void
    {
        $unit = $this->lockedHouse($this->player());
        $burglar = $this->player(lockpicks: 1);

        $this->postJson('/api/lockpicks/attempts', ['unit_public_id' => $unit->public_id], $this->auth($burglar['token']))->assertForbidden();
    }

    /** @param array{token: string, account_id: int} $owner */
    private function lockedHouse(array $owner): HousingUnit
    {
        $unit = HousingUnit::query()->where('offer_type', 'buy')->where('status', '!=', 'occupied')->orderBy('unit_id')->firstOrFail();
        $this->setWalletBalance($owner['account_id'], Wallet::BANK, $unit->price_coins);
        $this->postJson("/api/housing/units/{$unit->public_id}/buy", [], $this->auth($owner['token']))->assertOk();
        $unit->refresh()->update(['door_locked' => true]);

        return $unit;
    }

    /** @param array{token: string} $burglar */
    private function start(array $burglar, HousingUnit $unit): TestResponse
    {
        return $this->postJson('/api/lockpicks/attempts', ['unit_public_id' => $unit->public_id], $this->auth($burglar['token'], self::SECRET));
    }

    /** @param array{token: string, account_id: int} $owner */
    private function placeAlarm(array $owner): void
    {
        $this->grant($owner, HouseAlarmService::ITEM_CODE);
        $unitId = HousingUnit::query()->where('occupant_account_id', $owner['account_id'])->value('unit_id');
        $this->postJson('/api/apartments/spawn', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => 'housing_'.$unitId,
            'objectId' => 'alarm_'.uniqid(),
            'objectKey' => HouseAlarmService::ITEM_CODE,
            'x' => 0, 'y' => 0, 'z' => 0, 'rotX' => 0, 'rotY' => 0, 'rotZ' => 0,
        ], $this->auth($owner['token']))->assertOk();
    }

    /** @param array{token: string} $owner */
    private function fitLock(array $owner, HousingUnit $unit): TestResponse
    {
        return $this->postJson('/api/lockpicks/reinforced-lock', ['unit_public_id' => $unit->public_id], $this->auth($owner['token'], self::SECRET));
    }

    /** @param array{account_id: int} $player */
    private function grant(array $player, string $code): void
    {
        app(AccountInventoryService::class)->grantItem($player['account_id'], ItemDef::query()->where('code', $code)->firstOrFail(), 1);
    }

    /** @param array{account_id: int} $player */
    private function quantity(array $player, string $code): int
    {
        return app(TradeService::class)->ownedQuantity($player['account_id'], ItemDef::query()->where('code', $code)->firstOrFail());
    }

    /** @param array{token: string} $burglar */
    private function miss(array $burglar, int $attemptId, int $miss): TestResponse
    {
        return $this->postJson("/api/lockpicks/attempts/{$attemptId}/miss", ['miss' => $miss], $this->auth($burglar['token'], self::SECRET));
    }

    /** @param array{token: string} $burglar */
    private function succeed(array $burglar, int $attemptId): TestResponse
    {
        return $this->postJson("/api/lockpicks/attempts/{$attemptId}/success", [], $this->auth($burglar['token'], self::SECRET));
    }

    /** @param array{token: string} $burglar */
    private function abandon(array $burglar, int $attemptId): TestResponse
    {
        return $this->postJson("/api/lockpicks/attempts/{$attemptId}/abandon", [], $this->auth($burglar['token'], self::SECRET));
    }

    /** @param array{account_id: int} $player */
    private function lockpicks(array $player): int
    {
        $containerId = DB::table('gift_inboxes')->where('account_id', $player['account_id'])->value('container_id');

        return (int) DB::table('inventory_stacks')
            ->where('container_id', $containerId)
            ->where('item_def_id', ItemDef::query()->where('code', LockpickService::ITEM_CODE)->value('item_def_id'))
            ->sum('quantity');
    }

    /** @return array{token: string, account_id: int} */
    private function player(int $lockpicks = 0, int $ageHours = TradeService::MIN_GIVER_AGE_HOURS + 1): array
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
        $accountId = (int) $reg->json('user.account_id');
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours($ageHours)]);
        if ($lockpicks > 0) {
            app(AccountInventoryService::class)->grantItem($accountId, ItemDef::query()->where('code', LockpickService::ITEM_CODE)->firstOrFail(), $lockpicks);
        }

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
