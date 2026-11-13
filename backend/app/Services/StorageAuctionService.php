<?php

namespace App\Services;

use App\Models\Container;
use App\Models\HousingUnit;
use App\Models\InventoryStack;
use App\Models\ItemInstance;
use App\Models\RoomFurniture;
use App\Models\RoomFurnitureContainer;
use App\Models\StorageLot;
use Illuminate\Support\Facades\DB;

final class StorageAuctionService
{
    public const SEIZED_OPENING_SHARE = 0.30;

    public const OPENING_BID_ROUNDING = 50;

    /** Moves everything kept in a seized house (placed furniture and chest) into one storage lot; null when empty. */
    public function boxSeizedHouse(HousingUnit $unit): ?StorageLot
    {
        if ($unit->room_id === null) {
            return null;
        }
        $roomContainerId = RoomFurnitureContainer::query()->where('room_id', (int) $unit->room_id)->value('container_id');
        if ($roomContainerId === null) {
            return null;
        }
        $roomContainerId = (int) $roomContainerId;
        $instanceCount = ItemInstance::query()->where('container_id', $roomContainerId)->count();
        $stackCount = InventoryStack::query()->where('container_id', $roomContainerId)->count();
        if ($instanceCount === 0 && $stackCount === 0) {
            return null;
        }

        $shopValue = $this->shopValueOf($roomContainerId);
        $lotContainer = Container::query()->create(['type' => 'storage_lot', 'created_at' => now()]);
        $lotContainerId = (int) $lotContainer->container_id;
        RoomFurniture::query()->where('room_id', (int) $unit->room_id)->delete();
        ItemInstance::query()->where('container_id', $roomContainerId)->update(['container_id' => $lotContainerId, 'updated_at' => now()]);
        InventoryStack::query()->where('container_id', $roomContainerId)->update(['container_id' => $lotContainerId, 'updated_at' => now()]);

        return StorageLot::query()->create([
            'source' => 'seized',
            'container_id' => $lotContainerId,
            'former_owner_account_id' => $unit->occupant_account_id,
            'housing_unit_id' => $unit->unit_id,
            'shop_value' => $shopValue,
            'opening_bid' => $this->seizedOpeningBid($shopValue),
        ]);
    }

    public function seizedOpeningBid(int $shopValue): int
    {
        $rounded = (int) (round($shopValue * self::SEIZED_OPENING_SHARE / self::OPENING_BID_ROUNDING) * self::OPENING_BID_ROUNDING);

        return max(self::OPENING_BID_ROUNDING, $rounded);
    }

    /** Coin price in the shop of everything in the container; an item the shop does not sell counts 0. */
    private function shopValueOf(int $containerId): int
    {
        $prices = DB::table('shop_catalog_items')
            ->where('allow_coins', true)
            ->groupBy('item_def_id')
            ->selectRaw('item_def_id, MIN(coins_price) AS price');
        $instances = DB::table('item_instances AS i')
            ->joinSub($prices, 'p', 'p.item_def_id', '=', 'i.item_def_id')
            ->where('i.container_id', $containerId)
            ->sum('p.price');
        $stacks = DB::table('inventory_stacks AS s')
            ->joinSub($prices, 'p', 'p.item_def_id', '=', 's.item_def_id')
            ->where('s.container_id', $containerId)
            ->sum(DB::raw('p.price * s.quantity'));

        return (int) $instances + (int) $stacks;
    }
}
