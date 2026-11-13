<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Exceptions\OrchardRejectedException;
use App\Models\EconomyTransaction;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\Wallet;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class OrchardService
{
    public const APPLE_CODE = 'farm_apple';

    public const APPLE_PRICE = 3;

    public const APPLE_PRICE_OVER_DAILY_QUOTA = 1;

    public const DAILY_FULL_PRICE_APPLES = 300;

    public const MIN_PICK_INTERVAL_MS = 2500;

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly CoinRewardService $coinRewards,
        private readonly ActionCounterService $counters,
    ) {}

    /** @return array{code: string, quantity: int} */
    public function pick(int $accountId): array
    {
        $apple = $this->apple();

        return DB::transaction(function () use ($accountId, $apple): array {
            Wallet::lockForAccount($accountId, Wallet::CASH);
            $lastPickKey = "orchard_last_pick:{$accountId}";
            $nowMs = now()->getTimestampMs();
            $lastPickMs = Cache::get($lastPickKey);
            if ($lastPickMs !== null && $nowMs - $lastPickMs < self::MIN_PICK_INTERVAL_MS) {
                throw new OrchardRejectedException('pick_too_fast', 'Wait a moment before picking another apple.');
            }
            $carried = (int) ($this->lockStack($accountId, $apple)?->quantity ?? 0);
            if ($carried >= $apple->max_stack) {
                throw new OrchardRejectedException('basket_full', "You cannot carry more than {$apple->max_stack} apples.");
            }
            $this->inventory->grantItem($accountId, $apple, 1);
            $this->counters->bump($accountId, ActionCounter::ApplesPicked);
            Cache::put($lastPickKey, $nowMs, now()->addMinute());

            return ['code' => (string) $apple->code, 'quantity' => $carried + 1];
        });
    }

    /** @return array{sold: int, coins: int, balance_after: int, full_price_left: int} */
    public function sell(int $accountId, int $quantity): array
    {
        $apple = $this->apple();

        return DB::transaction(function () use ($accountId, $apple, $quantity): array {
            Wallet::lockForAccount($accountId, Wallet::CASH);
            $stack = $this->lockStack($accountId, $apple);
            $whole = $stack !== null ? (int) $stack->quantity - ((int) $stack->portions_used > 0 ? 1 : 0) : 0;
            if ($whole < $quantity) {
                throw new OrchardRejectedException('not_enough_apples', 'You do not have that many whole apples.');
            }
            $fullPriceLeft = max(0, self::DAILY_FULL_PRICE_APPLES - $this->applesSoldInLastDay($accountId));
            $atFullPrice = min($quantity, $fullPriceLeft);
            $coins = $atFullPrice * self::APPLE_PRICE + ($quantity - $atFullPrice) * self::APPLE_PRICE_OVER_DAILY_QUOTA;
            $this->inventory->revokeItem($accountId, $apple, $quantity);
            $this->coinRewards->creditCash($accountId, 'orchard_sell', $coins, ['quantity' => $quantity]);

            return [
                'sold' => $quantity,
                'coins' => $coins,
                'balance_after' => Wallet::lockForAccount($accountId, Wallet::CASH)->balance(),
                'full_price_left' => $fullPriceLeft - $atFullPrice,
            ];
        });
    }

    private function applesSoldInLastDay(int $accountId): int
    {
        return (int) EconomyTransaction::query()
            ->where('type', 'reward')
            ->where('created_by_account_id', $accountId)
            ->where('meta_json->source', 'orchard_sell')
            ->where('committed_at', '>=', now()->subDay())
            ->sum(DB::raw("(meta_json->>'quantity')::int"));
    }

    private function apple(): ItemDef
    {
        return ItemDef::query()->where('code', self::APPLE_CODE)->firstOrFail();
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
