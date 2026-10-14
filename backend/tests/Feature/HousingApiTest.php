<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\HousingUnit;
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

    public function test_rent_success_sets_lease_expiry(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $renter = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'rent')->firstOrFail();

        $response = $this->postJson('/api/housing/units/'.$unit->public_id.'/rent', [], [
            'Authorization' => 'Bearer '.$renter['token'],
        ]);
        $response->assertOk();
        $response->assertJsonPath('unit.lease_expires_at', '2026-09-29T12:00:00+00:00');

        $this->assertDatabaseHas('wallet_ledger', [
            'reason' => 'housing_rent',
            'delta' => -$unit->price_coins,
        ]);

        Carbon::setTestNow();
    }

    public function test_renew_extends_lease_and_debits(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $renter = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'rent')->firstOrFail();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/rent', [], [
            'Authorization' => 'Bearer '.$renter['token'],
        ])->assertOk();

        $renew = $this->postJson('/api/housing/units/'.$unit->public_id.'/renew', [], [
            'Authorization' => 'Bearer '.$renter['token'],
        ]);
        $renew->assertOk();
        $renew->assertJsonPath('unit.lease_expires_at', '2026-10-06T12:00:00+00:00');

        $this->assertDatabaseHas('wallet_ledger', [
            'reason' => 'housing_renew',
            'delta' => -$unit->price_coins,
        ]);

        Carbon::setTestNow();
    }

    public function test_expire_due_leases_resets_unit_and_room(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-22 12:00:00 UTC'));
        $renter = $this->registerAndCreditWallet(10_000, 'coins');
        $unit = HousingUnit::query()->where('offer_type', 'rent')->firstOrFail();

        $this->postJson('/api/housing/units/'.$unit->public_id.'/rent', [], [
            'Authorization' => 'Bearer '.$renter['token'],
        ])->assertOk();

        $unit->refresh();
        $roomId = (int) $unit->room_id;
        $this->assertDatabaseHas('room_memberships', [
            'room_id' => $roomId,
            'account_id' => $renter['account_id'],
        ]);

        Carbon::setTestNow(Carbon::parse('2026-09-30 00:00:00 UTC'));
        $expired = app(HousingService::class)->expireDueLeases();
        $this->assertSame(1, $expired);

        $unit->refresh();
        $this->assertSame('vacant', $unit->status);
        $this->assertNull($unit->occupant_account_id);
        $this->assertNull($unit->lease_expires_at);
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

    /**
     * @return array{token: string, account_id: int}
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

        return ['token' => $token, 'account_id' => $accountId];
    }
}
