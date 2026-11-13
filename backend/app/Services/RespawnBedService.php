<?php

namespace App\Services;

use App\Exceptions\RespawnBedRejectedException;
use App\Models\HousingUnit;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

final class RespawnBedService
{
    public const BED_CODES = ['decor_bed_single', 'decor_bed_double', 'decor_bunk_bed'];

    public function __construct(private readonly HousingService $housing) {}

    /** @return array{owner_account_id: int, object_id: string} */
    public function set(int $accountId, int $ownerId, string $objectId): array
    {
        return DB::transaction(function () use ($accountId, $ownerId, $objectId): array {
            $unit = $this->housing->findOccupiedUnitForAccount($ownerId);
            $bed = $unit?->room_id === null ? null : $this->beds()
                ->where('room_furnitures.room_id', (int) $unit->room_id)
                ->whereRaw("room_furnitures.state_json->>'object_id' = ?", [$objectId])
                ->first(['room_furnitures.room_furniture_id']);
            if ($unit === null || $bed === null) {
                throw new RespawnBedRejectedException('bed_not_found', 'There is no bed here.', 404);
            }
            if (! $this->hasKeys($accountId, $unit)) {
                throw new RespawnBedRejectedException('bed_not_yours', 'You can only wake up in a house you have the keys to.', 403);
            }
            DB::table('account_respawn_beds')->upsert(
                ['account_id' => $accountId, 'room_furniture_id' => $bed->room_furniture_id, 'set_at' => now()],
                ['account_id'],
                ['room_furniture_id', 'set_at'],
            );

            return ['owner_account_id' => $ownerId, 'object_id' => $objectId];
        });
    }

    /** @return array{owner_account_id: int, object_id: string}|null */
    public function current(int $accountId): ?array
    {
        $row = DB::table('account_respawn_beds')
            ->join('room_furnitures', 'room_furnitures.room_furniture_id', '=', 'account_respawn_beds.room_furniture_id')
            ->join('housing_units', 'housing_units.room_id', '=', 'room_furnitures.room_id')
            ->where('account_respawn_beds.account_id', $accountId)
            ->where('housing_units.status', 'occupied')
            ->first(['housing_units.unit_id', 'room_furnitures.state_json']);
        $unit = $row === null ? null : HousingUnit::query()->find($row->unit_id);
        if ($unit === null || ! $this->hasKeys($accountId, $unit)) {
            return null;
        }

        return ['owner_account_id' => (int) $unit->occupant_account_id, 'object_id' => (string) (json_decode($row->state_json, true)['object_id'] ?? '')];
    }

    private function hasKeys(int $accountId, HousingUnit $unit): bool
    {
        return (int) $unit->occupant_account_id === $accountId || in_array($accountId, $this->housing->keyHolderIds($unit), true);
    }

    private function beds(): Builder
    {
        return DB::table('room_furnitures')
            ->join('item_instances', 'item_instances.item_instance_id', '=', 'room_furnitures.item_instance_id')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->whereIn('item_defs.code', self::BED_CODES);
    }
}
