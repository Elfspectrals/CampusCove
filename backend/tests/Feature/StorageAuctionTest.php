<?php

namespace Tests\Feature;

use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\StorageLot;
use App\Services\AccountInventoryService;
use App\Services\HousingService;
use App\Services\StorageAuctionService;
use Database\Seeders\HousingUnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class StorageAuctionTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    public function test_seized_opening_bid_is_thirty_percent_of_the_shop_value_rounded_to_fifty(): void
    {
        $auction = app(StorageAuctionService::class);

        $this->assertSame(300, $auction->seizedOpeningBid(1000));
        $this->assertSame(350, $auction->seizedOpeningBid(1234));
        $this->assertSame(400, $auction->seizedOpeningBid(1250));
        $this->assertSame(50, $auction->seizedOpeningBid(100));
        $this->assertSame(50, $auction->seizedOpeningBid(0));
    }

    public function test_unpaid_tax_moves_placed_furniture_and_the_house_chest_into_one_storage_lot(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-13 12:00:00 UTC'));
        $this->seed(HousingUnitSeeder::class);
        $sofa = $this->catalogItem('storage_test_sofa', 1000);
        $mug = $this->catalogItem('storage_test_mug', 80);
        $unit = HousingUnit::query()->where('offer_type', 'buy')->orderBy('unit_id')->firstOrFail();
        $owner = $this->register($unit->price_coins);
        $headers = ['Authorization' => 'Bearer '.$owner['token']];

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], $headers)->assertOk();
        app(AccountInventoryService::class)->grantItem($owner['account_id'], ItemDef::query()->findOrFail($sofa['item_def_id']), 1);
        $this->postJson('/api/apartments/spawn', [
            'owner_account_id' => $owner['account_id'],
            'template_key' => 'housing_'.$unit->unit_id,
            'objectId' => 'sofa_1',
            'objectKey' => 'storage_test_sofa',
            'x' => 0, 'y' => 0, 'z' => 0, 'rotX' => 0, 'rotY' => 0, 'rotZ' => 0,
        ], $headers)->assertOk();
        $unit->refresh();
        $roomId = (int) $unit->room_id;
        $chestId = (int) DB::table('room_furniture_containers')->where('room_id', $roomId)->value('container_id');
        DB::table('inventory_stacks')->insert(['item_def_id' => $mug['item_def_id'], 'container_id' => $chestId, 'quantity' => 3]);
        $this->setWalletBalance($owner['account_id'], 'coins', 0);

        Carbon::setTestNow(Carbon::parse('2026-11-14 12:00:01 UTC'));
        $this->assertSame(1, app(HousingService::class)->collectDueTaxes());

        $lot = StorageLot::query()->sole();
        $this->assertSame('seized', $lot->source);
        $this->assertSame('listed', $lot->status);
        $this->assertSame($owner['account_id'], $lot->former_owner_account_id);
        $this->assertSame($unit->unit_id, $lot->housing_unit_id);
        $this->assertSame(1240, $lot->shop_value);
        $this->assertSame(350, $lot->opening_bid);
        $this->assertSame(1, DB::table('item_instances')->where('container_id', $lot->container_id)->where('item_def_id', $sofa['item_def_id'])->count());
        $this->assertSame(3, (int) DB::table('inventory_stacks')->where('container_id', $lot->container_id)->where('item_def_id', $mug['item_def_id'])->value('quantity'));
        $this->assertDatabaseMissing('room_furnitures', ['room_id' => $roomId]);
        $this->assertSame('vacant', $unit->fresh()->status);

        Carbon::setTestNow();
    }

    public function test_seizing_an_empty_house_creates_no_storage_lot(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-13 12:00:00 UTC'));
        $this->seed(HousingUnitSeeder::class);
        $unit = HousingUnit::query()->where('offer_type', 'buy')->orderBy('unit_id')->firstOrFail();
        $owner = $this->register($unit->price_coins);

        $this->postJson('/api/housing/units/'.$unit->public_id.'/buy', [], ['Authorization' => 'Bearer '.$owner['token']])->assertOk();

        Carbon::setTestNow(Carbon::parse('2026-11-14 12:00:01 UTC'));
        $this->assertSame(1, app(HousingService::class)->collectDueTaxes());
        $this->assertSame(0, StorageLot::query()->count());

        Carbon::setTestNow();
    }

    /** @return array{item_def_id: int, public_id: string} */
    private function catalogItem(string $code, int $price): array
    {
        $itemDefId = (int) DB::table('item_defs')->insertGetId([
            'code' => $code,
            'name' => $code,
            'kind' => 'furniture',
            'rarity' => 1,
            'tradable' => true,
            'premium_only' => false,
            'bind' => 'none',
            'max_stack' => 99,
            'created_at' => now(),
        ], 'item_def_id');
        $catalogId = (int) DB::table('shop_catalog_items')->insertGetId([
            'item_def_id' => $itemDefId,
            'currency' => 'coins',
            'price' => $price,
            'allow_coins' => true,
            'coins_price' => $price,
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

        return [
            'item_def_id' => $itemDefId,
            'public_id' => (string) DB::table('shop_catalog_items')->where('shop_catalog_item_id', $catalogId)->value('public_id'),
        ];
    }

    /** @return array{token: string, account_id: int} */
    private function register(int $coins): array
    {
        $username = 'u'.substr(str_replace('.', '', uniqid('', true)), 0, 10);
        $reg = $this->postJson('/api/register', [
            'email' => $username.'@test.com',
            'username' => $username,
            'password' => 'password1x',
            'password_confirmation' => 'password1x',
            'accepted_terms' => true,
            'age_confirmed' => true,
        ])->assertCreated();
        $accountId = (int) $reg->json('user.account_id');
        $this->setWalletBalance($accountId, 'coins', $coins);

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }
}
