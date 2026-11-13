<?php

namespace Tests\Feature;

use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\StorageLot;
use App\Models\Wallet;
use App\Services\AccountInventoryService;
use App\Services\HousingService;
use App\Services\LockpickService;
use App\Services\TradeService;
use App\Support\FoodCatalog;
use Database\Seeders\HousingUnitSeeder;
use Database\Seeders\ShopSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class FurnitureStorageApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    private const CLOTHES = 'COS_WEAR_BOTTOM_LEGGINGS';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ShopSeeder::class);
        $this->seed(HousingUnitSeeder::class);
        config(['services.realtime.secret' => self::SECRET]);
    }

    public function test_the_owner_puts_food_away_and_sees_it_in_the_dresser(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, 'food_cookie', 5);

        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 3])
            ->assertOk()
            ->assertJsonPath('slots', 8)
            ->assertJsonPath('can_deposit', true)
            ->assertJsonPath('items.0.code', 'food_cookie')
            ->assertJsonPath('items.0.quantity', 3);

        $this->assertSame(2, $this->owned($owner, 'food_cookie'));
    }

    public function test_anyone_next_to_it_can_take_but_only_owner_and_key_holders_put_away(): void
    {
        $owner = $this->player();
        $holder = $this->player();
        $burglar = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->postJson('/api/housing/keys', ['account_id' => $holder['account_id']], $this->auth($owner['token']))->assertOk();
        $this->give($owner, 'food_cookie', 4);
        $this->give($holder, 'food_cookie', 1);
        $this->give($burglar, 'food_cookie', 1);
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 4])->assertOk();

        $this->storage('deposit', $holder, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertOk();
        $this->storage('open', $burglar, $owner, $dresser)->assertOk()->assertJsonPath('can_deposit', false);
        $this->storage('deposit', $burglar, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertForbidden()->assertJsonPath('code', 'storage_not_yours');
        $this->storage('take', $burglar, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 5])->assertOk()->assertJsonPath('items', []);

        $this->assertSame(6, $this->owned($burglar, 'food_cookie'));
        $this->storage('take', $burglar, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertStatus(409)->assertJsonPath('code', 'storage_item_gone');
    }

    public function test_the_fridge_takes_food_only(): void
    {
        $owner = $this->player();
        $fridge = $this->placed($owner, 'decor_fridge_retro');
        $this->give($owner, LockpickService::ITEM_CODE, 1);
        $this->give($owner, 'food_cookie', 1);

        $this->storage('deposit', $owner, $owner, $fridge, ['code' => LockpickService::ITEM_CODE, 'quantity' => 1])->assertStatus(422)->assertJsonPath('code', 'storage_food_only');
        $this->storage('deposit', $owner, $owner, $fridge, ['code' => 'food_cookie', 'quantity' => 1])->assertOk()->assertJsonPath('slots', 10);
    }

    public function test_the_toy_chest_holds_six_kinds_of_items(): void
    {
        $owner = $this->player();
        $chest = $this->placed($owner, 'decor_toy_chest');
        $codes = array_slice(array_column(FoodCatalog::items(), 'code'), 0, 7);
        foreach ($codes as $code) {
            $this->give($owner, $code, 2);
        }

        foreach (array_slice($codes, 0, 6) as $code) {
            $this->storage('deposit', $owner, $owner, $chest, ['code' => $code, 'quantity' => 1])->assertOk();
        }

        $this->storage('deposit', $owner, $owner, $chest, ['code' => $codes[6], 'quantity' => 1])->assertStatus(422)->assertJsonPath('code', 'storage_full');
        $this->storage('deposit', $owner, $owner, $chest, ['code' => $codes[0], 'quantity' => 1])->assertOk();
    }

    public function test_a_full_bag_cannot_take_more(): void
    {
        $owner = $this->player();
        $thief = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, LockpickService::ITEM_CODE, 1);
        $this->give($thief, LockpickService::ITEM_CODE, 10);
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => LockpickService::ITEM_CODE, 'quantity' => 1])->assertOk();

        $this->storage('take', $thief, $owner, $dresser, ['code' => LockpickService::ITEM_CODE, 'quantity' => 1])->assertStatus(422)->assertJsonPath('code', 'storage_bag_full');
    }

    public function test_clothes_are_stored_unless_worn_and_house_keys_never(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, self::CLOTHES, 1);
        $clothesId = ItemDef::query()->where('code', self::CLOTHES)->value('item_def_id');
        DB::table('account_cosmetic_equipment')->insert(['account_id' => $owner['account_id'], 'slot' => 'bottom', 'item_def_id' => $clothesId]);

        $this->storage('deposit', $owner, $owner, $dresser, ['code' => self::CLOTHES, 'quantity' => 1])->assertStatus(422)->assertJsonPath('code', 'storage_item_worn');
        DB::table('account_cosmetic_equipment')->where('account_id', $owner['account_id'])->delete();
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => self::CLOTHES, 'quantity' => 1])->assertOk();
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'house_key', 'quantity' => 1])->assertStatus(422)->assertJsonPath('code', 'storage_item_refused');

        $this->assertSame(0, $this->owned($owner, self::CLOTHES));
    }

    public function test_a_started_meal_stays_in_the_bag(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, 'food_cookie', 2);
        DB::table('inventory_stacks')->where('container_id', $this->bag($owner))->update(['portions_used' => 1]);

        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 2])->assertStatus(422)->assertJsonPath('code', 'storage_item_missing');
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertOk();
    }

    public function test_a_storage_must_be_empty_to_be_picked_up(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, 'food_cookie', 1);
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertOk();

        $this->pickup($owner, $dresser)->assertJsonPath('code', 'storage_not_empty');
        $this->storage('take', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertOk();
        $this->pickup($owner, $dresser)->assertOk();

        $this->assertSame(0, DB::table('furniture_storages')->count());
    }

    public function test_a_lost_house_destroys_what_its_furniture_held(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, 'food_cookie', 1);
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 1])->assertOk();
        $containerId = DB::table('furniture_storages')->value('container_id');

        app(HousingService::class)->resetExpiredUnit(HousingUnit::query()->where('occupant_account_id', $owner['account_id'])->firstOrFail());

        $this->assertSame(0, DB::table('furniture_storages')->count());
        $this->assertFalse(DB::table('inventory_stacks')->where('container_id', $containerId)->exists());
    }

    public function test_a_seized_house_moves_what_its_furniture_held_into_the_storage_lot(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');
        $this->give($owner, 'food_cookie', 2);
        $this->storage('deposit', $owner, $owner, $dresser, ['code' => 'food_cookie', 'quantity' => 2])->assertOk();
        $unit = HousingUnit::query()->where('occupant_account_id', $owner['account_id'])->firstOrFail();
        $unit->update(['tax_due_at' => now()->subMinute()]);
        $this->setWalletBalance($owner['account_id'], Wallet::BANK, 0);

        $this->assertSame(1, app(HousingService::class)->collectDueTaxes());

        $lot = StorageLot::query()->sole();
        $cookie = ItemDef::query()->where('code', 'food_cookie')->firstOrFail();
        $this->assertSame(2, (int) DB::table('inventory_stacks')->where('container_id', $lot->container_id)->where('item_def_id', $cookie->item_def_id)->value('quantity'));
        $this->assertSame(0, DB::table('furniture_storages')->count());
        $this->assertSame('vacant', $unit->fresh()->status);
    }

    public function test_the_browser_cannot_open_a_storage_without_the_socket(): void
    {
        $owner = $this->player();
        $dresser = $this->placed($owner, 'decor_dresser');

        $this->postJson('/api/furniture-storage/open', ['owner_account_id' => $owner['account_id'], 'object_id' => $dresser], $this->auth($owner['token']))->assertForbidden();
    }

    /**
     * @param  array{token: string}  $actor
     * @param  array{account_id: int}  $owner
     * @param  array<string, mixed>  $body
     */
    private function storage(string $action, array $actor, array $owner, string $objectId, array $body = []): TestResponse
    {
        return $this->postJson("/api/furniture-storage/{$action}", ['owner_account_id' => $owner['account_id'], 'object_id' => $objectId, ...$body], $this->auth($actor['token'], self::SECRET));
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

    /** @param  array{account_id: int}  $player */
    private function owned(array $player, string $code): int
    {
        return app(TradeService::class)->ownedQuantity($player['account_id'], ItemDef::query()->where('code', $code)->firstOrFail());
    }

    /** @param  array{account_id: int}  $player */
    private function bag(array $player): int
    {
        return app(AccountInventoryService::class)->getOrCreateGiftInboxContainerId($player['account_id']);
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
