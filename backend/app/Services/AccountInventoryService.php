<?php

namespace App\Services;

use App\Exceptions\ShopPurchaseRejectedException;
use App\Models\Container;
use App\Models\GiftInbox;
use App\Models\InventoryStack;
use App\Models\ItemDef;
use App\Models\ItemInstance;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class AccountInventoryService
{
    public function grantItem(int $accountId, ItemDef $itemDef, int $quantity): void
    {
        if ($itemDef->kind === 'cosmetic') {
            $this->grantLockerCosmetic($accountId, (int) $itemDef->item_def_id, $quantity);

            return;
        }

        DB::transaction(function () use ($accountId, $itemDef, $quantity): void {
            $containerId = $this->getOrCreateGiftInboxContainerId($accountId);
            if ($itemDef->max_stack > 1) {
                $stack = InventoryStack::query()
                    ->where('container_id', $containerId)
                    ->where('item_def_id', $itemDef->item_def_id)
                    ->lockForUpdate()
                    ->first();

                $nextQty = ($stack !== null ? (int) $stack->quantity : 0) + $quantity;
                if ($stack !== null) {
                    $stack->update(['quantity' => $nextQty]);
                } else {
                    InventoryStack::query()->create([
                        'item_def_id' => $itemDef->item_def_id,
                        'container_id' => $containerId,
                        'quantity' => $quantity,
                    ]);
                }

                return;
            }

            $this->addInstances($containerId, $accountId, $itemDef, $quantity);
        });
    }

    public function revokeItem(int $accountId, ItemDef $itemDef, int $quantity): void
    {
        if ($itemDef->kind === 'cosmetic') {
            DB::transaction(function () use ($accountId, $itemDef, $quantity): void {
                $current = (int) (DB::table('account_locker_cosmetics')
                    ->where('account_id', $accountId)
                    ->where('item_def_id', $itemDef->item_def_id)
                    ->value('quantity') ?? 0);
                $next = max(0, $current - $quantity);

                if ($next > 0) {
                    DB::table('account_locker_cosmetics')
                        ->where('account_id', $accountId)
                        ->where('item_def_id', $itemDef->item_def_id)
                        ->update(['quantity' => $next, 'updated_at' => now()]);
                } else {
                    DB::table('account_locker_cosmetics')
                        ->where('account_id', $accountId)
                        ->where('item_def_id', $itemDef->item_def_id)
                        ->delete();
                    DB::table('account_cosmetic_equipment')
                        ->where('account_id', $accountId)
                        ->where('item_def_id', $itemDef->item_def_id)
                        ->delete();
                }
            });

            return;
        }

        DB::transaction(function () use ($accountId, $itemDef, $quantity): void {
            $gift = GiftInbox::query()->where('account_id', $accountId)->first();
            if ($gift === null) {
                return;
            }
            $containerId = (int) $gift->container_id;
            $remaining = $quantity;

            // Remove from stack first, then instances. This handles legacy/mixed data safely.
            $stack = InventoryStack::query()
                ->where('container_id', $containerId)
                ->where('item_def_id', $itemDef->item_def_id)
                ->lockForUpdate()
                ->first();
            if ($stack !== null && $remaining > 0) {
                $stackQty = (int) $stack->quantity;
                $consume = min($stackQty, $remaining);
                $nextQty = $stackQty - $consume;
                if ($nextQty > 0) {
                    $stack->update(['quantity' => $nextQty]);
                } else {
                    $stack->delete();
                }
                $remaining -= $consume;
            }

            if ($remaining > 0) {
                $instanceIds = ItemInstance::query()
                    ->where('container_id', $containerId)
                    ->where('item_def_id', $itemDef->item_def_id)
                    ->orderBy('item_instance_id')
                    ->limit($remaining)
                    ->pluck('item_instance_id')
                    ->all();

                if ($instanceIds !== []) {
                    ItemInstance::query()
                        ->whereIn('item_instance_id', $instanceIds)
                        ->delete();
                }
            }
        });
    }

    public function setItemQuantity(int $accountId, ItemDef $itemDef, int $quantity): void
    {
        if ($itemDef->kind === 'cosmetic') {
            DB::transaction(function () use ($accountId, $itemDef, $quantity): void {
                if ($quantity <= 0) {
                    DB::table('account_locker_cosmetics')
                        ->where('account_id', $accountId)
                        ->where('item_def_id', $itemDef->item_def_id)
                        ->delete();
                    DB::table('account_cosmetic_equipment')
                        ->where('account_id', $accountId)
                        ->where('item_def_id', $itemDef->item_def_id)
                        ->delete();

                    return;
                }

                DB::table('account_locker_cosmetics')->updateOrInsert(
                    ['account_id' => $accountId, 'item_def_id' => $itemDef->item_def_id],
                    ['quantity' => $quantity, 'updated_at' => now()]
                );
            });

            return;
        }

        DB::transaction(function () use ($accountId, $itemDef, $quantity): void {
            $containerId = $this->getOrCreateGiftInboxContainerId($accountId);
            if ($itemDef->max_stack > 1) {
                $stack = InventoryStack::query()
                    ->where('container_id', $containerId)
                    ->where('item_def_id', $itemDef->item_def_id)
                    ->lockForUpdate()
                    ->first();

                if ($quantity <= 0) {
                    $stack?->delete();

                    return;
                }

                if ($stack !== null) {
                    $stack->update(['quantity' => $quantity]);
                } else {
                    InventoryStack::query()->create([
                        'item_def_id' => $itemDef->item_def_id,
                        'container_id' => $containerId,
                        'quantity' => $quantity,
                    ]);
                }

                return;
            }

            $existing = (int) ItemInstance::query()
                ->where('container_id', $containerId)
                ->where('item_def_id', $itemDef->item_def_id)
                ->count();

            if ($existing > $quantity) {
                $instanceIds = ItemInstance::query()
                    ->where('container_id', $containerId)
                    ->where('item_def_id', $itemDef->item_def_id)
                    ->orderByDesc('item_instance_id')
                    ->limit($existing - $quantity)
                    ->pluck('item_instance_id')
                    ->all();

                if ($instanceIds !== []) {
                    ItemInstance::query()
                        ->whereIn('item_instance_id', $instanceIds)
                        ->delete();
                }

                return;
            }
            if ($existing < $quantity) {
                $this->addInstances($containerId, $accountId, $itemDef, $quantity - $existing);
            }
        });
    }

    public function resetInventory(int $accountId): void
    {
        DB::transaction(function () use ($accountId): void {
            $gift = GiftInbox::query()->where('account_id', $accountId)->first();
            if ($gift === null) {
                return;
            }
            $containerId = (int) $gift->container_id;

            InventoryStack::query()->where('container_id', $containerId)->delete();
            ItemInstance::query()->where('container_id', $containerId)->delete();
            DB::table('account_locker_cosmetics')->where('account_id', $accountId)->delete();
            DB::table('account_cosmetic_equipment')->where('account_id', $accountId)->delete();
        });
    }

    public function accountHasPositiveQuantity(int $accountId, int $itemDefId): bool
    {
        $kind = DB::table('item_defs')->where('item_def_id', $itemDefId)->value('kind');
        if ($kind === 'cosmetic') {
            $qty = (int) (DB::table('account_locker_cosmetics')
                ->where('account_id', $accountId)
                ->where('item_def_id', $itemDefId)
                ->value('quantity') ?? 0);

            return $qty > 0;
        }

        $gift = GiftInbox::query()->where('account_id', $accountId)->first();
        if ($gift === null) {
            return false;
        }
        $containerId = (int) $gift->container_id;

        $stackQty = (int) (DB::table('inventory_stacks')
            ->where('container_id', $containerId)
            ->where('item_def_id', $itemDefId)
            ->value('quantity') ?? 0);
        if ($stackQty > 0) {
            return true;
        }

        $instanceCount = (int) DB::table('item_instances')
            ->where('container_id', $containerId)
            ->where('item_def_id', $itemDefId)
            ->whereNotNull('owner_account_id')
            ->count();

        return $instanceCount > 0;
    }

    public function grantPurchasedItems(int $accountId, ItemDef $itemDef, int $quantity): void
    {
        if ($itemDef->kind === 'cosmetic') {
            $this->grantLockerCosmetic($accountId, (int) $itemDef->item_def_id, $quantity);

            return;
        }

        $containerId = $this->getOrCreateGiftInboxContainerId($accountId);
        if ($itemDef->max_stack > 1) {
            $this->addStackable($containerId, $itemDef, $quantity);

            return;
        }

        $this->addInstances($containerId, $accountId, $itemDef, $quantity);
    }

    /**
     * @return Collection<int, object{
     *   item_def_id: int,
     *   code: string,
     *   name: string,
     *   kind: string,
     *   rarity: int,
     *   tradable: bool,
     *   premium_only: bool,
     *   bind: string,
     *   max_stack: int,
     *   cosmetic_slot: string|null,
     *   preview_image: string|null,
     *   model_glb: string|null,
     *   quantity: int
     * }>
     */
    public function aggregatedItemsForAccount(int $accountId, ?string $kind, ?string $q): Collection
    {
        /** @var Collection<int, object> $merged */
        $merged = collect();

        $gift = GiftInbox::query()->where('account_id', $accountId)->first();
        if ($gift !== null) {
            $containerId = (int) $gift->container_id;

            $stackRows = DB::table('inventory_stacks as s')
                ->join('item_defs as d', 'd.item_def_id', '=', 's.item_def_id')
                ->where('s.container_id', $containerId)
                ->where('d.kind', '!=', 'cosmetic')
                ->selectRaw('d.item_def_id, d.code, d.name, d.kind, d.rarity, d.tradable, d.premium_only, d.bind, d.max_stack, d.cosmetic_slot, d.preview_image, d.model_glb, s.quantity::int as quantity');

            $instanceRows = DB::table('item_instances as i')
                ->join('item_defs as d', 'd.item_def_id', '=', 'i.item_def_id')
                ->where('i.container_id', $containerId)
                ->whereNotNull('i.owner_account_id')
                ->where('d.kind', '!=', 'cosmetic')
                ->groupBy([
                    'd.item_def_id',
                    'd.code',
                    'd.name',
                    'd.kind',
                    'd.rarity',
                    'd.tradable',
                    'd.premium_only',
                    'd.bind',
                    'd.max_stack',
                    'd.cosmetic_slot',
                    'd.preview_image',
                    'd.model_glb',
                ])
                ->selectRaw('d.item_def_id, d.code, d.name, d.kind, d.rarity, d.tradable, d.premium_only, d.bind, d.max_stack, d.cosmetic_slot, d.preview_image, d.model_glb, COUNT(*)::int as quantity');

            if ($kind !== null && $kind !== '') {
                $stackRows->where('d.kind', $kind);
                $instanceRows->where('d.kind', $kind);
            }

            if ($q !== null && $q !== '') {
                $term = '%'.$this->escapeLike($q).'%';
                $stackRows->where(function ($query) use ($term): void {
                    $query->where('d.name', 'ilike', $term)->orWhere('d.code', 'ilike', $term);
                });
                $instanceRows->where(function ($query) use ($term): void {
                    $query->where('d.name', 'ilike', $term)->orWhere('d.code', 'ilike', $term);
                });
            }

            foreach ($stackRows->get() as $row) {
                $merged->push($this->normalizeInventoryRow((object) $row));
            }

            foreach ($instanceRows->get() as $row) {
                $merged->push($this->normalizeInventoryRow((object) $row));
            }
        }

        $lockerRows = DB::table('account_locker_cosmetics as alc')
            ->join('item_defs as d', 'd.item_def_id', '=', 'alc.item_def_id')
            ->where('alc.account_id', $accountId)
            ->where('d.kind', 'cosmetic')
            ->selectRaw('d.item_def_id, d.code, d.name, d.kind, d.rarity, d.tradable, d.premium_only, d.bind, d.max_stack, d.cosmetic_slot, d.preview_image, d.model_glb, alc.quantity::int as quantity');

        if ($kind !== null && $kind !== '') {
            $lockerRows->where('d.kind', $kind);
        }

        if ($q !== null && $q !== '') {
            $term = '%'.$this->escapeLike($q).'%';
            $lockerRows->where(function ($query) use ($term): void {
                $query->where('d.name', 'ilike', $term)->orWhere('d.code', 'ilike', $term);
            });
        }
        foreach ($lockerRows->get() as $row) {
            $merged->push($this->normalizeInventoryRow((object) $row));
        }

        return $merged
            ->groupBy(fn (object $row): int => $row->item_def_id)
            ->map(function (Collection $group): object {
                $first = $group->first();
                $qty = (int) $group->sum(fn (object $row): int => $row->quantity);

                return (object) [
                    'item_def_id' => $first->item_def_id,
                    'code' => $first->code,
                    'name' => $first->name,
                    'kind' => $first->kind,
                    'rarity' => $first->rarity,
                    'tradable' => $first->tradable,
                    'premium_only' => $first->premium_only,
                    'bind' => $first->bind,
                    'max_stack' => $first->max_stack,
                    'cosmetic_slot' => $first->cosmetic_slot ?? null,
                    'preview_image' => $first->preview_image ?? null,
                    'model_glb' => $first->model_glb ?? null,
                    'quantity' => $qty,
                ];
            })
            ->values();
    }

    private function normalizeInventoryRow(object $row): object
    {
        return (object) [
            'item_def_id' => (int) $row->item_def_id,
            'code' => (string) $row->code,
            'name' => (string) $row->name,
            'kind' => (string) $row->kind,
            'rarity' => (int) $row->rarity,
            'tradable' => (bool) $row->tradable,
            'premium_only' => (bool) $row->premium_only,
            'bind' => (string) $row->bind,
            'max_stack' => (int) $row->max_stack,
            'cosmetic_slot' => isset($row->cosmetic_slot) && $row->cosmetic_slot !== null ? (string) $row->cosmetic_slot : null,
            'preview_image' => isset($row->preview_image) && $row->preview_image !== null ? (string) $row->preview_image : null,
            'model_glb' => isset($row->model_glb) && $row->model_glb !== null ? (string) $row->model_glb : null,
            'quantity' => (int) $row->quantity,
        ];
    }

    private function escapeLike(string $value): string
    {
        return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
    }

    public function getOrCreateGiftInboxContainerId(int $accountId): int
    {
        $existing = GiftInbox::query()
            ->where('account_id', $accountId)
            ->lockForUpdate()
            ->first();
        if ($existing !== null) {
            return (int) $existing->container_id;
        }

        try {
            $container = Container::query()->create([
                'type' => 'gift_inbox',
                'created_at' => now(),
            ]);

            GiftInbox::query()->create([
                'account_id' => $accountId,
                'container_id' => $container->container_id,
                'created_at' => now(),
            ]);

            return (int) $container->container_id;
        } catch (UniqueConstraintViolationException) {
            $retry = GiftInbox::query()
                ->where('account_id', $accountId)
                ->lockForUpdate()
                ->firstOrFail();

            return (int) $retry->container_id;
        }
    }

    private function addStackable(int $containerId, ItemDef $itemDef, int $quantity): void
    {
        $stack = InventoryStack::query()
            ->where('container_id', $containerId)
            ->where('item_def_id', $itemDef->item_def_id)
            ->lockForUpdate()
            ->first();

        $current = $stack !== null ? (int) $stack->quantity : 0;
        if ($current + $quantity > $itemDef->max_stack) {
            throw new ShopPurchaseRejectedException(
                'inventory_full',
                'Your inventory cannot hold more of this item.',
                422
            );
        }

        if ($stack !== null) {
            $stack->quantity = $current + $quantity;
            $stack->save();

            return;
        }

        InventoryStack::query()->create([
            'item_def_id' => $itemDef->item_def_id,
            'container_id' => $containerId,
            'quantity' => $quantity,
        ]);
    }

    private function addInstances(int $containerId, int $accountId, ItemDef $itemDef, int $quantity): void
    {
        for ($i = 0; $i < $quantity; $i++) {
            ItemInstance::query()->create([
                'item_def_id' => $itemDef->item_def_id,
                'owner_account_id' => $accountId,
                'owner_character_id' => null,
                'container_id' => $containerId,
                'locked_tx_id' => null,
                'lock_expires_at' => null,
            ]);
        }
    }

    private function grantLockerCosmetic(int $accountId, int $itemDefId, int $quantity): void
    {
        DB::transaction(function () use ($accountId, $itemDefId, $quantity): void {
            $existing = DB::table('account_locker_cosmetics')
                ->where('account_id', $accountId)
                ->where('item_def_id', $itemDefId)
                ->lockForUpdate()
                ->first();
            $nextQuantity = ($existing !== null ? (int) $existing->quantity : 0) + $quantity;

            DB::table('account_locker_cosmetics')->updateOrInsert(
                ['account_id' => $accountId, 'item_def_id' => $itemDefId],
                ['quantity' => $nextQuantity, 'updated_at' => now()]
            );
        });
    }
}
