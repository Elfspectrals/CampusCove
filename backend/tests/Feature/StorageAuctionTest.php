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
use Illuminate\Testing\TestResponse;
use Tests\Concerns\SetsWalletBalance;
use Tests\TestCase;

class StorageAuctionTest extends TestCase
{
    use RefreshDatabase, SetsWalletBalance;

    private const SECRET = 'test-realtime-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.realtime.secret' => self::SECRET]);
    }

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

    public function test_each_bid_adds_ten_under_five_hundred_twenty_five_up_to_two_thousand_then_fifty(): void
    {
        $auction = app(StorageAuctionService::class);

        $this->assertSame(250, $auction->nextBid(null, 250));
        $this->assertSame(260, $auction->nextBid(250, 250));
        $this->assertSame(500, $auction->nextBid(490, 250));
        $this->assertSame(525, $auction->nextBid(500, 250));
        $this->assertSame(2015, $auction->nextBid(1990, 250));
        $this->assertSame(2050, $auction->nextBid(2000, 250));
    }

    public function test_relisted_opening_bid_is_sixty_percent_rounded_to_fifty(): void
    {
        $auction = app(StorageAuctionService::class);

        $this->assertSame(150, $auction->relistedOpeningBid(250));
        $this->assertSame(100, $auction->relistedOpeningBid(150));
        $this->assertSame(200, $auction->relistedOpeningBid(350));
        $this->assertSame(50, $auction->relistedOpeningBid(50));
    }

    public function test_opening_the_sale_adds_two_generated_lots_of_three_objects_once_per_night(): void
    {
        $this->catalogItem('storage_test_chair', 100);

        $first = $this->postJson('/api/storage/sale', ['night' => '2026-11-13'], $this->serverHeaders())->assertOk()->json('lots');
        $again = $this->postJson('/api/storage/sale', ['night' => '2026-11-13'], $this->serverHeaders())->assertOk()->json('lots');

        $this->assertCount(2, $first);
        $this->assertSame(array_column($first, 'lot_public_id'), array_column($again, 'lot_public_id'));
        foreach ($first as $lot) {
            $this->assertSame('generated', $lot['source']);
            $this->assertSame(250, $lot['opening_bid']);
            $this->assertSame(250, $lot['next_bid']);
            $this->assertSame(3, array_sum(array_column($lot['contents'], 'quantity')));
        }
        $this->assertSame(2, StorageLot::query()->count());
    }

    public function test_opening_the_sale_needs_the_realtime_secret(): void
    {
        $this->postJson('/api/storage/sale', ['night' => '2026-11-13'])->assertStatus(403)->assertJsonPath('code', 'realtime_only');
    }

    public function test_an_outbid_leader_gets_the_held_coins_back_and_stale_bids_are_refused(): void
    {
        $lot = $this->generatedLot();
        $alice = $this->register(1000, true);
        $bob = $this->register(1000, true);

        $this->bid($alice, $lot, 250)->assertOk()->assertJsonPath('next_bid', 260);
        $this->assertSame(750, $this->bank($alice));
        $this->bid($alice, $lot, 250)->assertOk();
        $this->assertSame(750, $this->bank($alice));
        $this->bid($bob, $lot, 250)->assertStatus(409)->assertJsonPath('code', 'storage_bid_stale');
        $this->bid($bob, $lot, 260)->assertOk()->assertJsonPath('leader_account_id', $bob['account_id']);

        $this->assertSame(1000, $this->bank($alice));
        $this->assertSame(740, $this->bank($bob));
    }

    public function test_young_accounts_and_empty_banks_cannot_bid(): void
    {
        $lot = $this->generatedLot();

        $this->bid($this->register(1000, false), $lot, 250)->assertStatus(403)->assertJsonPath('code', 'storage_bid_too_young');
        $this->bid($this->register(100, true), $lot, 250)->assertStatus(422)->assertJsonPath('code', 'insufficient_funds');
    }

    public function test_the_winner_opens_the_sold_box_once_and_the_price_stays_destroyed(): void
    {
        $lot = $this->generatedLot();
        $alice = $this->register(1000, true);
        $bob = $this->register(1000, true);
        $this->bid($alice, $lot, 250)->assertOk();

        $sold = $this->postJson("/api/storage/lots/{$lot}/hammer", [], $this->serverHeaders())->assertOk();
        $sold->assertJsonPath('status', 'sold')->assertJsonPath('winner_account_id', $alice['account_id'])->assertJsonPath('sale_price', 250);
        $this->postJson("/api/storage/lots/{$lot}/hammer", [], $this->serverHeaders())->assertOk()->assertJsonPath('sale_price', 250);
        $this->bid($bob, $lot, 260)->assertStatus(409)->assertJsonPath('code', 'storage_lot_closed');
        $this->open($bob, $lot)->assertStatus(403)->assertJsonPath('code', 'storage_not_winner');

        $opened = $this->open($alice, $lot)->assertOk();
        $this->open($alice, $lot)->assertOk();

        $this->assertSame(3, array_sum(array_column($opened->json('contents'), 'quantity')));
        $this->assertSame(3, $this->carriedChairs($alice));
        $this->assertSame(750, $this->bank($alice));
    }

    public function test_the_winner_opens_every_box_left_closed_later_at_the_auctioneer(): void
    {
        $this->catalogItem('storage_test_chair', 100);
        $lots = array_column($this->postJson('/api/storage/sale', ['night' => '2026-11-13'], $this->serverHeaders())->json('lots'), 'lot_public_id');
        $alice = $this->register(1000, true);
        $this->bid($alice, $lots[0], 250)->assertOk();
        $this->postJson("/api/storage/lots/{$lots[0]}/hammer", [], $this->serverHeaders())->assertJsonPath('status', 'sold');

        $first = $this->postJson('/api/storage/won/open', [], $this->playerHeaders($alice))->assertOk();
        $again = $this->postJson('/api/storage/won/open', [], $this->playerHeaders($alice))->assertOk();

        $this->assertSame([$lots[0]], array_column($first->json('lots'), 'lot_public_id'));
        $this->assertSame([], $again->json('lots'));
        $this->assertSame(3, $this->carriedChairs($alice));
    }

    public function test_an_unsold_box_comes_back_cheaper_twice_then_is_destroyed(): void
    {
        $lot = $this->generatedLot();
        $containerId = StorageLot::query()->where('public_id', $lot)->value('container_id');

        $this->postJson("/api/storage/lots/{$lot}/hammer", [], $this->serverHeaders())->assertJsonPath('status', 'listed')->assertJsonPath('opening_bid', 150);
        $this->postJson("/api/storage/lots/{$lot}/hammer", [], $this->serverHeaders())->assertJsonPath('status', 'listed')->assertJsonPath('opening_bid', 100);
        $this->postJson("/api/storage/lots/{$lot}/hammer", [], $this->serverHeaders())->assertJsonPath('status', 'destroyed');

        $this->assertSame(0, (int) DB::table('inventory_stacks')->where('container_id', $containerId)->count());
    }

    public function test_relisted_generated_lots_count_towards_the_two_of_the_night(): void
    {
        $lot = $this->generatedLot();
        $this->postJson("/api/storage/lots/{$lot}/hammer", [], $this->serverHeaders())->assertOk();

        $lots = $this->postJson('/api/storage/sale', ['night' => '2026-11-14'], $this->serverHeaders())->assertOk()->json('lots');

        $this->assertCount(2, $lots);
        $this->assertContains($lot, array_column($lots, 'lot_public_id'));
    }

    public function test_a_player_wins_at_most_one_generated_box_a_day(): void
    {
        $this->catalogItem('storage_test_chair', 100);
        $lots = array_column($this->postJson('/api/storage/sale', ['night' => '2026-11-13'], $this->serverHeaders())->json('lots'), 'lot_public_id');
        $alice = $this->register(1000, true);
        $this->bid($alice, $lots[0], 250)->assertOk();
        $this->postJson("/api/storage/lots/{$lots[0]}/hammer", [], $this->serverHeaders())->assertJsonPath('status', 'sold');

        $this->bid($alice, $lots[1], 250)->assertStatus(409)->assertJsonPath('code', 'storage_daily_win_cap');
    }

    public function test_seized_lots_are_sold_before_generated_ones(): void
    {
        $this->catalogItem('storage_test_chair', 100);
        $seizedId = $this->seizedLotId();

        $lots = $this->postJson('/api/storage/sale', ['night' => '2026-11-13'], $this->serverHeaders())->assertOk()->json('lots');

        $this->assertSame(['seized', 'generated', 'generated'], array_column($lots, 'source'));
        $this->assertSame($seizedId, $lots[0]['lot_public_id']);
    }

    private function generatedLot(): string
    {
        $this->catalogItem('storage_test_chair', 100);

        return $this->postJson('/api/storage/sale', ['night' => '2026-11-13'], $this->serverHeaders())->assertOk()->json('lots.0.lot_public_id');
    }

    private function seizedLotId(): string
    {
        $owner = $this->register(0, true);
        $containerId = (int) DB::table('containers')->insertGetId(['type' => 'storage_lot', 'created_at' => now()], 'container_id');
        $chair = (int) DB::table('item_defs')->where('code', 'storage_test_chair')->value('item_def_id');
        DB::table('inventory_stacks')->insert(['item_def_id' => $chair, 'container_id' => $containerId, 'quantity' => 1]);

        return (string) StorageLot::query()->create([
            'source' => 'seized',
            'container_id' => $containerId,
            'former_owner_account_id' => $owner['account_id'],
            'shop_value' => 100,
            'opening_bid' => 50,
        ])->fresh()->public_id;
    }

    /** @param array{token: string, account_id: int} $player */
    private function bid(array $player, string $lot, int $amount): TestResponse
    {
        return $this->postJson("/api/storage/lots/{$lot}/bid", ['amount' => $amount], $this->playerHeaders($player));
    }

    /** @param array{token: string, account_id: int} $player */
    private function open(array $player, string $lot): TestResponse
    {
        return $this->postJson("/api/storage/lots/{$lot}/open", [], $this->playerHeaders($player));
    }

    /** @param array{token: string, account_id: int} $player */
    private function bank(array $player): int
    {
        return (int) DB::table('wallet_ledger AS l')
            ->join('wallets AS w', 'w.wallet_id', '=', 'l.wallet_id')
            ->where('w.owner_type', 'account')
            ->where('w.owner_id', $player['account_id'])
            ->where('w.currency', 'coins')
            ->sum('l.delta');
    }

    /** @param array{token: string, account_id: int} $player */
    private function carriedChairs(array $player): int
    {
        $inbox = (int) DB::table('gift_inboxes')->where('account_id', $player['account_id'])->value('container_id');
        $chair = (int) DB::table('item_defs')->where('code', 'storage_test_chair')->value('item_def_id');

        return (int) DB::table('inventory_stacks')->where('container_id', $inbox)->where('item_def_id', $chair)->value('quantity');
    }

    /** @return array<string, string> */
    private function serverHeaders(): array
    {
        return ['X-Realtime-Secret' => self::SECRET];
    }

    /**
     * @param  array{token: string, account_id: int}  $player
     * @return array<string, string>
     */
    private function playerHeaders(array $player): array
    {
        $this->app['auth']->forgetGuards();

        return ['Authorization' => 'Bearer '.$player['token'], 'X-Realtime-Secret' => self::SECRET];
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
    private function register(int $coins, bool $old = false): array
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
        if ($old) {
            DB::table('accounts')->where('account_id', $accountId)->update(['created_at' => now()->subDays(4)]);
        }

        return ['token' => (string) $reg->json('token'), 'account_id' => $accountId];
    }
}
