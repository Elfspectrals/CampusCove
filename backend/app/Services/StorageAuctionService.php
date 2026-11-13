<?php

namespace App\Services;

use App\Exceptions\StorageAuctionRejectedException;
use App\Models\Account;
use App\Models\AccountHandle;
use App\Models\Container;
use App\Models\EconomyTransaction;
use App\Models\HousingUnit;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\ItemInstance;
use App\Models\RoomFurniture;
use App\Models\RoomFurnitureContainer;
use App\Models\StorageLot;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class StorageAuctionService
{
    public const SEIZED_OPENING_SHARE = 0.30;

    public const OPENING_BID_ROUNDING = 50;

    public const RELIST_FACTOR = 0.6;

    public const MAX_UNSOLD_NIGHTS = 3;

    public const GENERATED_LOTS_PER_NIGHT = 2;

    public const GENERATED_OBJECTS_PER_LOT = 3;

    public const GENERATED_OPENING_BID = 250;

    public const GENERATED_WINS_PER_DAY = 1;

    private const RARITY_ROLL = [1 => 800, 2 => 970, 3 => 995, 4 => 1000];

    private const BANK = 'coins';

    public function __construct(private readonly AccountInventoryService $inventory) {}

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
        $lotContainerId = $this->newLotContainerId();
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
        return $this->roundToFifty($shopValue * self::SEIZED_OPENING_SHARE);
    }

    public function relistedOpeningBid(int $openingBid): int
    {
        return $this->roundToFifty($openingBid * self::RELIST_FACTOR);
    }

    public function nextBid(?int $leadingAmount, int $openingBid): int
    {
        if ($leadingAmount === null) {
            return $openingBid;
        }
        $step = match (true) {
            $leadingAmount < 500 => 10,
            $leadingAmount < 2000 => 25,
            default => 50,
        };

        return $leadingAmount + $step;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function openSale(CarbonImmutable $night): array
    {
        return DB::transaction(function () use ($night): array {
            $listed = StorageLot::query()->where('status', 'listed')->lockForUpdate()->get();
            foreach ($listed as $lot) {
                $this->refundLeadingBid($lot);
            }
            $this->topUpGeneratedLots($night->toDateString(), $listed->where('source', 'generated')->count());

            return StorageLot::query()
                ->where('status', 'listed')
                ->orderByRaw("CASE WHEN source = 'seized' THEN 0 ELSE 1 END")
                ->orderBy('id')
                ->get()
                ->map(fn (StorageLot $lot): array => $this->serializeLot($lot))
                ->all();
        });
    }

    /** @return array{lot_public_id: string, amount: int, leader_account_id: int, next_bid: int} */
    public function bid(string $lotPublicId, int $accountId, int $amount): array
    {
        return DB::transaction(function () use ($lotPublicId, $accountId, $amount): array {
            $lot = $this->lockListedLot($lotPublicId);
            $this->assertMayBid($lot, $accountId);
            $leading = $this->leadingBid($lot);
            if ($leading !== null && (int) $leading->account_id === $accountId) {
                if ((int) $leading->amount !== $amount) {
                    throw new StorageAuctionRejectedException('storage_already_leading', 'You already hold the best bid.', 409);
                }

                return $this->bidResult($lot, $accountId, $amount);
            }
            $expected = $this->nextBid($leading !== null ? (int) $leading->amount : null, $lot->opening_bid);
            if ($amount !== $expected) {
                throw new StorageAuctionRejectedException('storage_bid_stale', "The next bid is {$expected}.", 409);
            }
            $wallet = Wallet::lockForAccount($accountId, self::BANK);
            if ($wallet->balance() < $amount) {
                throw new StorageAuctionRejectedException('insufficient_funds', 'Not enough coins in the bank.', 422);
            }
            $holdTxId = $this->transaction($accountId, 'storage_bid_hold', ['storage_lot_id' => $lot->id, 'amount' => $amount]);
            $this->entry($wallet, $holdTxId, -$amount, 'storage_bid_hold');
            $this->refundLeadingBid($lot);
            DB::table('storage_bids')->insert([
                'lot_id' => $lot->id,
                'account_id' => $accountId,
                'amount' => $amount,
                'hold_tx_id' => $holdTxId,
            ]);

            return $this->bidResult($lot, $accountId, $amount);
        });
    }

    /**
     * @return array{lot_public_id: string, status: string, winner_account_id: int|null, sale_price: int|null, opening_bid: int}
     */
    public function hammer(string $lotPublicId): array
    {
        return DB::transaction(function () use ($lotPublicId): array {
            $lot = StorageLot::query()->where('public_id', $lotPublicId)->lockForUpdate()->first();
            if ($lot === null) {
                throw new StorageAuctionRejectedException('storage_lot_not_found', 'This storage lot does not exist.', 404);
            }
            if ($lot->status === 'listed') {
                $leading = $this->leadingBid($lot);
                if ($leading !== null) {
                    $lot->update([
                        'status' => 'sold',
                        'winner_account_id' => (int) $leading->account_id,
                        'sale_price' => (int) $leading->amount,
                        'closed_at' => now(),
                    ]);
                } elseif ($lot->nights_listed + 1 >= self::MAX_UNSOLD_NIGHTS) {
                    $this->destroyContents($lot->container_id);
                    $lot->update(['status' => 'destroyed', 'nights_listed' => $lot->nights_listed + 1, 'closed_at' => now()]);
                } else {
                    $lot->update([
                        'nights_listed' => $lot->nights_listed + 1,
                        'opening_bid' => $this->relistedOpeningBid($lot->opening_bid),
                    ]);
                }
            }

            return [
                'lot_public_id' => (string) $lot->public_id,
                'status' => $lot->status,
                'winner_account_id' => $lot->winner_account_id,
                'sale_price' => $lot->sale_price,
                'opening_bid' => $lot->opening_bid,
            ];
        });
    }

    /**
     * @return array{lot_public_id: string, contents: list<array<string, mixed>>}
     */
    public function open(string $lotPublicId, int $accountId): array
    {
        return DB::transaction(function () use ($lotPublicId, $accountId): array {
            $lot = StorageLot::query()->where('public_id', $lotPublicId)->lockForUpdate()->first();
            if ($lot === null || $lot->status !== 'sold' || $lot->winner_account_id !== $accountId) {
                throw new StorageAuctionRejectedException('storage_not_winner', 'Only the winner can open this box.', 403);
            }
            $contents = $this->contentsOf($lot->container_id);
            if ($lot->opened_at === null) {
                $this->deliverContents($lot->container_id, $accountId);
                $lot->update(['opened_at' => now()]);
            }

            return ['lot_public_id' => (string) $lot->public_id, 'contents' => $contents];
        });
    }

    private function topUpGeneratedLots(string $night, int $listedGenerated): void
    {
        for ($slot = 1; $slot <= self::GENERATED_LOTS_PER_NIGHT && $listedGenerated < self::GENERATED_LOTS_PER_NIGHT; $slot++) {
            if (StorageLot::query()->where('generated_for', $night)->where('generated_slot', $slot)->exists()) {
                continue;
            }
            $this->createGeneratedLot($night, $slot);
            $listedGenerated++;
        }
    }

    private function createGeneratedLot(string $night, int $slot): void
    {
        $pool = $this->furniturePoolByRarity();
        if ($pool === []) {
            throw new StorageAuctionRejectedException('storage_pool_empty', 'No shop furniture to fill a storage lot.', 500);
        }
        $containerId = $this->newLotContainerId();
        for ($i = 0; $i < self::GENERATED_OBJECTS_PER_LOT; $i++) {
            $tier = $pool[$this->rollRarity()] ?? $pool[min(array_keys($pool))];
            $itemDefId = $tier[random_int(0, count($tier) - 1)];
            $stack = InventoryStack::query()->where('container_id', $containerId)->where('item_def_id', $itemDefId)->first();
            if ($stack !== null) {
                $stack->update(['quantity' => $stack->quantity + 1]);
            } else {
                InventoryStack::query()->create(['item_def_id' => $itemDefId, 'container_id' => $containerId, 'quantity' => 1]);
            }
        }
        StorageLot::query()->create([
            'source' => 'generated',
            'container_id' => $containerId,
            'shop_value' => $this->shopValueOf($containerId),
            'opening_bid' => self::GENERATED_OPENING_BID,
            'generated_for' => $night,
            'generated_slot' => $slot,
        ]);
    }

    private function rollRarity(): int
    {
        $roll = random_int(1, 1000);
        foreach (self::RARITY_ROLL as $rarity => $upTo) {
            if ($roll <= $upTo) {
                return $rarity;
            }
        }

        return 1;
    }

    /** @return array<int, list<int>> */
    private function furniturePoolByRarity(): array
    {
        $rows = DB::table('item_defs AS d')
            ->join('shop_catalog_items AS c', 'c.item_def_id', '=', 'd.item_def_id')
            ->where('d.kind', 'furniture')
            ->where('c.allow_coins', true)
            ->where('c.is_active', true)
            ->distinct()
            ->get(['d.item_def_id', 'd.rarity']);
        $pool = [];
        foreach ($rows as $row) {
            $pool[(int) $row->rarity][] = (int) $row->item_def_id;
        }

        return $pool;
    }

    private function lockListedLot(string $lotPublicId): StorageLot
    {
        $lot = StorageLot::query()->where('public_id', $lotPublicId)->lockForUpdate()->first();
        if ($lot === null) {
            throw new StorageAuctionRejectedException('storage_lot_not_found', 'This storage lot does not exist.', 404);
        }
        if ($lot->status !== 'listed') {
            throw new StorageAuctionRejectedException('storage_lot_closed', 'This box is no longer on sale.', 409);
        }

        return $lot;
    }

    private function assertMayBid(StorageLot $lot, int $accountId): void
    {
        $tooYoung = Account::query()->whereKey($accountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
        if ($tooYoung) {
            throw new StorageAuctionRejectedException('storage_bid_too_young', 'New accounts cannot bid yet.', 403);
        }
        if ($lot->source !== 'generated') {
            return;
        }
        $wonToday = StorageLot::query()
            ->where('source', 'generated')
            ->where('winner_account_id', $accountId)
            ->where('closed_at', '>=', now()->startOfDay())
            ->count();
        if ($wonToday >= self::GENERATED_WINS_PER_DAY) {
            throw new StorageAuctionRejectedException('storage_daily_win_cap', 'You already won a storage box today.', 409);
        }
    }

    private function leadingBid(StorageLot $lot): ?object
    {
        return DB::table('storage_bids')
            ->where('lot_id', $lot->id)
            ->whereNull('refund_tx_id')
            ->orderByDesc('amount')
            ->first();
    }

    private function refundLeadingBid(StorageLot $lot): void
    {
        $leading = $this->leadingBid($lot);
        if ($leading === null) {
            return;
        }
        $accountId = (int) $leading->account_id;
        $wallet = Wallet::lockForAccount($accountId, self::BANK);
        $txId = $this->transaction($accountId, 'storage_bid_refund', ['storage_lot_id' => $lot->id, 'amount' => (int) $leading->amount]);
        $this->entry($wallet, $txId, (int) $leading->amount, 'storage_bid_refund');
        DB::table('storage_bids')->where('id', $leading->id)->update(['refund_tx_id' => $txId]);
    }

    /** @return array{lot_public_id: string, amount: int, leader_account_id: int, next_bid: int} */
    private function bidResult(StorageLot $lot, int $accountId, int $amount): array
    {
        return [
            'lot_public_id' => (string) $lot->public_id,
            'amount' => $amount,
            'leader_account_id' => $accountId,
            'next_bid' => $this->nextBid($amount, $lot->opening_bid),
        ];
    }

    /** @return array<string, mixed> */
    private function serializeLot(StorageLot $lot): array
    {
        $leading = $this->leadingBid($lot);

        return [
            'lot_public_id' => (string) $lot->public_id,
            'source' => $lot->source,
            'former_owner_name' => $lot->former_owner_account_id !== null
                ? AccountHandle::query()->where('account_id', $lot->former_owner_account_id)->value('username')
                : null,
            'opening_bid' => $lot->opening_bid,
            'nights_listed' => $lot->nights_listed,
            'next_bid' => $this->nextBid($leading !== null ? (int) $leading->amount : null, $lot->opening_bid),
            'contents' => $this->contentsOf($lot->container_id),
        ];
    }

    /** @return list<array{code: string, name: string, rarity: int, model_glb: string|null, quantity: int}> */
    private function contentsOf(int $containerId): array
    {
        $counts = [];
        foreach (ItemInstance::query()->where('container_id', $containerId)->pluck('item_def_id') as $itemDefId) {
            $counts[(int) $itemDefId] = ($counts[(int) $itemDefId] ?? 0) + 1;
        }
        foreach (InventoryStack::query()->where('container_id', $containerId)->get(['item_def_id', 'quantity']) as $stack) {
            $counts[(int) $stack->item_def_id] = ($counts[(int) $stack->item_def_id] ?? 0) + (int) $stack->quantity;
        }

        return ItemDef::query()->whereIn('item_def_id', array_keys($counts))->orderBy('item_def_id')->get()
            ->map(fn (ItemDef $def): array => [
                'code' => (string) $def->code,
                'name' => (string) $def->name,
                'rarity' => (int) $def->rarity,
                'model_glb' => is_string($def->model_glb ?? null) ? $def->model_glb : null,
                'quantity' => $counts[(int) $def->item_def_id],
            ])
            ->values()
            ->all();
    }

    private function deliverContents(int $containerId, int $accountId): void
    {
        $inboxId = $this->inventory->getOrCreateGiftInboxContainerId($accountId);
        ItemInstance::query()->where('container_id', $containerId)
            ->update(['container_id' => $inboxId, 'owner_account_id' => $accountId, 'updated_at' => now()]);
        foreach (InventoryStack::query()->where('container_id', $containerId)->get() as $stack) {
            $this->inventory->grantItem($accountId, ItemDef::query()->findOrFail($stack->item_def_id), (int) $stack->quantity);
            $stack->delete();
        }
    }

    private function destroyContents(int $containerId): void
    {
        ItemInstance::query()->where('container_id', $containerId)->delete();
        InventoryStack::query()->where('container_id', $containerId)->delete();
    }

    private function newLotContainerId(): int
    {
        return (int) Container::query()->create(['type' => 'storage_lot', 'created_at' => now()])->container_id;
    }

    private function roundToFifty(float $value): int
    {
        return max(self::OPENING_BID_ROUNDING, (int) (round($value / self::OPENING_BID_ROUNDING) * self::OPENING_BID_ROUNDING));
    }

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

    /** @param array<string, mixed> $meta */
    private function transaction(int $accountId, string $type, array $meta): int
    {
        return (int) EconomyTransaction::query()->create([
            'server_id' => null,
            'type' => $type,
            'status' => 'committed',
            'created_by_account_id' => $accountId,
            'committed_at' => now(),
            'meta_json' => $meta,
        ])->tx_id;
    }

    private function entry(Wallet $wallet, int $txId, int $delta, string $reason): void
    {
        WalletLedgerEntry::query()->create([
            'wallet_id' => $wallet->wallet_id,
            'tx_id' => $txId,
            'delta' => $delta,
            'reason' => $reason,
        ]);
    }
}
