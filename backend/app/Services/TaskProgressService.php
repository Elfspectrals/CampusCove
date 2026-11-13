<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Support\TaskCatalog;
use Illuminate\Support\Facades\DB;

final class TaskProgressService
{
    public function recordReachedTiers(int $accountId, ActionCounter $counter, int $value): void
    {
        foreach (TaskCatalog::tiersReading($counter) as $task => $thresholds) {
            foreach ($thresholds as $index => $threshold) {
                if ($value < $threshold) {
                    break;
                }
                DB::table('account_task_tiers')->insertOrIgnore([
                    'account_id' => $accountId,
                    'task' => $task,
                    'tier' => $index + 1,
                ]);
            }
        }
    }
}
