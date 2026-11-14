# Climbing

Climbing hall: bouldering on mats and a lead wall of about 12 m with coloured routes. Shared rules in [README.md](README.md).

## Rules

- **6 boulders and 4 routes**. The colour is the difficulty: green, blue, red, black. A harder colour has more holds and a shorter click window.
- The holds of the route light up one by one; the player **clicks the next hold within its time window**. Too early or too late lowers the **grip bar**; an empty grip bar is a fall.
- **Boulders**: a fall lands on the mat, no damage.
- **Lead wall**: an automatic belay; a fall lowers the climber to the ground in 2 s and cancels the time. No partner needed.
- Time runs from the first hold to the top hold.

## Flow

- **Free play**: walk up to the start of a route and press interact; every climb is timed.
- **Speed duel**: the coach starts 2 climbers on two **twin routes** (identical, side by side, like speed climbing); first to the top wins.

## Controls

Mouse to aim, left click on the lit hold. Movement locked while climbing; a key lets go (drops down).

## HUD

Grip bar, the next hold highlighted with its window ring, route colour and name, time; in a duel the other climber's height.

## Server authority

The socket owns the sequence, the windows on its own clock (with the usual allowance), grip, falls and times. The client sends "hold clicked" with the hold id; a click on any other hold is a miss.

## Gear

None to buy: **climbing shoes are lent at the reception with the pass**.

## Rewards

- Weekly board per route and per boulder (best time). Dated badge for the first.
- Task "routes topped"; feat task proposal: top a black route.

## Animations

Reach to a hold (left and right), hang idle, fall from a boulder, lowered on the rope, top-out.

## Failure cases

Disconnect or letting go: the climb stops, no time recorded.

## Decided (2026-11-14)

- Click windows per colour (green 900 ms, blue 700, red 550, black 420), each opening 700 ms after the hold lights while
  its ring closes; 150 ms network allowance after the window. Grip 100, a miss costs 20 / 25 / 30 / 35 by colour.
  A click before the window, after it, or on another hold is a miss and lights the same hold again.
- The lent shoes are not shown: no shoes model, the loan only unlocks the wall.
- 6 lead wall lanes of 2.9 m: 4 coloured routes and 2 twin speed lanes (`speed_1`, `speed_2`, red, 14 holds) in the
  middle, the coach at their foot. A topped route is lowered by the belay too, with its time kept.
- Every topped free climb is recorded as a solo `sports_matches` row (venue = line id, result `finished`, `timeMs`) for
  the weekly boards; the duel is recorded under venue `climbing_duel` (`win` with the time, `loss`, or `dnf`).

## Contract

Rules and hold layout: `front/public/assets/sports/rules/climbing.json` (lines in world coordinates: `base` [x, z] on the
wall face, `face` the direction the wall faces, holds [u, y] with u to the climber's right and y above `floorY`). The socket
(`socket/src/sports/climbingLogic.ts`), the front (`front/src/game/sports/climbing.ts`) and the hall build
(`build_sports_climbing.py`, which checks every wall face against it) read it.

| Message | Direction | Payload |
|---|---|---|
| `climb_start` | client → server | `{ line }`, inside `sports_climbing`, within `startReachM` (2.5 m) of the spot 1.1 m in front of the line, with the lent `climbing_shoes`, not signed up for a duel, line free, 1 s between starts |
| `climb_hold` | client → server | `{ hold: int }`, the clicked hold index of the climb's line, `-1` for a click on anything else |
| `climb_let_go` | client → server | `{}` |
| `climb_state` | server → climber and everyone in the hall | `{ sessionId, line, event: 'start' \| 'hold' \| 'miss' \| 'fall' \| 'top' \| 'end', phase: 'climbing' \| 'lowering' \| 'ended', next, holds, grip, gripMax, litAt, opensAt, closesAt, startedAt, serverNow, duel, result?: 'topped' \| 'fell' \| 'let_go' \| 'cancelled' \| 'won' \| 'beaten', timeMs? }` |
| `climb_error` | server → client | `{ code, message }`: `climb_no_shoes`, `climb_too_far`, `climb_already`, `climb_signed_up`, `climb_lane_reserved`, `climb_line_taken`, `climb_cooldown` |

The server moves the climber (`position_correction` reason `climbing`, `user_moved` for the others) to the pose under
the last hold reached, and back to the mat at the end. A climb stops with no time when the player disconnects, is
knocked out, loses the shoes or is moved off the wall.

## Proposed placeholder JSON fields

`sport` ("climbing"), `boulders` (6 × { id, colour, holds: positions, windowMs }), `routes` (4 × { id, colour, heightM, holds, windowMs }), `twinRoutes` (pair of route ids for duels), `grip` (max, lossPerMiss, lossPerLateMs), `belayLowerSec` (2), `allowanceMs`, `gear` ([], `lentAtReception`: ["climbing_shoes"]), `coachId`, `boards` (one per route and boulder), `tasks` (["routes_topped", "black_route"]).

## Weekly boards and tasks

- Boards are the core's (`SportsBoardService::BOARDS`, `docs/sports/CORE.md` § 4): one per line, `climb_<line>`
  (`settings: { line }`, metric `time`), fed by every topped free climb, which is recorded as a solo `sports_matches` row
  with `settings: { line }`. The duel (settings `{}`) has no board. The champion of each board gets the core's
  `sports_champion` badge. In the hall the shoe attendant NPC (`climbing_shoe_attendant`) opens all twelve boards
  (`GET /api/sports/boards/climb_<line>`).
- Tasks (badges only, see `docs/TASKS.md`): `routes_topped` 10 / 50 / 200 and `black_route` 1 / 10 / 30, each line counted
  at most once a day, and only from a match the core counts for tasks (`counts_for_tasks`): today that is the speed duel
  winner (solo runs never count). The socket sends `POST /tasks/climb-topped { ref, line, colour }` after the duel is
  recorded; Laravel checks the match is climbing, counted, and that the account won or finished it. Thresholds proposed,
  to review with the `game-designer`.
