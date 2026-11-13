<?php

namespace App\Services;

use App\Enums\ActionCounter;
use App\Events\CounterBumped;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

final class ActionCounterService
{
    public function bump(int $accountId, ActionCounter $counter, int $by = 1): int
    {
        if ($by <= 0) {
            throw new InvalidArgumentException("A counter only goes up, got {$by}.");
        }
        $after = (int) DB::selectOne(
            'INSERT INTO account_counters (account_id, counter, value) VALUES (?, ?, ?)
             ON CONFLICT (account_id, counter)
             DO UPDATE SET value = account_counters.value + EXCLUDED.value, updated_at = now()
             RETURNING value',
            [$accountId, $counter->value, $by],
        )->value;
        CounterBumped::dispatch($accountId, $counter, $after - $by, $after);

        return $after;
    }

    public function value(int $accountId, ActionCounter $counter): int
    {
        return (int) DB::table('account_counters')
            ->where('account_id', $accountId)
            ->where('counter', $counter->value)
            ->value('value');
    }
}
