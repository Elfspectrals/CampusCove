<?php

namespace App\Services;

use App\Exceptions\ZoneShopRejectedException;
use App\Models\EconomyTransaction;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\Wallet;
use App\Support\SaleCurve;
use Illuminate\Support\Facades\DB;

final class ZoneBuyerService
{
    private const SOURCE = 'zone_sell';

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly CoinRewardService $coinRewards,
        private readonly ZonePriceBook $book,
    ) {}

    /** @return array{sold: int, coins: int, balance_after: int, full_price_left: int} */
    public function sell(int $accountId, string $zone, string $area, string $code, int $quantity): array
    {
        $offer = $this->book->buyerOffer($zone, $area, $code);
        $def = ItemDef::query()->where('code', $code)->first();
        if ($def === null) {
            throw new ZoneShopRejectedException('unknown_item', 'This item does not exist.', 422);
        }

        return DB::transaction(function () use ($accountId, $zone, $area, $code, $quantity, $offer, $def): array {
            Wallet::lockForAccount($accountId, Wallet::CASH);
            $stack = $this->lockStack($accountId, $def);
            $whole = $stack !== null ? (int) $stack->quantity - ((int) $stack->portions_used > 0 ? 1 : 0) : 0;
            if ($whole < $quantity) {
                throw new ZoneShopRejectedException('not_enough_items', 'You do not have that many.', 422);
            }
            $payout = SaleCurve::payout($offer['price'], $offer['quota'], $offer['overPrice'], $this->soldInLastDay($accountId, $zone, $area, $code), $quantity);
            $this->inventory->revokeItem($accountId, $def, $quantity);
            $this->coinRewards->creditCash($accountId, self::SOURCE, $payout['coins'], ['quantity' => $quantity, 'zone' => $zone, 'area' => $area, 'code' => $code]);

            return [
                'sold' => $quantity,
                'coins' => $payout['coins'],
                'balance_after' => Wallet::lockForAccount($accountId, Wallet::CASH)->balance(),
                'full_price_left' => $payout['full_price_left'],
            ];
        });
    }

    private function soldInLastDay(int $accountId, string $zone, string $area, string $code): int
    {
        return (int) EconomyTransaction::query()
            ->where('type', 'reward')
            ->where('created_by_account_id', $accountId)
            ->where('meta_json->source', self::SOURCE)
            ->where('meta_json->zone', $zone)
            ->where('meta_json->area', $area)
            ->where('meta_json->code', $code)
            ->where('committed_at', '>=', now()->subDay())
            ->sum(DB::raw("(meta_json->>'quantity')::int"));
    }

    private function lockStack(int $accountId, ItemDef $def): ?InventoryStack
    {
        $containerId = $this->inventory->getOrCreateGiftInboxContainerId($accountId);

        return InventoryStack::query()
            ->where('container_id', $containerId)
            ->where('item_def_id', $def->item_def_id)
            ->lockForUpdate()
            ->first();
    }
}
