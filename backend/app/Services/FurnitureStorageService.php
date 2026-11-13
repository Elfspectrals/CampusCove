<?php

namespace App\Services;

use App\Exceptions\FurnitureStorageRejectedException;
use App\Models\HousingUnit;
use App\Models\ItemDef;
use App\Models\RoomFurniture;
use App\Support\AssetUrl;
use Illuminate\Support\Facades\DB;

final class FurnitureStorageService
{
    /** @var array<string, array{slots: int, food_only: bool}> */
    public const STORAGES = [
        'decor_dresser' => ['slots' => 8, 'food_only' => false],
        'decor_toy_chest' => ['slots' => 6, 'food_only' => false],
        'decor_fridge_retro' => ['slots' => 10, 'food_only' => true],
    ];

    public function __construct(
        private readonly AccountInventoryService $inventory,
        private readonly HousingService $housing,
        private readonly TradeService $trades,
    ) {}

    /** @return array{object_id: string, code: string, slots: int, food_only: bool, can_deposit: bool, items: list<array{code: string, name: string, kind: string, quantity: int, preview_image: string|null}>} */
    public function open(int $actorId, int $ownerId, string $objectId): array
    {
        return DB::transaction(function () use ($actorId, $ownerId, $objectId): array {
            [$unit, $furniture, $code] = $this->storageFurniture($ownerId, $objectId);

            return $this->screen($actorId, $unit, $furniture, $code);
        });
    }

    public function deposit(int $actorId, int $ownerId, string $objectId, string $itemCode, int $quantity): array
    {
        return DB::transaction(function () use ($actorId, $ownerId, $objectId, $itemCode, $quantity): array {
            [$unit, $furniture, $code] = $this->storageFurniture($ownerId, $objectId);
            if (! $this->canDeposit($actorId, $unit)) {
                throw new FurnitureStorageRejectedException('storage_not_yours', 'Only the owner and key holders can put things away here.', 403);
            }
            $def = $this->itemDef($itemCode);
            if (! TradeService::isTradable($def) || in_array($def->kind, ['furniture', 'apartment_asset'], true)) {
                throw new FurnitureStorageRejectedException('storage_item_refused', "{$def->name} cannot be stored.", 422);
            }
            if (self::STORAGES[$code]['food_only'] && $def->kind !== 'consumable') {
                throw new FurnitureStorageRejectedException('storage_food_only', 'Only food and drinks go in the fridge.', 422);
            }
            if (in_array((int) $def->item_def_id, $this->trades->wornItemDefIds($actorId), true)) {
                throw new FurnitureStorageRejectedException('storage_item_worn', "{$def->name} is being worn: take it off first.", 422);
            }
            if ($this->wholeQuantity($actorId, $def) < $quantity) {
                throw new FurnitureStorageRejectedException('storage_item_missing', "You do not have that many {$def->name}.", 422);
            }
            $containerId = $this->containerFor($furniture);
            $stored = $this->storedQuantity($containerId, $def);
            if ($stored === 0 && $this->usedSlots($containerId) >= self::STORAGES[$code]['slots']) {
                throw new FurnitureStorageRejectedException('storage_full', 'There is no room left in here.', 422);
            }
            if ($stored + $quantity > $def->max_stack) {
                throw new FurnitureStorageRejectedException('storage_stack_full', "No room for that many {$def->name} in here.", 422);
            }
            $this->inventory->revokeItem($actorId, $def, $quantity);
            DB::table('inventory_stacks')->upsert(
                ['item_def_id' => $def->item_def_id, 'container_id' => $containerId, 'quantity' => $stored + $quantity],
                ['item_def_id', 'container_id'],
                ['quantity'],
            );

            return $this->screen($actorId, $unit, $furniture, $code);
        });
    }

    public function take(int $actorId, int $ownerId, string $objectId, string $itemCode, int $quantity): array
    {
        return DB::transaction(function () use ($actorId, $ownerId, $objectId, $itemCode, $quantity): array {
            [$unit, $furniture, $code] = $this->storageFurniture($ownerId, $objectId);
            $def = $this->itemDef($itemCode);
            $containerId = $this->containerFor($furniture);
            $stored = $this->storedQuantity($containerId, $def);
            if ($stored < $quantity) {
                throw new FurnitureStorageRejectedException('storage_item_gone', "There are not that many {$def->name} left in here.", 409);
            }
            if ($this->trades->ownedQuantity($actorId, $def) + $quantity > $def->max_stack) {
                throw new FurnitureStorageRejectedException('storage_bag_full', "You cannot carry that many {$def->name}.", 422);
            }
            $left = $stored - $quantity;
            $stack = DB::table('inventory_stacks')->where('container_id', $containerId)->where('item_def_id', $def->item_def_id);
            $left > 0 ? $stack->update(['quantity' => $left]) : $stack->delete();
            $this->inventory->grantItem($actorId, $def, $quantity);

            return $this->screen($actorId, $unit, $furniture, $code);
        });
    }

    public static function isEmpty(int $roomFurnitureId): bool
    {
        $containerId = DB::table('furniture_storages')->where('room_furniture_id', $roomFurnitureId)->value('container_id');

        return $containerId === null || ! DB::table('inventory_stacks')->where('container_id', $containerId)->exists();
    }

    /**
     * @param  list<int>  $roomFurnitureIds
     */
    public static function destroy(array $roomFurnitureIds): void
    {
        $containerIds = DB::table('furniture_storages')->whereIn('room_furniture_id', $roomFurnitureIds)->pluck('container_id');
        DB::table('inventory_stacks')->whereIn('container_id', $containerIds)->delete();
        DB::table('furniture_storages')->whereIn('room_furniture_id', $roomFurnitureIds)->delete();
        DB::table('containers')->whereIn('container_id', $containerIds)->delete();
    }

    /** @return array{0: HousingUnit, 1: RoomFurniture, 2: string} */
    private function storageFurniture(int $ownerId, string $objectId): array
    {
        $unit = $this->housing->findOccupiedUnitForAccount($ownerId);
        $furniture = $unit?->room_id === null ? null : RoomFurniture::query()
            ->where('room_id', (int) $unit->room_id)
            ->whereRaw("state_json->>'object_id' = ?", [$objectId])
            ->lockForUpdate()
            ->first();
        $code = $furniture === null ? null : DB::table('item_instances')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->where('item_instances.item_instance_id', $furniture->item_instance_id)
            ->value('item_defs.code');
        if ($unit === null || $furniture === null || ! isset(self::STORAGES[$code])) {
            throw new FurnitureStorageRejectedException('storage_not_found', 'There is nothing to open here.', 404);
        }

        return [$unit, $furniture, $code];
    }

    private function containerFor(RoomFurniture $furniture): int
    {
        $containerId = DB::table('furniture_storages')->where('room_furniture_id', $furniture->room_furniture_id)->value('container_id');
        if ($containerId !== null) {
            return (int) $containerId;
        }
        $containerId = (int) DB::table('containers')->insertGetId(['type' => 'room_furniture'], 'container_id');
        DB::table('furniture_storages')->insert(['room_furniture_id' => $furniture->room_furniture_id, 'container_id' => $containerId]);

        return $containerId;
    }

    private function canDeposit(int $actorId, HousingUnit $unit): bool
    {
        return (int) $unit->occupant_account_id === $actorId || in_array($actorId, $this->housing->keyHolderIds($unit), true);
    }

    private function wholeQuantity(int $accountId, ItemDef $def): int
    {
        $started = (int) (DB::table('inventory_stacks')
            ->where('container_id', $this->inventory->getOrCreateGiftInboxContainerId($accountId))
            ->where('item_def_id', $def->item_def_id)
            ->value('portions_used') ?? 0);

        return $this->trades->ownedQuantity($accountId, $def) - ($started > 0 ? 1 : 0);
    }

    private function storedQuantity(int $containerId, ItemDef $def): int
    {
        return (int) (DB::table('inventory_stacks')
            ->where('container_id', $containerId)
            ->where('item_def_id', $def->item_def_id)
            ->lockForUpdate()
            ->value('quantity') ?? 0);
    }

    private function usedSlots(int $containerId): int
    {
        return DB::table('inventory_stacks')->where('container_id', $containerId)->count();
    }

    private function itemDef(string $code): ItemDef
    {
        $def = ItemDef::query()->where('code', $code)->first();
        if ($def === null) {
            throw new FurnitureStorageRejectedException('storage_item_refused', 'Unknown item.', 422);
        }

        return $def;
    }

    private function screen(int $actorId, HousingUnit $unit, RoomFurniture $furniture, string $code): array
    {
        $containerId = DB::table('furniture_storages')->where('room_furniture_id', $furniture->room_furniture_id)->value('container_id');
        $items = $containerId === null ? [] : DB::table('inventory_stacks')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'inventory_stacks.item_def_id')
            ->where('inventory_stacks.container_id', $containerId)
            ->orderBy('item_defs.name')
            ->get(['item_defs.code', 'item_defs.name', 'item_defs.kind', 'inventory_stacks.quantity', 'item_defs.preview_image'])
            ->map(fn (object $row): array => [
                'code' => $row->code,
                'name' => $row->name,
                'kind' => $row->kind,
                'quantity' => (int) $row->quantity,
                'preview_image' => AssetUrl::normalize($row->preview_image),
            ])
            ->all();

        return [
            'object_id' => (string) ($furniture->state_json['object_id'] ?? ''),
            'code' => $code,
            'slots' => self::STORAGES[$code]['slots'],
            'food_only' => self::STORAGES[$code]['food_only'],
            'can_deposit' => $this->canDeposit($actorId, $unit),
            'items' => $items,
        ];
    }
}
