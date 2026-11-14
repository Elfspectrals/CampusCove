<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

final class SportsGearService
{
    public const KIND = 'sports_gear';

    public function __construct(private readonly AccountInventoryService $inventory) {}

    /** @return list<string> */
    public function owned(int $accountId): array
    {
        return DB::table('item_instances')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->where('item_instances.container_id', $this->inventory->getOrCreateGiftInboxContainerId($accountId))
            ->where('item_instances.owner_account_id', $accountId)
            ->where('item_defs.kind', self::KIND)
            ->distinct()
            ->orderBy('item_defs.code')
            ->pluck('item_defs.code')
            ->all();
    }
}
