<?php

namespace App\Console\Commands;

use App\Models\HousingUnit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Legacy MVP cubes = housing units without model_key (replaced by the 10 town houses). Runs at every
 * docker boot, so it is idempotent.
 */
class PurgeLegacyHousing extends Command
{
    protected $signature = 'housing:purge-legacy {--occupied : Also purge legacy units that are currently occupied}';

    protected $description = 'Delete legacy MVP housing cubes (no model_key) with their apartment room and furniture';

    public function handle(): int
    {
        $units = HousingUnit::query()
            ->whereNull('model_key')
            ->when(! $this->option('occupied'), fn ($q) => $q->where('status', 'vacant'))
            ->get();

        // Orphaned legacy apartment rooms ("apartment:<account>:housing_<unit>") left behind by a deleted unit.
        $orphanRoomIds = DB::table('rooms')
            ->where('type', 'apartment')
            ->where('name', 'like', 'apartment:%:housing\\_%')
            ->whereNotIn('room_id', DB::table('housing_units')->whereNotNull('room_id')->select('room_id'))
            ->pluck('room_id')
            ->all();

        if ($units->isEmpty() && $orphanRoomIds === []) {
            $this->info('No legacy housing units to purge.');

            return self::SUCCESS;
        }

        $roomIds = $units->pluck('room_id')->filter()->merge($orphanRoomIds)->unique()->values()->all();
        $containerIds = $roomIds === []
            ? []
            : DB::table('room_furniture_containers')->whereIn('room_id', $roomIds)->pluck('container_id')->all();

        DB::transaction(function () use ($units, $roomIds, $containerIds): void {
            HousingUnit::query()->whereIn('unit_id', $units->pluck('unit_id'))->delete();

            // Rooms cascade to furnitures, layouts, memberships, audit logs, ...
            if ($roomIds !== []) {
                DB::table('rooms')->whereIn('room_id', $roomIds)->delete();
            }

            // Furniture containers are RESTRICT-linked: drop them only once nothing references them.
            foreach ($containerIds as $containerId) {
                $inUse = DB::table('item_instances')->where('container_id', $containerId)->exists()
                    || DB::table('inventory_stacks')->where('container_id', $containerId)->exists()
                    || DB::table('room_furniture_containers')->where('container_id', $containerId)->exists();
                if (! $inUse) {
                    DB::table('containers')->where('container_id', $containerId)->delete();
                }
            }
        });

        $this->info(sprintf(
            'Purged %d legacy housing unit(s), %d room(s), %d furniture container(s).',
            $units->count(),
            count($roomIds),
            count($containerIds),
        ));

        return self::SUCCESS;
    }
}
