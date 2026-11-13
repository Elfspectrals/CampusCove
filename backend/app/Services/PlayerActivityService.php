<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Models\ShopCatalogItem;
use Illuminate\Support\Facades\DB;

final class PlayerActivityService
{
    public const DAY_TIMEZONE = 'Europe/Paris';

    public const PUB_GAMES_PER_DAY = 5;

    public const PUB_GAMES_MAX_INTOXICATION = 50;

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

    public function pubOrder(int $accountId): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::PubOrderDays, $this->today());
    }

    public function pubGamePlayed(int $accountId, int $intoxicationBefore): void
    {
        if ($intoxicationBefore > self::PUB_GAMES_MAX_INTOXICATION) {
            return;
        }
        $today = $this->today();
        $countedToday = DB::table('account_counter_keys')
            ->where('account_id', $accountId)
            ->where('counter', ActionCounter::PubGames->value)
            ->where('key', 'like', $today.':%')
            ->count();
        if ($countedToday < self::PUB_GAMES_PER_DAY) {
            $this->counters->bumpOncePerKey($accountId, ActionCounter::PubGames, $today.':'.($countedToday + 1));
        }
    }

    public function secretRoomEntered(int $accountId): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::SecretRoomWeeks, now(self::DAY_TIMEZONE)->format('o-\\WW'));
    }

    public function activeDay(int $accountId): void
    {
        $this->counters->bumpOncePerKey($accountId, ActionCounter::ActiveDays, $this->today());
    }

    private function today(): string
    {
        return now(self::DAY_TIMEZONE)->toDateString();
    }
}
