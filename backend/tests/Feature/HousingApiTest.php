<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\HousingUnit;
use App\Services\ApartmentPlacementService;
use App\Services\HousingService;
use Database\Seeders\HousingUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class HousingApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(HousingUnitSeeder::class);
    }

    public function test_list_units_returns_seeded_units_and_my_unit(): void
    {
        $buyer = $this->registerAndCreditWallet(10_000, 'coins');

        $list = $this->getJson('/api/housing/units', [
            'Authorization' => 'Bearer '.$buyer['token'],
        ]);
        $list->assertOk();
        $list->assertJsonCount(10, 'units');
        // every unit is one of the town houses (front/public/assets/houses/<model_key>/)
        $modelKeys = collect($list->json('units'))->pluck('model_key')->sort()->values()->all();
        $this->assertSame(array_map(fn (int $i) => sprintf('house_%02d', $i), range(1, 10)), $modelKeys);
        $list->assertJsonPath('my_unit', null);

        $buyUnit = HousingUnit::query()->where('offer_type', 'buy')->orderBy('unit_id')->firstOrFail();
        $this->postJson('/api/housing/units/'.$buyUnit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$buyer['token'],
        ])->assertOk();

        $listAfter = $this->getJson('/api/housing/units', [
            'Authorization' => 'Bearer '.$buyer['token'],
        ]);
        $listAfter->assertOk();
        $listAfter->assertJsonPath('my_unit.public_id', (string) $buyUnit->public_id);
    }

    public function test_buy_success_debits_wallet_and_creates_room(): void
    {
        $buyer = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->orderBy('unit_id')->firstOrFail();

        $response = $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$buyer['token'],
        ]);
        $response->assertOk();
        $response->assertJsonPath('unit.status', 'occupied');
        $response->assertJsonPath('unit.occupant_account_id', $buyer['account_id']);
        $response->assertJsonPath('unit.unit_id', $unit->unit_id);
        $response->assertJsonPath('unit.template_key', 'housing_'.$unit->unit_id);

        $unit->refresh();
        $this->assertSame('occupied', $unit->status);
        $this->assertSame($buyer['account_id'], (int) $unit->occupant_account_id);
        $this->assertNotNull($unit->room_id);

        $roomName = 'apartment:'.$buyer['account_id'].':housing_'.$unit->unit_id;
        $this->assertDatabaseHas('rooms', ['name' => $roomName]);

        $this->assertDatabaseHas('wallet_ledger', [
            'reason' => 'housing_buy',
            'delta' => -$unit->price_coins,
        ]);
    }

    public function test_buy_insufficient_funds(): void
    {
        $buyer = $this->registerAndCreditWallet(100, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$buyer['token'],
        ])->assertStatus(422)->assertJsonPath('code', 'insufficient_funds');
    }

    public function test_buy_occupied_unit_rejected(): void
    {
        $first = $this->registerAndCreditWallet(10_000, 'coins');
        $second = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$first['token'],
        ])->assertOk();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$second['token'],
        ])->assertStatus(422)->assertJsonPath('code', 'unit_not_vacant');
    }

    public function test_second_unit_same_account_rejected(): void
    {
        $buyer = $this->registerAndCreditWallet(20_000, 'coins');
        $units = HousingUnit::query()->where('offer_type', 'buy')->orderBy('unit_id')->limit(2)->get();
        $this->assertCount(2, $units);

        $this->postJson('/api/housing/units/'.$units[0]->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$buyer['token'],
        ])->assertOk();

        $this->postJson('/api/housing/units/'.$units[1]->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$buyer['token'],
        ])->assertStatus(422)->assertJsonPath('code', 'already_owns_unit');
    }

    public function test_buy_schedules_the_daily_tax(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();

        $response = $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ]);
        $response->assertOk();
        $response->assertJsonPath('unit.tax_due_at', '2026-09-23T12:00:00+00:00');
        $response->assertJsonPath('unit.tax_coins', (int) ceil($unit->price_coins * 0.05));
        $response->assertJsonPath('unit.occupant_name', $owner['username']);

        Carbon::setTestNow();
    }

    public function test_collect_due_taxes_debits_the_owner_and_moves_the_due_date(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();
        $tax = (int) ceil($unit->price_coins * 0.05);
        $owner = $this->registerAndCreditWallet($unit->price_coins + 2 * $tax, 'coins');

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-09-24 13:00:00 UTC'));
        $seized = app(HousingService::class)->collectDueTaxes();

        $this->assertSame(0, $seized);
        $unit->refresh();
        $this->assertSame('occupied', $unit->status);
        $this->assertSame('2026-09-25T12:00:00+00:00', $unit->tax_due_at?->toIso8601String());
        $this->assertSame(2, DB::table('wallet_ledger')->where('reason', 'housing_tax')->where('delta', -$tax)->count());

        Carbon::setTestNow();
    }

    public function test_unpaid_tax_seizes_the_house_and_deletes_its_room(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();
        $owner = $this->registerAndCreditWallet($unit->price_coins, 'coins');

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();
        $unit->refresh();
        $roomId = (int) $unit->room_id;

        Carbon::setTestNow(Carbon::parse('2026-09-23 12:00:01 UTC'));
        $seized = app(HousingService::class)->collectDueTaxes();

        $this->assertSame(1, $seized);
        $unit->refresh();
        $this->assertSame('vacant', $unit->status);
        $this->assertNull($unit->occupant_account_id);
        $this->assertNull($unit->tax_due_at);
        $this->assertNull($unit->room_id);
        $this->assertDatabaseMissing('rooms', ['room_id' => $roomId]);
        $this->assertDatabaseMissing('room_memberships', ['room_id' => $roomId]);

        Carbon::setTestNow();
    }

    public function test_visitor_can_view_occupied_housing_state_but_not_spawn(): void
    {
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $visitor = $this->registerAndCreditWallet(0, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        $unit->refresh();
        $templateKey = 'housing_'.$unit->unit_id;

        $visitorAccount = Account::query()->findOrFail($visitor['account_id']);
        $state = $this->actingAs($visitorAccount, 'sanctum')->postJson('/api/apartments/state', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $templateKey,
        ]);
        $state->assertOk();
        $state->assertJsonPath('apartment.can_edit', false);

        $this->actingAs($visitorAccount, 'sanctum')->postJson('/api/apartments/spawn', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $templateKey,
            'objectId' => 'visitor_spawn_1',
            'objectKey' => 'missing',
            'x' => 0,
            'y' => 0,
            'z' => 0,
            'rotX' => 0,
            'rotY' => 0,
            'rotZ' => 0,
        ])->assertStatus(403)->assertJsonPath('code', 'apartment_edit_forbidden');
    }

    public function test_house_furniture_lists_occupied_units_only(): void
    {
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $visitor = $this->registerAndCreditWallet(0, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();
        $unit->refresh();

        $response = $this->getJson('/api/apartments/houses', [
            'Authorization' => 'Bearer '.$visitor['token'],
        ]);

        $response->assertOk();
        $response->assertJsonCount(1, 'houses');
        $response->assertJsonPath('houses.0.template_key', 'housing_'.$unit->unit_id);
        $response->assertJsonPath('houses.0.model_key', $unit->model_key);
        $response->assertJsonPath('houses.0.occupant_account_id', $owner['account_id']);
        $response->assertJsonPath('houses.0.objects', []);
    }

    public function test_buying_gives_the_owner_a_house_key(): void
    {
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();

        $this->assertSame(0, $this->houseKeyQuantity($owner));
        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        $key = collect($this->getJson('/api/apartments/assets', [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk()->json('items'))->firstWhere('code', 'house_key');
        $this->assertNotNull($key);
        $this->assertSame('tool', $key['kind']);
        $this->assertSame(1, (int) $key['quantity']);
    }

    public function test_key_holders_get_a_key_copy_until_the_owner_takes_the_keys_back(): void
    {
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $friend = $this->registerAndCreditWallet(0, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();
        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        foreach ([1, 2] as $attempt) {
            $this->postJson('/api/housing/keys', ['account_id' => $friend['account_id']], [
                'Authorization' => 'Bearer '.$owner['token'],
            ])->assertOk();
        }
        $this->assertSame(1, $this->houseKeyQuantity($friend));

        $this->deleteJson('/api/housing/keys/'.$friend['account_id'], [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();
        $this->assertSame(0, $this->houseKeyQuantity($friend));
        $this->assertSame(1, $this->houseKeyQuantity($owner));
    }

    public function test_seizure_takes_the_keys_from_the_owner_and_the_key_holders(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $unit = HousingUnit::query()->where('offer_type', 'buy')->firstOrFail();
        $owner = $this->registerAndCreditWallet($unit->price_coins, 'coins');
        $friend = $this->registerAndCreditWallet(0, 'coins');
        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();
        $this->postJson('/api/housing/keys', ['account_id' => $friend['account_id']], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-09-23 12:00:01 UTC'));
        $this->assertSame(1, app(HousingService::class)->collectDueTaxes());

        $this->assertSame(0, $this->houseKeyQuantity($owner));
        $this->assertSame(0, $this->houseKeyQuantity($friend));

        Carbon::setTestNow();
    }

    /**
     * @param  array{token: string, account_id: int, username: string}  $player
     */
    private function houseKeyQuantity(array $player): int
    {
        $key = app(ApartmentPlacementService::class)
            ->listSpawnableAssets($player['account_id'])
            ->firstWhere('code', 'house_key');

        return $key === null ? 0 : (int) $key['quantity'];
    }

    /**
     * @return array{token: string, account_id: int, username: string}
     */
    private function registerAndCreditWallet(int $coins, string $currency): array
    {
        $email = 'u'.uniqid('', true).'@test.com';
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);

        $reg = $this->postJson('/api/register', [
            'email' => $email,
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
        ]);
        $reg->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $token = (string) $reg->json('token');

        $this->setWalletBalance($accountId, $currency, $coins);

        return ['token' => $token, 'account_id' => $accountId, 'username' => $username];
    }
}
