<?php

namespace Tests\Feature;

use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Services\AccountInventoryService;
use App\Services\TradeService;
use Database\Seeders\HousingUnitSeeder;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class RespawnBedApiTest extends TestCase
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

    public function test_the_owner_sets_their_bed_and_wakes_up_there(): void
    {
        $owner = $this->player();
        $bed = $this->placed($owner, 'decor_bed_single');

        $this->setBed($owner, $owner, $bed)->assertOk()->assertJsonPath('bed.object_id', $bed);

        $this->current($owner)->assertOk()->assertExactJson(['bed' => ['owner_account_id' => $owner['account_id'], 'object_id' => $bed]]);
    }

    public function test_a_key_holder_can_set_a_bed_but_a_visitor_cannot(): void
    {
        $owner = $this->player();
        $holder = $this->player();
        $visitor = $this->player();
        $bed = $this->placed($owner, 'decor_bunk_bed');
        $this->postJson('/api/housing/keys', ['account_id' => $holder['account_id']], $this->auth($owner['token']))->assertOk();

        $this->setBed($holder, $owner, $bed)->assertOk();
        $this->setBed($visitor, $owner, $bed)->assertForbidden()->assertJsonPath('code', 'bed_not_yours');
        $this->current($visitor)->assertExactJson(['bed' => null]);
    }

    public function test_only_a_bed_can_be_set(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');

        $this->setBed($owner, $owner, $dresser)->assertNotFound()->assertJsonPath('code', 'bed_not_found');
    }

    public function test_losing_the_keys_or_the_bed_sends_you_back_to_the_clinic(): void
    {
        $owner = $this->player();
        $holder = $this->player();
        $bed = $this->placed($owner, 'decor_bed_double');
        $this->postJson('/api/housing/keys', ['account_id' => $holder['account_id']], $this->auth($owner['token']))->assertOk();
        $this->setBed($holder, $owner, $bed)->assertOk();
        $this->setBed($owner, $owner, $bed)->assertOk();

        $this->deleteJson("/api/housing/keys/{$holder['account_id']}", [], $this->auth($owner['token']))->assertOk();
        $this->current($holder)->assertExactJson(['bed' => null]);

        $this->pickup($owner, $bed)->assertOk();
        $this->current($owner)->assertExactJson(['bed' => null]);
    }

    public function test_the_browser_cannot_set_a_bed_without_the_socket(): void
    {
        $owner = $this->player();
        $bed = $this->placed($owner, 'decor_bed_single');

        $this->postJson('/api/respawn-bed', ['owner_account_id' => $owner['account_id'], 'object_id' => $bed], $this->auth($owner['token']))->assertForbidden();
    }

    /**
     * @param  array{token: string}  $actor
     * @param  array{account_id: int}  $owner
     */
    private function setBed(array $actor, array $owner, string $objectId): TestResponse
    {
        return $this->postJson('/api/respawn-bed', ['owner_account_id' => $owner['account_id'], 'object_id' => $objectId], $this->auth($actor['token'], self::SECRET));
    }

    /** @param  array{token: string}  $player */
    private function current(array $player): TestResponse
    {
        return $this->getJson('/api/respawn-bed', $this->auth($player['token'], self::SECRET));
    }

    /** @param  array{token: string, account_id: int}  $owner */
    private function pickup(array $owner, string $objectId): TestResponse
    {
        return $this->postJson('/api/apartments/pickup', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $this->templateKey($owner),
            'objectId' => $objectId,
        ], $this->auth($owner['token']));
    }

    /** @param  array{token: string, account_id: int}  $owner */
    private function placed(array $owner, string $code): string
    {
        if (HousingUnit::query()->where('occupant_account_id', $owner['account_id'])->doesntExist()) {
            $unit = HousingUnit::query()->where('offer_type', 'buy')->where('status', '!=', 'occupied')->orderBy('unit_id')->firstOrFail();
            $this->setWalletBalance($owner['account_id'], Wallet::BANK, $unit->price_coins);
            $this->postJson("/api/housing/units/{$unit->public_id}/buy", [], $this->auth($owner['token']))->assertOk();
        }
        $this->give($owner, $code, 1);
        $objectId = 'storage_'.uniqid();
        $this->postJson('/api/apartments/spawn', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $this->templateKey($owner),
            'objectId' => $objectId,
            'objectKey' => $code,
            'x' => 0, 'y' => 0, 'z' => 0, 'rotX' => 0, 'rotY' => 0, 'rotZ' => 0,
        ], $this->auth($owner['token']))->assertOk();

        return $objectId;
    }

    /** @param  array{account_id: int}  $owner */
    private function templateKey(array $owner): string
    {
        return 'housing_'.HousingUnit::query()->where('occupant_account_id', $owner['account_id'])->value('unit_id');
    }

    /** @param  array{account_id: int}  $player */
    private function give(array $player, string $code, int $quantity): void
    {
        app(AccountInventoryService::class)->grantItem($player['account_id'], ItemDef::query()->where('code', $code)->firstOrFail(), $quantity);
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
        $accountId = (int) $reg->json('user.account_id');
        DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subHours(TradeService::MIN_GIVER_AGE_HOURS + 1)]);

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }

    /** @return array<string, string> */
    private function auth(string $token, ?string $secret = null): array
    {
        $this->app['auth']->forgetGuards();

        return array_filter(['Authorization' => 'Bearer '.$token, 'X-Realtime-Secret' => $secret]);
    }
}
