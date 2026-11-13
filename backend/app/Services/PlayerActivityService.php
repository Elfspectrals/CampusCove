<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Models\ShopCatalogItem;

final class PlayerActivityService
{
    public const DAY_TIMEZONE = 'Europe/Paris';

    public function __construct(private readonly ActionCounterService $counters) {}

    public function zoneVisited(int $accountId, string $zone): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::ZonesVisited, $zone);
    }

    /** @param list<int> $shopCatalogItemIds */
    public function basketPaid(int $accountId, string $shop, array $shopCatalogItemIds = []): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::ShopBaskets, $shop.':'.now(self::DAY_TIMEZONE)->format('Y-m-d H'));
        $clothes = ShopCatalogItem::query()
            ->whereIn('shop_catalog_item_id', $shopCatalogItemIds)
            ->with('itemDef')
            ->get()
            ->filter(fn (ShopCatalogItem $item): bool => $item->itemDef?->kind === 'cosmetic');
        foreach ($clothes as $item) {
            $this->counters->bumpOncePerKey($accountId, ActionCounter::ClothesBought, (string) $item->itemDef->code);
        }
    }

    public function activeDay(int $accountId): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::ActiveDays, now(self::DAY_TIMEZONE)->toDateString());
    }
}
