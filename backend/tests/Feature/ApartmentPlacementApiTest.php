<?php

namespace Tests\Feature;

use App\Models\Account;
use App\Models\HousingUnit;
use Database\Seeders\HousingUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class ApartmentPlacementApiTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    public function test_spawn_consumes_one_pickup_restores_one_and_guest_can_edit(): void
    {
        $catalog = $this->createApartmentAssetCatalog();
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $guest = $this->registerAndCreditWallet(0, 'coins');
        $outsider = $this->registerAndCreditWallet(0, 'coins');
        $templateKey = $this->buyHouse($owner);

        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 2,
        ], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        $ownedBefore = $this->getJson('/api/apartments/assets', [
            'Authorization' => 'Bearer '.$owner['token'],
        ]);
        $ownedBefore->assertOk();
        $assetBefore = collect($ownedBefore->json('items'))->firstWhere('code', 'apartment_sofa_test');
        $this->assertNotNull($assetBefore);
        $this->assertSame(2, (int) $assetBefore['quantity']);

        $spawn = $this->postJson('/api/apartments/spawn', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $templateKey,
            'objectId' => 'spawn_test_obj_1',
            'objectKey' => 'apartment_sofa_test',
            'variant' => 'default',
            'color' => '#8B7AA8',
            'x' => 0,
            'y' => 0,
            'z' => 0,
            'rotX' => 0,
            'rotY' => 0,
            'rotZ' => 0,
        ], [
            'Authorization' => 'Bearer '.$owner['token'],
        ]);
        $spawn->assertOk();
        $spawn->assertJsonPath('object.objectId', 'spawn_test_obj_1');

        $ownedAfterSpawn = $this->getJson('/api/apartments/assets', [
            'Authorization' => 'Bearer '.$owner['token'],
        ]);
        $ownedAfterSpawn->assertOk();
        $assetAfterSpawn = collect($ownedAfterSpawn->json('items'))->firstWhere('code', 'apartment_sofa_test');
        $this->assertNotNull($assetAfterSpawn);
        $this->assertSame(1, (int) $assetAfterSpawn['quantity']);

        $roomId = (int) DB::table('rooms')
            ->where('name', 'apartment:'.$owner['account_id'].':'.$templateKey)
            ->value('room_id');
        $this->assertGreaterThan(0, $roomId);
        DB::table('room_memberships')->insert([
            'room_id' => $roomId,
            'account_id' => $guest['account_id'],
            'role' => 'editor',
            'created_at' => now(),
        ]);

        $this->patchJson('/api/apartments/transform', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $templateKey,
            'objectId' => 'spawn_test_obj_1',
            'x' => 1.5,
            'y' => 0,
            'z' => -2.5,
            'rotX' => 0,
            'rotY' => 0.5,
            'rotZ' => 0,
        ], [
            'Authorization' => 'Bearer '.$guest['token'],
        ])->assertOk();

        $outsiderAccount = Account::query()->findOrFail($outsider['account_id']);
        $this->actingAs($outsiderAccount, 'sanctum')->patchJson('/api/apartments/transform', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $templateKey,
            'objectId' => 'spawn_test_obj_1',
            'x' => 2,
            'y' => 0,
            'z' => 0,
            'rotX' => 0,
            'rotY' => 0,
            'rotZ' => 0,
        ])->assertStatus(403)->assertJsonPath('code', 'apartment_edit_forbidden');

        $ownerAccount = Account::query()->findOrFail($owner['account_id']);
        $this->actingAs($ownerAccount, 'sanctum')->postJson('/api/apartments/pickup', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => $templateKey,
            'objectId' => 'spawn_test_obj_1',
        ])->assertOk();

        $ownedAfterPickup = $this->getJson('/api/apartments/assets', [
            'Authorization' => 'Bearer '.$owner['token'],
        ]);
        $ownedAfterPickup->assertOk();
        $assetAfterPickup = collect($ownedAfterPickup->json('items'))->firstWhere('code', 'apartment_sofa_test');
        $this->assertNotNull($assetAfterPickup);
        $this->assertSame(2, (int) $assetAfterPickup['quantity']);
    }

    public function test_owner_without_house_cannot_decorate(): void
    {
        $this->createApartmentAssetCatalog();
        $owner = $this->registerAndCreditWallet(10_000, 'coins');

        $this->postJson('/api/apartments/spawn', $this->spawnPayload($owner['account_id'], 'starter_loft', 0, 0), [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertStatus(404)->assertJsonPath('code', 'no_house');
    }

    public function test_decorating_another_template_is_rejected(): void
    {
        $this->createApartmentAssetCatalog();
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $this->buyHouse($owner);

        $this->postJson('/api/apartments/spawn', $this->spawnPayload($owner['account_id'], 'starter_loft', 0, 0), [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertStatus(422)->assertJsonPath('code', 'template_mismatch');
    }

    public function test_furniture_outside_the_house_is_rejected(): void
    {
        $catalog = $this->createApartmentAssetCatalog();
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $templateKey = $this->buyHouse($owner);
        $this->postJson('/api/shop/purchase', [
            'shop_item_public_id' => $catalog->public_id,
            'quantity' => 1,
        ], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        $this->postJson('/api/apartments/spawn', $this->spawnPayload($owner['account_id'], $templateKey, 40, 0), [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertStatus(422)->assertJsonPath('code', 'out_of_bounds');
    }

    /**
     * @param array{token: string, account_id: int} $owner
     */
    private function buyHouse(array $owner): string
    {
        $this->seed(HousingUnitSeeder::class);
        $unit = HousingUnit::query()->where('offer_type', 'buy')->orderBy('unit_id')->firstOrFail();
        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        return 'housing_'.$unit->unit_id;
    }

    /**
     * @return array<string, mixed>
     */
    private function spawnPayload(int $ownerAccountId, string $templateKey, float $x, float $z): array
    {
        return [
            'owner_account_id' => $ownerAccountId,
            'template_key' => $templateKey,
            'objectId' => 'spawn_'.uniqid(),
            'objectKey' => 'apartment_sofa_test',
            'variant' => 'default',
            'color' => '#8B7AA8',
            'x' => $x,
            'y' => 0,
            'z' => $z,
            'rotX' => 0,
            'rotY' => 0,
            'rotZ' => 0,
        ];
    }

    private function createApartmentAssetCatalog(): object
    {
        $itemDefId = (int) DB::table('item_defs')->insertGetId([
            'code' => 'apartment_sofa_test',
            'name' => 'Apartment Sofa Test',
            'kind' => 'apartment_asset',
            'rarity' => 1,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 99,
            'created_at' => now(),
        ], 'item_def_id');

        $shopCatalogItemId = (int) DB::table('shop_catalog_items')->insertGetId([
            'item_def_id' => $itemDefId,
            'currency' => 'coins',
            'price' => 100,
            'allow_coins' => true,
            'coins_price' => 100,
            'allow_premium' => false,
            'premium_price' => null,
            'is_active' => true,
            'is_published' => true,
            'is_unique_per_account' => false,
            'stock_remaining' => null,
            'sort_order' => 999,
            'created_at' => now(),
            'updated_at' => now(),
        ], 'shop_catalog_item_id');

        /** @var object $catalog */
        $catalog = DB::table('shop_catalog_items')
            ->where('shop_catalog_item_id', $shopCatalogItemId)
            ->first();

        return $catalog;
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

