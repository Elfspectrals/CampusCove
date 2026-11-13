<?php

namespace App\Services;

use App\Exceptions\MarketRejectedException;
use App\Models\Account;
use App\Models\EconomyTransaction;
use App\Models\ItemDef;
use App\Models\MarketLot;
use App\Models\MarketSale;
use App\Models\MarketStall;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use App\Support\AssetUrl;
use App\Support\MarketSchedule;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

final class MarketService
{
    public const STALL_COUNT = 6;

    public const LOTS_PER_STALL = 6;

    public const STALL_FEE = 15;

    public const TAX_PERCENT = 5;

    public const TAX_MIN_TOTAL = 20;

    public const MAX_UNIT_PRICE = 1_000_000;

    public const MAX_QUANTITY = 999;

    public const CANOPIES = ['red', 'blue', 'green', 'yellow', 'orange', 'purple'];

    public const CONTAINERS = ['crate', 'basket', 'flat'];

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly TradeService $trades,
    ) {
    }

    public static function tax(int $total): int
    {
        return $total >= self::TAX_MIN_TOTAL ? intdiv($total * self::TAX_PERCENT, 100) : 0;
    }

    /** @return array{open: bool, market_date: string, opens_at: string, closes_at: string, stall_fee: int, stalls: list<array<string, mixed>>} */
    public function current(): array
    {
        $window = MarketSchedule::window(now());
        $stalls = $window['open']
            ? MarketStall::query()
                ->where('market_date', $window['market_date'])
                ->with(['lots' => fn ($query) => $query->where('status', MarketLot::ACTIVE)->orderBy('slot'), 'lots.itemDef'])
                ->orderBy('stall_no')
                ->get()
                ->map(fn (MarketStall $stall): array => $this->stallView($stall))
                ->all()
            : [];

        return [
            'open' => $window['open'],
            'market_date' => $window['market_date'],
            'opens_at' => $window['opens_at']->toIso8601String(),
            'closes_at' => $window['closes_at']->toIso8601String(),
            'stall_fee' => self::STALL_FEE,
            'stalls' => $stalls,
        ];
    }

    /** @return array<string, mixed> */
    public function claimStall(int $accountId, int $stallNo, string $canopy): array
    {
        $marketDate = $this->openMarketDate();
        if (! in_array($canopy, self::CANOPIES, true)) {
            throw new MarketRejectedException('market_canopy_unknown', 'Unknown canopy colour.');
        }
        $this->assertOldEnough($accountId);

        return DB::transaction(function () use ($accountId, $stallNo, $canopy, $marketDate): array {
            $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
            $mine = MarketStall::query()->where('market_date', $marketDate)->where('account_id', $accountId)->first();
            if ($mine !== null) {
                if ($mine->stall_no !== $stallNo) {
                    throw new MarketRejectedException('market_already_has_stall', 'You already hold another stall at this market.', 409);
                }

                return $this->stallView($mine->load('lots.itemDef'));
            }
            if (MarketStall::query()->where('market_date', $marketDate)->where('stall_no', $stallNo)->exists()) {
                throw $this->stallTaken();
            }
            if ($wallet->balance() < self::STALL_FEE) {
                throw new MarketRejectedException('market_insufficient_cash', 'A stall costs '.self::STALL_FEE.' coins in cash.', 409);
            }
            $txId = $this->transaction($accountId, 'market_stall_fee', ['market_date' => $marketDate, 'stall_no' => $stallNo]);
            $this->ledger($wallet, $txId, -self::STALL_FEE, 'market_stall_fee');
            try {
                $stall = MarketStall::query()->create([
                    'market_date' => $marketDate,
                    'stall_no' => $stallNo,
                    'account_id' => $accountId,
                    'canopy' => $canopy,
                    'fee_tx_id' => $txId,
                ]);
            } catch (UniqueConstraintViolationException) {
                throw $this->stallTaken();
            }

            return $this->stallView($stall->load('lots.itemDef'));
        });
    }

    /** @return array<string, mixed> */
    public function listLot(int $accountId, int $slot, string $code, int $quantity, int $unitPrice, string $container): array
    {
        $marketDate = $this->openMarketDate();
        if (! in_array($container, self::CONTAINERS, true)) {
            throw new MarketRejectedException('market_container_unknown', 'Unknown container.');
        }

        return DB::transaction(function () use ($accountId, $slot, $code, $quantity, $unitPrice, $container, $marketDate): array {
            $stall = MarketStall::query()->where('market_date', $marketDate)->where('account_id', $accountId)->lockForUpdate()->first();
            if ($stall === null) {
                throw new MarketRejectedException('market_no_stall', 'Take a free stall first.', 409);
            }
            $def = ItemDef::query()->where('code', $code)->first();
            if ($def === null) {
                throw new MarketRejectedException('market_item_unknown', 'Unknown item.');
            }
            if (! TradeService::isTradable($def)) {
                throw new MarketRejectedException('market_item_not_tradable', "{$def->name} cannot be sold.");
            }
            if ($quantity > min((int) $def->max_stack, self::MAX_QUANTITY)) {
                throw new MarketRejectedException('market_quantity_too_big', "A lot holds at most {$def->max_stack} {$def->name}.");
            }
            $this->inventory->getOrCreateGiftInboxContainerId($accountId);
            if (in_array((int) $def->item_def_id, $this->trades->wornItemDefIds($accountId), true)) {
                throw new MarketRejectedException('market_item_worn', "{$def->name} is being worn: take it off first.", 409);
            }
            if ($this->trades->ownedQuantity($accountId, $def) < $quantity) {
                throw new MarketRejectedException('market_item_missing', "You do not have that many {$def->name}.", 409);
            }
            if ($stall->lots()->where('slot', $slot)->where('status', MarketLot::ACTIVE)->exists()) {
                throw new MarketRejectedException('market_slot_taken', 'This spot on your stall is already used.', 409);
            }
            $this->inventory->revokeItem($accountId, $def, $quantity);
            $lot = $stall->lots()->create([
                'slot' => $slot,
                'item_def_id' => $def->item_def_id,
                'quantity_listed' => $quantity,
                'quantity_left' => $quantity,
                'unit_price' => $unitPrice,
                'container' => $container,
                'status' => MarketLot::ACTIVE,
            ]);

            return $this->lotView($lot->setRelation('itemDef', $def));
        });
    }

    /** @return array{returned: int} */
    public function withdrawLot(int $accountId, int $lotId): array
    {
        return DB::transaction(function () use ($accountId, $lotId): array {
            $lot = $this->lockActiveLot($lotId);
            if ($lot->stall->account_id !== $accountId) {
                throw new MarketRejectedException('market_not_your_lot', 'This lot is not yours.', 403);
            }
            $returned = $lot->quantity_left;
            $this->giveBack($lot, MarketLot::WITHDRAWN);

            return ['returned' => $returned];
        });
    }

    /** @return array{cash: int, quantity_left: int} */
    public function buy(int $buyerId, int $lotId, int $quantity, string $purchaseRef): array
    {
        $marketDate = $this->openMarketDate();
        $this->assertOldEnough($buyerId);

        return DB::transaction(function () use ($buyerId, $lotId, $quantity, $purchaseRef, $marketDate): array {
            $buyerWallet = Wallet::lockForAccount($buyerId, Wallet::CASH);
            $done = MarketSale::query()->where('purchase_ref', $purchaseRef)->first();
            if ($done !== null) {
                if ($done->buyer_account_id !== $buyerId || $done->lot_id !== $lotId) {
                    throw $this->alreadyBought();
                }

                return ['cash' => $buyerWallet->balance(), 'quantity_left' => (int) MarketLot::query()->whereKey($lotId)->value('quantity_left')];
            }

            $lot = $this->lockActiveLot($lotId);
            if ($lot->stall->market_date !== $marketDate) {
                throw $this->lotGone();
            }
            $sellerId = $lot->stall->account_id;
            if ($sellerId === $buyerId) {
                throw new MarketRejectedException('market_own_lot', 'This is your own stall.', 409);
            }
            $def = $lot->itemDef;
            if ($quantity > $lot->quantity_left) {
                throw new MarketRejectedException('market_item_missing', "Only {$lot->quantity_left} {$def->name} left.", 409);
            }
            $sellerWallet = Wallet::lockForAccount($sellerId, Wallet::CASH);
            $total = $quantity * $lot->unit_price;
            if ($buyerWallet->balance() < $total) {
                throw new MarketRejectedException('market_insufficient_cash', 'You do not have enough cash on you.', 409);
            }
            $this->inventory->getOrCreateGiftInboxContainerId($buyerId);
            if ($this->trades->ownedQuantity($buyerId, $def) + $quantity > $def->max_stack) {
                throw new MarketRejectedException('market_inventory_full', $def->max_stack === 1
                    ? "You already own {$def->name}."
                    : "You cannot carry that many {$def->name}.", 409);
            }

            $tax = self::tax($total);
            $txId = $this->transaction($buyerId, 'market_sale', [
                'lot_id' => $lot->id,
                'seller_account_id' => $sellerId,
                'code' => $def->code,
                'quantity' => $quantity,
                'unit_price' => $lot->unit_price,
                'tax' => $tax,
                'purchase_ref' => $purchaseRef,
            ]);
            try {
                MarketSale::query()->create([
                    'lot_id' => $lot->id,
                    'buyer_account_id' => $buyerId,
                    'quantity' => $quantity,
                    'unit_price' => $lot->unit_price,
                    'total' => $total,
                    'tax' => $tax,
                    'purchase_ref' => $purchaseRef,
                    'tx_id' => $txId,
                ]);
            } catch (UniqueConstraintViolationException) {
                throw $this->alreadyBought();
            }
            $this->ledger($buyerWallet, $txId, -$total, 'market_purchase');
            $this->ledger($sellerWallet, $txId, $total, 'market_sale');
            if ($tax > 0) {
                $this->ledger($sellerWallet, $txId, -$tax, 'market_tax');
            }
            $this->inventory->grantItem($buyerId, $def, $quantity);
            $left = $lot->quantity_left - $quantity;
            $lot->update($left === 0
                ? ['quantity_left' => 0, 'status' => MarketLot::SOLD_OUT, 'closed_at' => now()]
                : ['quantity_left' => $left]);

            return ['cash' => $buyerWallet->balance(), 'quantity_left' => $left];
        });
    }

    /** @return array{open: bool, market_date: string, opens_at: string, closes_at: string, stall_fee: int, stalls: list<array<string, mixed>>} */
    public function openNow(int $minutes): array
    {
        MarketSchedule::openNow(now(), $minutes);

        return $this->current();
    }

    /** @return array{returned: int, market: array{open: bool, market_date: string, opens_at: string, closes_at: string, stall_fee: int, stalls: list<array<string, mixed>>}} */
    public function closeNow(): array
    {
        MarketSchedule::closeNow(now());

        return ['returned' => $this->closePastMarkets(), 'market' => $this->current()];
    }

    public function closePastMarkets(): int
    {
        $openDate = MarketSchedule::openMarketDate(now());
        $lotIds = MarketLot::query()
            ->where('status', MarketLot::ACTIVE)
            ->whereHas('stall', fn ($query) => $openDate === null ? $query : $query->where('market_date', '!=', $openDate))
            ->pluck('id');

        $returned = 0;
        foreach ($lotIds as $lotId) {
            $returned += DB::transaction(function () use ($lotId): int {
                $lot = MarketLot::query()->whereKey($lotId)->lockForUpdate()->first();
                if ($lot === null || $lot->status !== MarketLot::ACTIVE) {
                    return 0;
                }
                $this->giveBack($lot, MarketLot::RETURNED);

                return 1;
            });
        }

        return $returned;
    }

    private function openMarketDate(): string
    {
        return MarketSchedule::openMarketDate(now())
            ?? throw new MarketRejectedException('market_closed', 'The market is open on Saturday from '.MarketSchedule::OPENS_AT.' to '.MarketSchedule::CLOSES_AT.'.', 409);
    }

    private function assertOldEnough(int $accountId): void
    {
        $tooNew = Account::query()->whereKey($accountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
        if ($tooNew) {
            throw new MarketRejectedException(
                'market_account_too_new',
                'Accounts can sell and buy at the market '.TradeService::MIN_GIVER_AGE_HOURS.' hours after sign-up.',
                403,
            );
        }
    }

    private function lockActiveLot(int $lotId): MarketLot
    {
        $lot = MarketLot::query()->whereKey($lotId)->lockForUpdate()->first();
        if ($lot === null || $lot->status !== MarketLot::ACTIVE) {
            throw $this->lotGone();
        }

        return $lot;
    }

    private function giveBack(MarketLot $lot, string $status): void
    {
        $this->inventory->grantItem($lot->stall->account_id, $lot->itemDef, $lot->quantity_left);
        $lot->update(['status' => $status, 'closed_at' => now()]);
    }

    /** @return array<string, mixed> */
    private function stallView(MarketStall $stall): array
    {
        return [
            'stall_no' => $stall->stall_no,
            'account_id' => $stall->account_id,
            'canopy' => $stall->canopy,
            'lots' => $stall->lots
                ->where('status', MarketLot::ACTIVE)
                ->sortBy('slot')
                ->map(fn (MarketLot $lot): array => $this->lotView($lot))
                ->values()
                ->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function lotView(MarketLot $lot): array
    {
        return [
            'lot_id' => $lot->id,
            'slot' => $lot->slot,
            'code' => $lot->itemDef->code,
            'name' => $lot->itemDef->name,
            'quantity' => $lot->quantity_left,
            'unit_price' => $lot->unit_price,
            'container' => $lot->container,
            'preview_image' => AssetUrl::normalize($lot->itemDef->preview_image),
            'model_glb' => AssetUrl::normalize($lot->itemDef->model_glb),
        ];
    }

    private function stallTaken(): MarketRejectedException
    {
        return new MarketRejectedException('market_stall_taken', 'Another player already holds this stall.', 409);
    }

    private function lotGone(): MarketRejectedException
    {
        return new MarketRejectedException('market_lot_gone', 'This lot is no longer for sale.', 409);
    }

    private function alreadyBought(): MarketRejectedException
    {
        return new MarketRejectedException('market_already_bought', 'This purchase was already made.', 409);
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

    private function ledger(Wallet $wallet, int $txId, int $delta, string $reason): void
    {
        WalletLedgerEntry::query()->create([
            'wallet_id' => $wallet->wallet_id,
            'tx_id' => $txId,
            'delta' => $delta,
            'reason' => $reason,
        ]);
    }
}
