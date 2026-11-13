<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Support\TaskCatalog;
use Illuminate\Support\Facades\DB;

final class TaskProgressService
{
    public function __construct(private readonly RealtimeNotifier $notifier) {}

    public function recordReachedTiers(int $accountId, ActionCounter $counter, int $value): void
    {
        foreach (TaskCatalog::tiersReading($counter) as $task => $thresholds) {
            foreach ($thresholds as $index => $threshold) {
                if ($value < $threshold) {
                    break;
                }
                $inserted = DB::table('account_task_tiers')->insertOrIgnore([
                    'account_id' => $accountId,
                    'task' => $task,
                    'tier' => $index + 1,
                ]);
                if ($inserted === 1) {
                    $this->notifier->taskTierReached($accountId, $task, $index + 1, $threshold);
                }
            }
        }
    }

    /** @return list<array{task: string, value: int, tiers: list<int>, reached: list<int>}> */
    public function overview(int $accountId): array
    {
        $values = DB::table('account_counters')->where('account_id', $accountId)->pluck('value', 'counter');
        $reached = DB::table('account_task_tiers')->where('account_id', $accountId)->orderBy('tier')->get(['task', 'tier'])->groupBy('task');

        $overview = [];
        foreach (TaskCatalog::tasks() as $task => $definition) {
            $overview[] = [
                'task' => $task,
                'value' => (int) ($values[$definition['counter']->value] ?? 0),
                'tiers' => $definition['tiers'],
                'reached' => ($reached[$task] ?? collect())->map(fn (object $row): int => (int) $row->tier)->values()->all(),
            ];
        }

        return $overview;
    }
}
