<?php

namespace App\Services;

use App\Exceptions\ApartmentPlacementException;
use App\Models\Container;
use App\Models\ItemDef;
use App\Models\ItemInstance;
use App\Models\Room;
use App\Models\RoomFurniture;
use App\Models\RoomFurnitureContainer;
use App\Models\RoomMembership;
use App\Models\Server;
use App\Support\AssetUrl;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ApartmentPlacementService
{
    private const DEFAULT_TEMPLATE_KEY = 'starter_loft';

    /**
     * @var list<string>
     */
    private const PLACEABLE_KINDS = ['apartment_asset', 'furniture'];

    public function __construct(
        private readonly AccountInventoryService $inventoryService,
    ) {
    }

    /**
     * @return array{
     *   room_public_id:string,
     *   owner_account_id:int,
     *   template_key:string,
     *   objects:list<array{
     *     objectId:string,
     *     objectKey:string,
     *     modelGlb:string|null,
     *     variant:string|null,
     *     color:string|null,
     *     x:float,
     *     y:float,
     *     z:float,
     *     rotX:float,
     *     rotY:float,
     *     rotZ:float
     *   }>
     * }
     */
    public function resolveApartmentState(int $actorAccountId, int $ownerAccountId, ?string $templateKey = null): array
    {
        $template = $this->normalizeTemplateKey($templateKey);
        [$room, ] = $this->resolveOrCreateApartment($ownerAccountId, $template);
        $this->assertCanEditApartment($actorAccountId, $ownerAccountId, (int) $room->room_id);

        return [
            'room_public_id' => (string) $room->public_id,
            'owner_account_id' => $ownerAccountId,
            'template_key' => $template,
            'objects' => $this->loadRoomObjects((int) $room->room_id),
        ];
    }

    /**
     * @return Collection<int, array{
     *   item_def_id:int,
     *   code:string,
     *   name:string,
     *   kind:string,
     *   quantity:int,
     *   preview_image:string|null,
     *   model_glb:string|null
     * }>
     */
    public function listSpawnableAssets(int $accountId): Collection
    {
        return $this->inventoryService
            ->aggregatedItemsForAccount($accountId, null, null)
            ->filter(fn (object $row): bool => in_array((string) $row->kind, self::PLACEABLE_KINDS, true) && (int) $row->quantity > 0)
            ->map(fn (object $row): array => [
                'item_def_id' => (int) $row->item_def_id,
                'code' => (string) $row->code,
                'name' => (string) $row->name,
                'kind' => (string) $row->kind,
                'quantity' => (int) $row->quantity,
                'preview_image' => isset($row->preview_image) ? (string) $row->preview_image : null,
                'model_glb' => isset($row->model_glb) ? (string) $row->model_glb : null,
            ])
            ->values();
    }

    /**
     * @param array{
     *   objectId:string,
     *   objectKey:string,
     *   variant?:string|null,
     *   color?:string|null,
     *   x:float|int,
     *   y:float|int,
     *   z:float|int,
     *   rotX:float|int,
     *   rotY:float|int,
     *   rotZ:float|int
     * } $payload
     * @return array{
     *   objectId:string,
     *   objectKey:string,
     *   modelGlb:string|null,
     *   variant:string|null,
     *   color:string|null,
     *   x:float,
     *   y:float,
     *   z:float,
     *   rotX:float,
     *   rotY:float,
     *   rotZ:float
     * }
     */
    public function spawnObject(
        int $actorAccountId,
        int $ownerAccountId,
        ?string $templateKey,
        array $payload
    ): array {
        $template = $this->normalizeTemplateKey($templateKey);

        return DB::transaction(function () use ($actorAccountId, $ownerAccountId, $template, $payload): array {
            [$room, $roomContainerId] = $this->resolveOrCreateApartment($ownerAccountId, $template);
            $roomId = (int) $room->room_id;
            $this->assertCanEditApartment($actorAccountId, $ownerAccountId, $roomId);

            $objectId = $this->normalizeObjectId($payload['objectId'] ?? '');
            $objectKey = $this->normalizeObjectKey($payload['objectKey'] ?? '');
            if ($this->findRoomFurnitureByObjectIdForUpdate($roomId, $objectId) !== null) {
                throw new ApartmentPlacementException('object_id_already_exists', 'This object id is already used in this apartment.');
            }

            $itemDef = ItemDef::query()
                ->where('code', $objectKey)
                ->whereIn('kind', self::PLACEABLE_KINDS)
                ->first();
            if ($itemDef === null) {
                throw new ApartmentPlacementException('asset_not_found', 'This apartment asset does not exist.');
            }

            $placedByAccountId = $actorAccountId;
            $itemInstance = $this->consumeOneOwnedItemForPlacement(
                $actorAccountId,
                (int) $itemDef->item_def_id,
                $roomContainerId
            );
            $position = $this->normalizeTransform($payload);
            $variant = $this->normalizeNullableString($payload['variant'] ?? null);
            $color = $this->normalizeNullableColor($payload['color'] ?? null);
            $state = [
                'object_id' => $objectId,
                'object_key' => $objectKey,
                'variant' => $variant,
                'color' => $color,
                'placed_by_account_id' => $placedByAccountId,
            ];

            RoomFurniture::query()->create([
                'room_id' => $roomId,
                'item_instance_id' => (int) $itemInstance->item_instance_id,
                'pos_x' => $position['x'],
                'pos_y' => $position['y'],
                'pos_z' => $position['z'],
                'rot_x' => $position['rotX'],
                'rot_y' => $position['rotY'],
                'rot_z' => $position['rotZ'],
                'scale_x' => 1,
                'scale_y' => 1,
                'scale_z' => 1,
                'state_json' => $state,
            ]);

            return $this->payloadFromValues(
                $objectId,
                $objectKey,
                isset($itemDef->model_glb) && is_string($itemDef->model_glb) ? $itemDef->model_glb : null,
                $variant,
                $color,
                $position
            );
        });
    }

    /**
     * @param array{
     *   objectId:string,
     *   x:float|int,
     *   y:float|int,
     *   z:float|int,
     *   rotX:float|int,
     *   rotY:float|int,
     *   rotZ:float|int,
     *   variant?:string|null,
     *   color?:string|null
     * } $payload
     * @return array{
     *   objectId:string,
     *   objectKey:string,
     *   modelGlb:string|null,
     *   variant:string|null,
     *   color:string|null,
     *   x:float,
     *   y:float,
     *   z:float,
     *   rotX:float,
     *   rotY:float,
     *   rotZ:float
     * }
     */
    public function transformObject(
        int $actorAccountId,
        int $ownerAccountId,
        ?string $templateKey,
        array $payload
    ): array {
        $template = $this->normalizeTemplateKey($templateKey);

        return DB::transaction(function () use ($actorAccountId, $ownerAccountId, $template, $payload): array {
            [$room, ] = $this->resolveOrCreateApartment($ownerAccountId, $template);
            $roomId = (int) $room->room_id;
            $this->assertCanEditApartment($actorAccountId, $ownerAccountId, $roomId);

            $objectId = $this->normalizeObjectId($payload['objectId'] ?? '');
            $furniture = $this->findRoomFurnitureByObjectIdForUpdate($roomId, $objectId);
            if ($furniture === null) {
                throw new ApartmentPlacementException('object_not_found', 'Could not find this object in apartment.');
            }
            $state = is_array($furniture->state_json) ? $furniture->state_json : [];
            $objectKey = isset($state['object_key']) ? (string) $state['object_key'] : 'furniture.generic';
            $itemDef = $furniture->itemInstance?->itemDef;
            $modelGlb = $itemDef !== null && isset($itemDef->model_glb) && is_string($itemDef->model_glb)
                ? $itemDef->model_glb
                : null;
            $position = $this->normalizeTransform($payload);
            $variant = array_key_exists('variant', $payload)
                ? $this->normalizeNullableString($payload['variant'])
                : $this->normalizeNullableString($state['variant'] ?? null);
            $color = array_key_exists('color', $payload)
                ? $this->normalizeNullableColor($payload['color'])
                : $this->normalizeNullableColor($state['color'] ?? null);
            $state['variant'] = $variant;
            $state['color'] = $color;

            $furniture->update([
                'pos_x' => $position['x'],
                'pos_y' => $position['y'],
                'pos_z' => $position['z'],
                'rot_x' => $position['rotX'],
                'rot_y' => $position['rotY'],
                'rot_z' => $position['rotZ'],
                'state_json' => $state,
            ]);

            return $this->payloadFromValues($objectId, $objectKey, $modelGlb, $variant, $color, $position);
        });
    }

    /**
     * @return array{objectId:string,returned_to_account_id:int}
     */
    public function pickupObject(
        int $actorAccountId,
        int $ownerAccountId,
        ?string $templateKey,
        string $objectId
    ): array {
        $template = $this->normalizeTemplateKey($templateKey);

        return DB::transaction(function () use ($actorAccountId, $ownerAccountId, $template, $objectId): array {
            [$room, ] = $this->resolveOrCreateApartment($ownerAccountId, $template);
            $roomId = (int) $room->room_id;
            $this->assertCanEditApartment($actorAccountId, $ownerAccountId, $roomId);

            $normalizedObjectId = $this->normalizeObjectId($objectId);
            $furniture = $this->findRoomFurnitureByObjectIdForUpdate($roomId, $normalizedObjectId);
            if ($furniture === null) {
                throw new ApartmentPlacementException('object_not_found', 'Could not find this object in apartment.');
            }

            $state = is_array($furniture->state_json) ? $furniture->state_json : [];
            $returnedToAccountId = $ownerAccountId;
            if (isset($state['placed_by_account_id']) && is_numeric($state['placed_by_account_id'])) {
                $placedBy = (int) $state['placed_by_account_id'];
                if ($placedBy > 0) {
                    $returnedToAccountId = $placedBy;
                }
            }
            $giftContainerId = $this->inventoryService->getOrCreateGiftInboxContainerId($returnedToAccountId);

            ItemInstance::query()
                ->where('item_instance_id', (int) $furniture->item_instance_id)
                ->lockForUpdate()
                ->update([
                    'container_id' => $giftContainerId,
                    'owner_account_id' => $returnedToAccountId,
                ]);

            $furniture->delete();

            return [
                'objectId' => $normalizedObjectId,
                'returned_to_account_id' => $returnedToAccountId,
            ];
        });
    }

    /**
     * @return array{0:Room,1:int}
     */
    private function resolveOrCreateApartment(int $ownerAccountId, string $templateKey): array
    {
        $serverId = $this->resolveDefaultServerId();
        $roomName = $this->apartmentRoomName($ownerAccountId, $templateKey);
        $room = Room::query()
            ->where('server_id', $serverId)
            ->where('type', 'apartment')
            ->where('name', $roomName)
            ->lockForUpdate()
            ->first();
        if ($room === null) {
            $room = Room::query()->create([
                'server_id' => $serverId,
                'type' => 'apartment',
                'name' => $roomName,
                'owner_character_id' => null,
                'building_id' => null,
            ]);
        }

        DB::statement(
            '
            INSERT INTO room_memberships (room_id, account_id, role, created_at)
            VALUES (?, ?, ?, NOW())
            ON CONFLICT (room_id, account_id)
            DO UPDATE SET role = EXCLUDED.role
            ',
            [(int) $room->room_id, $ownerAccountId, 'owner']
        );

        $containerRow = RoomFurnitureContainer::query()
            ->where('room_id', (int) $room->room_id)
            ->lockForUpdate()
            ->first();
        if ($containerRow === null) {
            $container = Container::query()->create([
                'type' => 'room_furniture',
            ]);
            $containerRow = RoomFurnitureContainer::query()->create([
                'room_id' => (int) $room->room_id,
                'container_id' => (int) $container->container_id,
            ]);
        }

        return [$room, (int) $containerRow->container_id];
    }

    private function assertCanEditApartment(int $actorAccountId, int $ownerAccountId, int $roomId): void
    {
        if ($actorAccountId === $ownerAccountId) {
            return;
        }
        $isMember = RoomMembership::query()
            ->where('room_id', $roomId)
            ->where('account_id', $actorAccountId)
            ->exists();
        if (! $isMember) {
            throw new ApartmentPlacementException('apartment_edit_forbidden', 'You are not allowed to edit this apartment.', 403);
        }
    }

    /**
     * @return list<array{
     *   objectId:string,
     *   objectKey:string,
     *   modelGlb:string|null,
     *   variant:string|null,
     *   color:string|null,
     *   x:float,
     *   y:float,
     *   z:float,
     *   rotX:float,
     *   rotY:float,
     *   rotZ:float
     * }>
     */
    private function loadRoomObjects(int $roomId): array
    {
        $rows = RoomFurniture::query()
            ->where('room_id', $roomId)
            ->with(['itemInstance.itemDef'])
            ->orderBy('room_furniture_id')
            ->get();

        $out = [];
        foreach ($rows as $row) {
            $state = is_array($row->state_json) ? $row->state_json : [];
            $objectId = isset($state['object_id']) && is_string($state['object_id'])
                ? $state['object_id']
                : 'rf_'.(string) $row->room_furniture_id;
            $objectKey = isset($state['object_key']) && is_string($state['object_key'])
                ? $state['object_key']
                : 'furniture.generic';
            $itemDef = $row->itemInstance?->itemDef;
            $modelGlb = $itemDef !== null && isset($itemDef->model_glb) && is_string($itemDef->model_glb)
                ? $itemDef->model_glb
                : null;
            $variant = $this->normalizeNullableString($state['variant'] ?? null);
            $color = $this->normalizeNullableColor($state['color'] ?? null);
            $out[] = $this->payloadFromValues(
                $objectId,
                $objectKey,
                $modelGlb,
                $variant,
                $color,
                [
                    'x' => (float) $row->pos_x,
                    'y' => (float) $row->pos_y,
                    'z' => (float) $row->pos_z,
                    'rotX' => (float) $row->rot_x,
                    'rotY' => (float) $row->rot_y,
                    'rotZ' => (float) $row->rot_z,
                ]
            );
        }

        return $out;
    }

    private function findRoomFurnitureByObjectIdForUpdate(int $roomId, string $objectId): ?RoomFurniture
    {
        return RoomFurniture::query()
            ->where('room_id', $roomId)
            ->whereRaw("state_json->>'object_id' = ?", [$objectId])
            ->lockForUpdate()
            ->first();
    }

    private function consumeOneOwnedItemForPlacement(int $accountId, int $itemDefId, int $targetContainerId): ItemInstance
    {
        $giftContainerId = $this->inventoryService->getOrCreateGiftInboxContainerId($accountId);

        $instance = ItemInstance::query()
            ->where('container_id', $giftContainerId)
            ->where('item_def_id', $itemDefId)
            ->orderBy('item_instance_id')
            ->lockForUpdate()
            ->first();
        if ($instance !== null) {
            $instance->update([
                'container_id' => $targetContainerId,
                'owner_account_id' => $accountId,
            ]);

            return $instance->fresh();
        }

        $stack = DB::table('inventory_stacks')
            ->where('container_id', $giftContainerId)
            ->where('item_def_id', $itemDefId)
            ->lockForUpdate()
            ->first();
        if ($stack === null || (int) $stack->quantity <= 0) {
            throw new ApartmentPlacementException('asset_not_owned', 'You do not own this asset.');
        }

        $next = (int) $stack->quantity - 1;
        if ($next > 0) {
            DB::table('inventory_stacks')
                ->where('stack_id', (int) $stack->stack_id)
                ->update(['quantity' => $next]);
        } else {
            DB::table('inventory_stacks')
                ->where('stack_id', (int) $stack->stack_id)
                ->delete();
        }

        return ItemInstance::query()->create([
            'item_def_id' => $itemDefId,
            'owner_account_id' => $accountId,
            'owner_character_id' => null,
            'container_id' => $targetContainerId,
            'locked_tx_id' => null,
            'lock_expires_at' => null,
        ]);
    }

    private function resolveDefaultServerId(): int
    {
        $existing = Server::query()->where('name', 'main')->value('server_id');
        if ($existing !== null) {
            return (int) $existing;
        }

        return (int) Server::query()->create([
            'name' => 'main',
            'is_enabled' => true,
        ])->server_id;
    }

    private function apartmentRoomName(int $ownerAccountId, string $templateKey): string
    {
        return 'apartment:'.$ownerAccountId.':'.$templateKey;
    }

    private function normalizeTemplateKey(?string $templateKey): string
    {
        if (! is_string($templateKey)) {
            return self::DEFAULT_TEMPLATE_KEY;
        }
        $v = trim($templateKey);

        return $v !== '' ? $v : self::DEFAULT_TEMPLATE_KEY;
    }

    private function normalizeObjectId(mixed $raw): string
    {
        if (! is_string($raw)) {
            throw new ApartmentPlacementException('invalid_object_id', 'Object id is required.');
        }
        $v = trim($raw);
        if ($v === '') {
            throw new ApartmentPlacementException('invalid_object_id', 'Object id is required.');
        }

        return $v;
    }

    private function normalizeObjectKey(mixed $raw): string
    {
        if (! is_string($raw)) {
            throw new ApartmentPlacementException('invalid_object_key', 'Object key is required.');
        }
        $v = trim($raw);
        if ($v === '') {
            throw new ApartmentPlacementException('invalid_object_key', 'Object key is required.');
        }

        return $v;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{x:float,y:float,z:float,rotX:float,rotY:float,rotZ:float}
     */
    private function normalizeTransform(array $payload): array
    {
        $x = $this->normalizeNumber($payload['x'] ?? 0.0);
        $y = $this->normalizeNumber($payload['y'] ?? 0.0);
        $z = $this->normalizeNumber($payload['z'] ?? 0.0);
        $rotX = $this->normalizeNumber($payload['rotX'] ?? 0.0);
        $rotY = $this->normalizeNumber($payload['rotY'] ?? 0.0);
        $rotZ = $this->normalizeNumber($payload['rotZ'] ?? 0.0);

        return compact('x', 'y', 'z', 'rotX', 'rotY', 'rotZ');
    }

    private function normalizeNumber(mixed $raw): float
    {
        if (is_int($raw) || is_float($raw)) {
            $value = (float) $raw;
        } elseif (is_string($raw) && is_numeric($raw)) {
            $value = (float) $raw;
        } else {
            throw new ApartmentPlacementException('invalid_transform', 'Invalid transform payload.');
        }
        if (! is_finite($value)) {
            throw new ApartmentPlacementException('invalid_transform', 'Invalid transform payload.');
        }

        return $value;
    }

    private function normalizeNullableString(mixed $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        if (! is_string($raw)) {
            return null;
        }
        $value = trim($raw);

        return $value !== '' ? $value : null;
    }

    private function normalizeNullableColor(mixed $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        if (! is_string($raw)) {
            return null;
        }
        $value = trim($raw);
        if ($value === '') {
            return null;
        }
        if (! preg_match('/^#[0-9A-Fa-f]{6}$/', $value)) {
            return null;
        }

        return strtoupper($value);
    }

    /**
     * @param array{x:float,y:float,z:float,rotX:float,rotY:float,rotZ:float} $position
     * @return array{
     *   objectId:string,
     *   objectKey:string,
     *   modelGlb:string|null,
     *   variant:string|null,
     *   color:string|null,
     *   x:float,
     *   y:float,
     *   z:float,
     *   rotX:float,
     *   rotY:float,
     *   rotZ:float
     * }
     */
    private function payloadFromValues(
        string $objectId,
        string $objectKey,
        ?string $modelGlb,
        ?string $variant,
        ?string $color,
        array $position
    ): array {
        return [
            'objectId' => $objectId,
            'objectKey' => $objectKey,
            'modelGlb' => AssetUrl::normalize($modelGlb),
            'variant' => $variant,
            'color' => $color,
            'x' => $position['x'],
            'y' => $position['y'],
            'z' => $position['z'],
            'rotX' => $position['rotX'],
            'rotY' => $position['rotY'],
            'rotZ' => $position['rotZ'],
        ];
    }
}

