<?php

namespace App\Services;

use App\Exceptions\FarmRejectedException;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\Wallet;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

final class FarmService
{
    public const CROPS = [
        'corn' => 'farm_corn',
        'potato' => 'farm_potato',
        'cabbage' => 'farm_cabbage',
        'pumpkin' => 'farm_pumpkin',
    ];

    public const MIN_PICK_INTERVAL_MS = 2500;

    public function __construct(private readonly AccountInventoryService $inventory) {}

    /** @return array{code: string, quantity: int} */
    public function pick(int $accountId, string $crop): array
    {
        $item = ItemDef::query()->where('code', self::CROPS[$crop])->firstOrFail();

        return DB::transaction(function () use ($accountId, $item): array {
            Wallet::lockForAccount($accountId, 'coins');
            $lastPickKey = "farm_last_pick:{$accountId}";
            $nowMs = now()->getTimestampMs();
            $lastPickMs = Cache::get($lastPickKey);
            if ($lastPickMs !== null && $nowMs - $lastPickMs < self::MIN_PICK_INTERVAL_MS) {
                throw new FarmRejectedException('pick_too_fast', 'Wait a moment before picking again.');
            }
            $containerId = $this->inventory->getOrCreateGiftInboxContainerId($accountId);
            $carried = (int) (InventoryStack::query()
                ->where('container_id', $containerId)
                ->where('item_def_id', $item->item_def_id)
                ->lockForUpdate()
                ->value('quantity') ?? 0);
            if ($carried >= $item->max_stack) {
                throw new FarmRejectedException('basket_full', "You cannot carry more than {$item->max_stack} of those.");
            }
            $this->inventory->grantItem($accountId, $item, 1);
            Cache::put($lastPickKey, $nowMs, now()->addMinute());

            return ['code' => (string) $item->code, 'quantity' => $carried + 1];
        });
    }
}
