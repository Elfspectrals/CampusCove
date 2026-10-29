<?php

namespace Tests\Feature;

use App\Models\HousingUnit;
use App\Services\ApartmentPlacementService;
use App\Services\HousingService;
use Database\Seeders\HousingUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class AdminHousingApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private HousingUnit $unit;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(HousingUnitSeeder::class);
        $this->unit = HousingUnit::query()->orderBy('unit_id')->firstOrFail();
        config([
            'services.realtime.url' => 'http://socket.test:3000',
            'services.realtime.secret' => 'test-secret',
        ]);
        Http::fake(['socket.test:3000/*' => Http::response(['ok' => true])]);
    }

    public function test_housing_admin_routes_are_admin_only(): void
    {
        $player = $this->registerAndCreditWallet(0, 'coins');
        $headers = ['Authorization' => 'Bearer '.$player['token']];
        $path = '/api/admin/housing/units';

        $this->getJson($path)->assertUnauthorized();
        $this->getJson($path, $headers)->assertForbidden()->assertJsonPath('code', 'admin_required');
        $this->patchJson($path.'/'.$this->unit->public_id, ['price_coins' => 1], $headers)->assertForbidden();
        $this->deleteJson($path.'/'.$this->unit->public_id.'/owner', [], $headers)->assertForbidden();
        $this->deleteJson($path.'/'.$this->unit->public_id.'/key-holders/1', [], $headers)->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_admin_sees_owners_and_who_shared_keys_with_whom(): void
    {
        [$owner, $friend] = $this->ownerWithKeyHolder();
        $admin = $this->registerAndCreditWallet(0, 'coins', admin: true);

        $response = $this->getJson('/api/admin/housing/units', ['Authorization' => 'Bearer '.$admin['token']]);
        $response->assertOk()->assertJsonCount(10, 'units');
        $unit = collect($response->json('units'))->firstWhere('public_id', $this->unit->public_id);
        $this->assertSame('occupied', $unit['status']);
        $this->assertSame(['account_id' => $owner['account_id'], 'username' => $owner['username']], $unit['owner']);
        $this->assertCount(1, $unit['key_holders']);
        $this->assertSame($friend['account_id'], $unit['key_holders'][0]['account_id']);
        $this->assertSame($friend['username'], $unit['key_holders'][0]['username']);
        $this->assertSame($owner['account_id'], $unit['key_holders'][0]['shared_by']['account_id']);
        $this->assertSame((int) ceil($this->unit->price_coins * 0.05), $unit['tax_coins']);
        $this->assertFalse($unit['tax_is_custom']);
    }

    public function test_new_price_applies_to_the_next_purchase(): void
    {
        $admin = $this->registerAndCreditWallet(0, 'coins', admin: true);
        $this->patchJson('/api/admin/housing/units/'.$this->unit->public_id, ['price_coins' => 9000], [
            'Authorization' => 'Bearer '.$admin['token'],
        ])->assertOk();

        $this->assertSame(9000, (int) $this->unit->fresh()->price_coins);
        // the boot-time seeder must not put the old price back
        $this->seed(HousingUnitSeeder::class);
        $this->assertSame(9000, (int) $this->unit->fresh()->price_coins);

        $buyer = $this->registerAndCreditWallet(10_000, 'coins');
        $this->postJson('/api/housing/units/'.$this->unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$buyer['token'],
        ])->assertOk();
        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'housing_buy', 'delta' => -9000]);

        $this->assertDatabaseHas('staff_audit_logs', ['staff_account_id' => $admin['account_id'], 'action' => 'housing.pricing']);
        Http::assertSent(fn (Request $request): bool => $request->url() === 'http://socket.test:3000/internal/housing-changed'
            && $request->header('X-Realtime-Secret') === ['test-secret']);
    }

    public function test_custom_daily_tax_is_charged_until_reset_to_the_default(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-29 12:00:00 UTC'));
        [$owner] = $this->ownerWithKeyHolder(walletAfterPurchase: 1000);
        $admin = $this->registerAndCreditWallet(0, 'coins', admin: true);
        $headers = ['Authorization' => 'Bearer '.$admin['token']];

        $this->patchJson('/api/admin/housing/units/'.$this->unit->public_id, ['tax_coins' => 7], $headers)
            ->assertOk();
        $this->assertSame(7, collect($this->getJson('/api/admin/housing/units', $headers)->json('units'))
            ->firstWhere('public_id', $this->unit->public_id)['tax_coins']);

        Carbon::setTestNow(Carbon::parse('2026-10-30 12:00:01 UTC'));
        app(HousingService::class)->collectDueTaxes();
        $this->assertDatabaseHas('wallet_ledger', ['reason' => 'housing_tax', 'delta' => -7]);

        $this->patchJson('/api/admin/housing/units/'.$this->unit->public_id, ['tax_coins' => null], $headers)
            ->assertOk();
        $this->assertNull($this->unit->fresh()->tax_coins);
        $this->assertSame((int) ceil($this->unit->price_coins * 0.05), app(HousingService::class)->taxFor($this->unit->fresh()));
        $this->assertSame(['occupied', $owner['account_id']], [$this->unit->fresh()->status, (int) $this->unit->fresh()->occupant_account_id]);

        Carbon::setTestNow();
    }

    public function test_pricing_is_validated(): void
    {
        $admin = $this->registerAndCreditWallet(0, 'coins', admin: true);
        $headers = ['Authorization' => 'Bearer '.$admin['token']];

        $this->patchJson('/api/admin/housing/units/'.$this->unit->public_id, ['price_coins' => 0], $headers)
            ->assertUnprocessable();
        $this->patchJson('/api/admin/housing/units/'.$this->unit->public_id, ['tax_coins' => -1], $headers)
            ->assertUnprocessable();
        $this->patchJson('/api/admin/housing/units/missing', ['price_coins' => 10], $headers)
            ->assertNotFound()->assertJsonPath('code', 'unit_not_found');
    }

    public function test_kicking_a_key_holder_takes_their_key_back(): void
    {
        [$owner, $friend] = $this->ownerWithKeyHolder();
        $admin = $this->registerAndCreditWallet(0, 'coins', admin: true);
        $path = '/api/admin/housing/units/'.$this->unit->public_id.'/key-holders/'.$friend['account_id'];

        $this->deleteJson($path, [], ['Authorization' => 'Bearer '.$admin['token']])->assertOk();
        $this->assertSame([], app(HousingService::class)->keyHolderIds($this->unit->fresh()));
        $this->assertSame(0, $this->houseKeyQuantity($friend));
        $this->assertSame(1, $this->houseKeyQuantity($owner));
        $this->assertDatabaseHas('staff_audit_logs', ['action' => 'housing.kick_key_holder']);
        Http::assertSentCount(1);

        $this->deleteJson($path, [], ['Authorization' => 'Bearer '.$admin['token']])
            ->assertNotFound()->assertJsonPath('code', 'not_key_holder');
    }

    public function test_kicking_the_owner_evicts_them_like_a_seizure(): void
    {
        [$owner, $friend] = $this->ownerWithKeyHolder();
        $admin = $this->registerAndCreditWallet(0, 'coins', admin: true);
        $path = '/api/admin/housing/units/'.$this->unit->public_id.'/owner';

        $response = $this->deleteJson($path, [], ['Authorization' => 'Bearer '.$admin['token']]);
        $response->assertOk()->assertJsonPath('recent_actions.0.action', 'kick_owner');

        $unit = $this->unit->fresh();
        $this->assertSame('vacant', $unit->status);
        $this->assertNull($unit->occupant_account_id);
        $this->assertNull($unit->room_id);
        $this->assertSame(0, $this->houseKeyQuantity($owner));
        $this->assertSame(0, $this->houseKeyQuantity($friend));
        $this->assertSame($owner['account_id'], $response->json('recent_actions.0.target.account_id'));

        $this->deleteJson($path, [], ['Authorization' => 'Bearer '.$admin['token']])
            ->assertStatus(422)->assertJsonPath('code', 'unit_not_occupied');
    }

    /**
     * @return array{0: array{token: string, account_id: int, username: string}, 1: array{token: string, account_id: int, username: string}}
     */
    private function ownerWithKeyHolder(int $walletAfterPurchase = 0): array
    {
        $owner = $this->registerAndCreditWallet((int) $this->unit->price_coins + $walletAfterPurchase, 'coins');
        $friend = $this->registerAndCreditWallet(0, 'coins');
        $this->postJson('/api/housing/units/'.$this->unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();
        $this->postJson('/api/housing/keys', ['account_id' => $friend['account_id']], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();
        $this->app['auth']->forgetGuards();

        return [$owner, $friend];
    }

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
    private function registerAndCreditWallet(int $coins, string $currency, bool $admin = false): array
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
        if ($admin) {
            DB::table('accounts')->where('account_id', $accountId)->update(['is_admin' => true]);
        }
        $this->app['auth']->forgetGuards();

        return ['token' => $token, 'account_id' => $accountId, 'username' => $username];
    }
}
