<?php

namespace App\Services;

use App\Exceptions\JobToolRejectedException;
use App\Models\ItemInstance;
use Illuminate\Support\Facades\DB;

final class JobToolService
{
    public function __construct(private readonly AccountInventoryService $inventory) {}

    /** @return array{code: string, uses_left: int} */
    public function hold(int $accountId, string $code): array
    {
        $tool = $this->carriedTool($accountId, $code, false);

        return ['code' => $code, 'uses_left' => (int) $tool->uses_left];
    }

    /** @return array{code: string, uses_left: int} uses_left 0 means the tool broke and is gone */
    public function wear(int $accountId, string $code): array
    {
        return DB::transaction(function () use ($accountId, $code): array {
            $tool = $this->carriedTool($accountId, $code, true);
            $usesLeft = (int) $tool->uses_left - 1;
            if ($usesLeft === 0) {
                $tool->delete();
            } else {
                $tool->update(['uses_left' => $usesLeft]);
            }

            return ['code' => $code, 'uses_left' => $usesLeft];
        });
    }

    private function carriedTool(int $accountId, string $code, bool $lock): ItemInstance
    {
        $query = ItemInstance::query()
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->where('item_instances.container_id', $this->inventory->getOrCreateGiftInboxContainerId($accountId))
            ->where('item_instances.owner_account_id', $accountId)
            ->whereNull('item_instances.locked_tx_id')
            ->where('item_defs.code', $code)
            ->where('item_defs.weapon', true)
            ->orderBy('item_instances.uses_left')
            ->orderBy('item_instances.item_instance_id')
            ->select('item_instances.*');
        $tool = ($lock ? $query->lockForUpdate() : $query)->first();
        if ($tool === null) {
            throw new JobToolRejectedException('tool_not_carried', 'You are not carrying that tool.');
        }

        return $tool;
    }
}
