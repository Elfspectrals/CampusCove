<?php

namespace App\Services;

use App\Exceptions\OrchardRejectedException;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\Wallet;
use Illuminate\Support\Facades\DB;

final class OrchardService
{
    public const APPLE_CODE = 'farm_apple';

    public const APPLE_PRICE = 3;

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly CoinRewardService $coinRewards,
    ) {}

    /** @return array{code: string, quantity: int} */
    public function pick(int $accountId): array
    {
        $apple = $this->apple();

        return DB::transaction(function () use ($accountId, $apple): array {
            $carried = (int) ($this->lockStack($accountId, $apple)?->quantity ?? 0);
            if ($carried >= $apple->max_stack) {
                throw new OrchardRejectedException('basket_full', "You cannot carry more than {$apple->max_stack} apples.");
            }
            $this->inventory->grantItem($accountId, $apple, 1);

            return ['code' => (string) $apple->code, 'quantity' => $carried + 1];
        });
    }

    /** @return array{sold: int, coins: int, balance_after: int} */
    public function sell(int $accountId, int $quantity): array
    {
        $apple = $this->apple();

        return DB::transaction(function () use ($accountId, $apple, $quantity): array {
            $stack = $this->lockStack($accountId, $apple);
            $whole = $stack !== null ? (int) $stack->quantity - ((int) $stack->portions_used > 0 ? 1 : 0) : 0;
            if ($whole < $quantity) {
                throw new OrchardRejectedException('not_enough_apples', 'You do not have that many whole apples.');
            }
            $coins = $quantity * self::APPLE_PRICE;
            $this->inventory->revokeItem($accountId, $apple, $quantity);
            $this->coinRewards->credit($accountId, 'orchard_sell', $coins, ['quantity' => $quantity]);

            return [
                'sold' => $quantity,
                'coins' => $coins,
                'balance_after' => Wallet::lockForAccount($accountId, 'coins')->balance(),
            ];
        });
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
