# Tasks: action counters and tiers

Tasks are achievements with tiers. They reward cosmetics, decor and badges, never coins. Rewards are bound to the account: they cannot be traded or sold.

## Action counters

Laravel owns every counter. A counter counts one real action, bumped by the service that performs the action, inside the same DB transaction: a rejected or rolled back action counts nothing. The client and the socket never send a count.

- Table `account_counters`: `account_id`, `counter`, `value` (bigint, >= 0), one row per account and counter, created at the first bump.
- `ActionCounterService::bump(int $accountId, ActionCounter $counter, int $by = 1): int` adds `$by` (> 0) and returns the new value. `value(int $accountId, ActionCounter $counter): int` reads it (0 when never bumped).
- After the transaction commits, the event `App\Events\CounterBumped` (`accountId`, `counter`, `before`, `after`) is dispatched. Tasks listen to it; the tutorial can too.
- Counters start at zero for every account: past actions are not counted.

| Counter (`App\Enums\ActionCounter`) | One unit | Bumped by |
|---|---|---|
| `apples_picked` | one apple put in the inventory by a successful orchard pick | `OrchardService::pick` |

## Tiers

Every task lives in `App\Support\TaskCatalog`: a key, the counter it reads and its thresholds, in increasing order. A tier is reached when the counter value is at or above its threshold.

- Table `account_task_tiers`: `account_id`, `task`, `tier` (1 to 3), `reached_at`. Its primary key (account, task, tier) makes a tier reached once: a replayed or late event inserts nothing.
- On every `CounterBumped`, `TaskProgressService` records every tier of the tasks reading that counter whose threshold is at or below the new value and not yet recorded. A tier missed once (listener failure) is recorded at the next bump.

| Task | Counter | Tiers |
|---|---|---|
| `orchard` | `apples_picked` | 100 / 1,000 / 5,000 |
