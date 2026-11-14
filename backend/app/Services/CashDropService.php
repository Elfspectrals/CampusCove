<?php

namespace App\Services;

use App\Exceptions\CashDropRejectedException;
use App\Models\Account;
use App\Models\CashDrop;
use App\Models\Container;
use App\Models\EconomyTransaction;
use App\Models\ItemInstance;
use App\Models\Wallet;
use App\Models\WalletLedgerEntry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

final class CashDropService
{
    public const LIFETIME_MINUTES = 5;

    public function __construct(private readonly AccountInventoryService $inventory) {}

    /** @return array{id: int, amount: int, tools: list<string>, gear: list<string>, expires_at: string}|null */
    public function dropAtDeath(int $accountId, ?int $killerAccountId): ?array
    {
        return DB::transaction(function () use ($accountId, $killerAccountId): ?array {
            $wallet = Wallet::lockForAccount($accountId, Wallet::CASH);
            $amount = $wallet->balance();
            $tools = $this->carriedTools($accountId);
            $tooYoung = $this->isTooYoungToDrop($accountId);
            $gear = $tooYoung ? [] : $this->carriedGear($accountId);
            if ($amount <= 0 && $tools === [] && $gear === []) {
                return null;
            }
            $toolIds = array_keys($tools);
            $gearIds = array_keys($gear);
            $txId = $this->transaction($accountId, 'cash_drop', ['amount' => $amount, 'tools' => $toolIds, 'gear' => $gearIds, 'killer_account_id' => $killerAccountId]);
            if ($amount > 0) {
                $this->entry($wallet, $txId, -$amount, 'cash_drop');
            }
            if ($tooYoung) {
                ItemInstance::query()->whereIn('item_instance_id', $toolIds)->delete();

                return null;
            }
            $containerId = null;
            if ($tools !== [] || $gear !== []) {
                $containerId = (int) Container::query()->create(['type' => 'death_drop'])->container_id;
                ItemInstance::query()->whereIn('item_instance_id', [...$toolIds, ...$gearIds])->update(['container_id' => $containerId]);
            }
            $drop = CashDrop::query()->create([
                'owner_account_id' => $accountId,
                'killer_account_id' => $killerAccountId === $accountId ? null : $killerAccountId,
                'amount' => $amount,
                'drop_tx_id' => $txId,
                'expires_at' => now()->addMinutes(self::LIFETIME_MINUTES),
                'container_id' => $containerId,
            ]);

            return ['id' => (int) $drop->id, 'amount' => $amount, 'tools' => array_values($tools), 'gear' => array_values($gear), 'expires_at' => $drop->expires_at->toIso8601String()];
        });
    }

    /** @return array{amount: int, tools: list<string>, gear: list<string>, cash: int} */
    public function pick(int $dropId, int $pickerAccountId): array
    {
        return DB::transaction(function () use ($dropId, $pickerAccountId): array {
            $drop = CashDrop::query()->whereKey($dropId)->lockForUpdate()->first();
            if ($drop === null || $drop->picked_at !== null || $drop->expires_at->isPast()) {
                throw new CashDropRejectedException('cash_drop_gone', 'This cash is gone.', 409);
            }
            if ($drop->killer_account_id === $pickerAccountId) {
                throw new CashDropRejectedException('cash_drop_killer', 'You cannot take the cash of the player you knocked out.', 403);
            }
            $wallet = Wallet::lockForAccount($pickerAccountId, Wallet::CASH);
            $txId = $this->transaction($pickerAccountId, 'cash_pickup', ['amount' => $drop->amount, 'cash_drop_id' => $drop->id]);
            if ($drop->amount > 0) {
                $this->entry($wallet, $txId, $drop->amount, 'cash_pickup');
            }
            $items = $drop->container_id === null ? [] : $this->giveDroppedItems((int) $drop->container_id, $pickerAccountId);
            $drop->update(['picked_by_account_id' => $pickerAccountId, 'pickup_tx_id' => $txId, 'picked_at' => now()]);
            $tools = [];
            $gear = [];
            foreach ($items as $item) {
                if ($item['kind'] === SportsGearService::KIND) {
                    $gear[] = $item['code'];
                } else {
                    $tools[] = $item['code'];
                }
            }

            return ['amount' => $drop->amount, 'tools' => $tools, 'gear' => $gear, 'cash' => $wallet->balance()];
        });
    }

    /** @return array<int, string> item_instance_id => item code */
    private function carriedTools(int $accountId): array
    {
        return $this->carried($accountId)->where('item_defs.weapon', true)->pluck('item_defs.code', 'item_instances.item_instance_id')->all();
    }

    /** @return array<int, string> item_instance_id => item code */
    private function carriedGear(int $accountId): array
    {
        return $this->carried($accountId)->where('item_defs.kind', SportsGearService::KIND)->pluck('item_defs.code', 'item_instances.item_instance_id')->all();
    }

    /** @return Builder<ItemInstance> */
    private function carried(int $accountId): Builder
    {
        return ItemInstance::query()
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->where('item_instances.container_id', $this->inventory->getOrCreateGiftInboxContainerId($accountId))
            ->where('item_instances.owner_account_id', $accountId)
            ->whereNull('item_instances.locked_tx_id')
            ->orderBy('item_instances.item_instance_id')
            ->lockForUpdate();
    }

    /** @return list<array{code: string, kind: string}> */
    private function giveDroppedItems(int $containerId, int $pickerAccountId): array
    {
        $items = ItemInstance::query()
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->where('item_instances.container_id', $containerId)
            ->orderBy('item_instances.item_instance_id')
            ->get(['item_defs.code', 'item_defs.kind'])
            ->map(fn (ItemInstance $row): array => ['code' => (string) $row->code, 'kind' => (string) $row->kind])
            ->all();
        ItemInstance::query()->where('container_id', $containerId)->update([
            'container_id' => $this->inventory->getOrCreateGiftInboxContainerId($pickerAccountId),
            'owner_account_id' => $pickerAccountId,
        ]);

        return $items;
    }

    private function isTooYoungToDrop(int $accountId): bool
    {
        return Account::query()->whereKey($accountId)
            ->where('created_at', '>', now()->subHours(TradeService::MIN_GIVER_AGE_HOURS))
            ->exists();
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
