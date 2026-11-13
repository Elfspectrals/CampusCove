# Tasks: action counters and tiers

Tasks are achievements with tiers. They reward cosmetics, decor and badges, never coins. Rewards are bound to the account: they cannot be traded or sold.

## Action counters

Laravel owns every counter. A counter counts one real action, bumped by the service that performs the action, inside the same DB transaction: a rejected or rolled back action counts nothing. The client and the socket never send a count.

- Table `account_counters`: `account_id`, `counter`, `value` (bigint, >= 0), one row per account and counter, created at the first bump.
- `ActionCounterService::bump(int $accountId, ActionCounter $counter, int $by = 1): int` adds `$by` (> 0) and returns the new value. `value(int $accountId, ActionCounter $counter): int` reads it (0 when never bumped).
- After the transaction commits, the event `App\Events\CounterBumped` (`accountId`, `counter`, `before`, `after`) is dispatched. Tasks listen to it; the tutorial can too.
- Counters start at zero for every account: past actions are not counted.
- A counter of different things (foods tasted, later zones visited, trade partners) uses `bumpOncePerKey(int $accountId, ActionCounter $counter, string $key)`: the key goes in `account_counter_keys` (`account_id`, `counter`, `key`, primary key on the three), and the counter is bumped only when the key is new.

| Counter (`App\Enums\ActionCounter`) | One unit | Bumped by |
|---|---|---|
| `apples_picked` | one apple put in the inventory by a successful orchard pick | `OrchardService::pick` |
| `apples_sold` | one apple sold to the orchard farmer | `OrchardService::sell` |
| `food_eaten` | one portion eaten or drunk (an apple is two bites), drinks included | `SurvivalService::consume` |
| `atm_deposits` | one deposit at an ATM, whatever the amount; a replayed `ref` counts nothing | `BankService::deposit` |
| `darts_played` | one finished darts game, for each player, even while its coin reward is on cooldown | `PubService::reward` |
| `darts_duels_80` | one finished darts game against other players (placement 1 or more) with 80 points or more, won or lost; solo games do not count | `PubService::reward` |
| `foods_tasted` | one food or drink tasted for the first time (any group of `FoodCatalog` but `medical`), once per item code | `SurvivalService::consume` |

## Tiers

Every task lives in `App\Support\TaskCatalog`: a key, the counter it reads and its thresholds, in increasing order. A tier is reached when the counter value is at or above its threshold.

- Table `account_task_tiers`: `account_id`, `task`, `tier` (1 to 3), `reached_at`. Its primary key (account, task, tier) makes a tier reached once: a replayed or late event inserts nothing.
- On every `CounterBumped`, `TaskProgressService` records every tier of the tasks reading that counter whose threshold is at or below the new value and not yet recorded. A tier missed once (listener failure) is recorded at the next bump.

| Task | Counter | Tiers |
|---|---|---|
| `orchard` | `apples_picked` | 100 / 1,000 / 5,000 |
| `darts` | `darts_played` | 10 / 50 / 200 |
| `sharp_eye` | `darts_duels_80` | 1 / 10 / 50 |
| `gourmet` | `foods_tasted` | 5 / 15 / 30 (fixed, so it does not move when foods are added) |

## Notification

When `TaskProgressService` records a new tier (and only then), Laravel calls the socket:

- `POST /internal/task-tier-reached` with `X-Realtime-Secret`, body `{ accountId: int > 0, task: string [a-z_]{1,40}, tier: 1 | 2 | 3, threshold: int > 0 }`. The socket refuses any other body with 422. Best effort: a failed call is logged and the tier stays recorded.
- The socket sends `task_done` `{ task, tier, threshold }` to every client of that account in every city room.
- The front shows a banner at the top centre for 4 s (one at a time, queued) with a two-note chime: "Task complete", the task name and its tier name (Bronze, Silver, Gold), and the goal reached.

## Tasks menu

- `GET /api/tasks` (signed-in player, read only) returns `{ tasks: [{ task: string, value: int, tiers: int[3], reached: int[] }] }`, every task of the catalog in its order, `value` 0 when never bumped, `reached` the tiers recorded in `account_task_tiers`.
- In game, J (rebindable, action `tasks`) opens the menu; J or Esc closes it. One line per task: its name, three dots filled in the tier colour when reached, a bar from 0 to the next threshold with "value / threshold", and the next tier's badge. Past the last threshold the bar is full and reads "Complete".
- The Home page shows the same list (`TaskProgressList.vue`) in a Tasks panel. Medal colours: bronze `#c27a3e`, silver `#a9b4bf`, gold `#e5b53a` (`TIER_TONE` in `front/src/game/taskProgress.ts`), the same on every theme.
