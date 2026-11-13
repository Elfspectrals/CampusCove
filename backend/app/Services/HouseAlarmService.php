<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

final class HouseAlarmService
{
    public const ITEM_CODE = 'decor_alarm';

    public const MISSES_TO_TRIGGER = 2;

    public function hasAlarm(int $unitId): bool
    {
        return DB::table('housing_units')
            ->join('room_furnitures', 'room_furnitures.room_id', '=', 'housing_units.room_id')
            ->join('item_instances', 'item_instances.item_instance_id', '=', 'room_furnitures.item_instance_id')
            ->join('item_defs', 'item_defs.item_def_id', '=', 'item_instances.item_def_id')
            ->where('housing_units.unit_id', $unitId)
            ->where('item_defs.code', self::ITEM_CODE)
            ->exists();
    }

    public function trigger(int $attemptId, int $unitId): bool
    {
        $ownerId = DB::table('housing_units')->where('unit_id', $unitId)->value('occupant_account_id');
        if ($ownerId === null || ! $this->hasAlarm($unitId)) {
            return false;
        }

        return DB::table('house_alarm_events')->insertOrIgnore([
            'unit_id' => $unitId,
            'owner_account_id' => $ownerId,
            'attempt_id' => $attemptId,
        ]) > 0;
    }

    /** @return array{count: int, last_at: string|null} */
    public function takeUnseen(int $ownerId): array
    {
        $seen = DB::select('UPDATE house_alarm_events SET seen_at = now() WHERE owner_account_id = ? AND seen_at IS NULL RETURNING triggered_at', [$ownerId]);
        $last = collect($seen)->max('triggered_at');

        return ['count' => count($seen), 'last_at' => $last === null ? null : Carbon::parse($last)->toIso8601String()];
    }
}
