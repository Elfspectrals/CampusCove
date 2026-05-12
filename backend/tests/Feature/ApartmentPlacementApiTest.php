<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ApartmentPlacementApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_spawn_consumes_one_pickup_restores_one_and_guest_can_edit(): void
    {
        $catalog = $this->createApartmentAssetCatalog();
        $owner = $this->registerAndCreditWallet(10_000, 'coins');
        $guest = $this->registerAndCreditWallet(0, 'coins');
        $outsider = $this->registerAndCreditWallet(0, 'coins');

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
            'template_key' => 'starter_loft',
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
            ->where('name', 'apartment:'.$owner['account_id'].':starter_loft')
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
            'template_key' => 'starter_loft',
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

        $this->patchJson('/api/apartments/transform', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => 'starter_loft',
            'objectId' => 'spawn_test_obj_1',
            'x' => 2,
            'y' => 0,
            'z' => 0,
            'rotX' => 0,
            'rotY' => 0,
            'rotZ' => 0,
        ], [
            'Authorization' => 'Bearer '.$outsider['token'],
        ])->assertStatus(403)->assertJsonPath('code', 'apartment_edit_forbidden');

        $this->postJson('/api/apartments/pickup', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => 'starter_loft',
            'objectId' => 'spawn_test_obj_1',
        ], [
            'Authorization' => 'Bearer '.$owner['token'],
        ])->assertOk();

        $ownedAfterPickup = $this->getJson('/api/apartments/assets', [
            'Authorization' => 'Bearer '.$owner['token'],
        ]);
        $ownedAfterPickup->assertOk();
        $assetAfterPickup = collect($ownedAfterPickup->json('items'))->firstWhere('code', 'apartment_sofa_test');
        $this->assertNotNull($assetAfterPickup);
        $this->assertSame(2, (int) $assetAfterPickup['quantity']);
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

        $walletId = (int) DB::table('wallets')->insertGetId([
            'owner_type' => 'account',
            'owner_id' => $accountId,
            'currency' => $currency,
            'created_at' => now(),
        ], 'wallet_id');

        if ($coins !== 0) {
            DB::table('wallet_ledger')->insert([
                'wallet_id' => $walletId,
                'tx_id' => null,
                'delta' => $coins,
                'reason' => 'test_credit',
                'created_at' => now(),
            ]);
        }

        return ['token' => $token, 'account_id' => $accountId];
    }
}

