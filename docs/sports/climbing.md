# Climbing

Climbing hall: bouldering on mats and a lead wall of about 12 m with coloured routes. Shared rules in [README.md](README.md).

## Rules

- **6 boulders and 4 routes**. The colour is the difficulty: green, blue, red, black. A harder colour has more holds, a faster and narrower reflex check and a grip that runs down faster.
- The next hold of the route is marked; the player **clicks it when they want, then passes a reflex check** to grab it (see "Decisions, 2026-11-15"). The **grip bar** runs down while hanging after a long reach and comes back on a hold reached with a short one; a missed check costs grip; an empty grip bar is a fall.
- **Boulders**: a fall lands on the mat, no damage.
- **Lead wall**: an automatic belay; a fall lowers the climber to the ground in 2 s and cancels the time. No partner needed.
- Time runs from the first hold to the top hold.

## Flow

- **Free play**: walk up to the start of a route and press interact; every climb is timed.
- **Speed duel**: the coach starts 2 climbers on two **twin routes** (identical, side by side, like speed climbing); first to the top wins.

## Controls

Mouse to aim, left click on the marked hold, then left click (or the jump key) when the needle is in the zone. Movement locked while climbing; the jump key lets go (drops down) when no check is running.

## HUD

Grip bar (its label turns green while the grip comes back), the next hold marked by a pulsing yellow ring, the reflex dial in the middle of the screen (zone, great part, needle), route colour and name, time; in a duel the other climber's height.

## Server authority

The socket owns the sequence, the reflex checks on its own clock (with an allowance), grip, falls and times. The client sends "hold clicked" with the hold id, then "check pressed" with nothing else: the needle angle is computed by the socket.

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

- Replaced on 2026-11-15 (see below): click windows per colour, each opening 700 ms after the hold lit while its ring closed, a miss costing 20 to 35 grip.
- The lent shoes are shown (decided 2026-11-15): while a player holds the `climbing_shoes` loan, other players see `wear/shoes/climbing_shoes` in place of their shoes (`front/src/game/sports/climbingWear.ts`), on every body build.
- First-person arms play their own climbing clips (`FpClimbReachL/R`, `FpClimbHang`, `FpClimbFall`, `FpClimbLower`, `FpClimbTop`), crossfaded like the other arm clips; other players see the third-person `Climb*` clips.
- 6 lead wall lanes of 2.9 m: 4 coloured routes and 2 twin speed lanes (`speed_1`, `speed_2`, red, 14 holds) in the
  middle, the coach at their foot. A topped route is lowered by the belay too, with its time kept.
- Every topped free climb is recorded as a solo `sports_matches` row (venue = line id, result `finished`, `timeMs`) for
  the weekly boards; the duel is recorded under venue `climbing_duel` (`win` with the time, `loss`, or `dnf`).

## Decisions (2026-11-15, gameplay pass after the first review)

The timed click (a ring closing on the hold, 420 to 900 ms to click) was found too hard on the easy route and unclear.
Reworked from VR climbing games (The Climb: grip that drains on bad holds and comes back on good ones; Jusant: it was
"way harder" a year before release) and from the Dead by Daylight skill check (needle 1.1 s a turn, zone 13 % of the
dial, great part 3 %), with the easy presets of `overextended/ox_lib` (50° at 2 s a turn).

- **No timer to click**: the next hold is marked from the start and stays marked. A click on any other hold, or on the
  wall, does nothing.
- **Reflex check** on each hold clicked: a needle starts at the top of a dial and turns once. A zone sits between 120°
  and 10° before the full turn, at a place the socket draws. A press inside the zone grabs the hold; inside its first
  quarter it is a great grab (+8 grip); before the zone, after it, or no press within the turn is a miss (grip lost, the
  climber stays on their hold and clicks again). 80 ms of allowance after the zone and after the turn.

| Colour | Turn | Zone at a short reach | Grip lost on a miss | Grip lost a second, at the longest reach |
|---|---|---|---|---|
| Green | 2.0 s | 70° | 12 | 2.5 |
| Blue | 1.7 s | 55° | 16 | 4 |
| Red | 1.4 s | 42° | 22 | 6 |
| Black | 1.15 s | 30° | 28 | 8.5 |

- **Reach**: the distance from the hold held to the next one. Up to 1.4 m the zone is whole; from 2.4 m it is 35 %
  narrower; in between it narrows evenly. Example, green: 1.0 m 70°, 1.9 m 57.75°, 2.4 m 45.5°.
- **Grip** (max 100): does not move on the mat. On a hold reached with 1.4 m or less it comes back at 6 a second. Past
  that it runs down at the colour's rate x (0.4 + 0.6 x strain), strain going from 0 at 1.4 m to 1 at 2.4 m. Example,
  green: +6 after a 1.0 m reach, -1.75 after 1.9 m, -2.5 after 2.4 m. Every line has from 1 to 12 such rest holds.
- **A climb lasts 3 minutes at most** from its first hold, then it is a fall: resting on a good hold must not keep a
  line taken for ever.
- **What the player can do while climbing** (rule "Emergent gameplay"): click the hold twice (the second click is the
  check press), press before the zone (a miss), press with no check (nothing), click another hold during a check
  (nothing), press the let-go key during a check (it presses the check, since it is the key players expect), let the
  needle turn (a miss), hang without moving (grip, then the 3 minutes), walk off, lose the shoes, disconnect (as
  before, the climb stops).

## Contract

Rules and hold layout: `front/public/assets/sports/rules/climbing.json` (lines in world coordinates: `base` [x, z] on the
wall face, `face` the direction the wall faces, holds [u, y] with u to the climber's right and y above `floorY`). The socket
(`socket/src/sports/climbingLogic.ts`), the front (`front/src/game/sports/climbing.ts`) and the hall build
(`build_sports_climbing.py`, which checks every wall face against it) read it.

| Message | Direction | Payload |
|---|---|---|
| `climb_start` | client → server | `{ line }`, inside `sports_climbing`, within `startReachM` (2.5 m) of the spot 1.1 m in front of the line, with the lent `climbing_shoes`, not signed up for a duel, line free, 1 s between starts |
| `climb_hold` | client → server | `{ hold: int }`, the clicked hold index of the climb's line, `-1` for a click on anything else; only the next hold, with no check running, starts a check |
| `climb_check` | client → server | `{}`, the press of the running check, judged on the socket clock |
| `climb_let_go` | client → server | `{}` |
| `climb_state` | server → climber and everyone in the hall | `{ sessionId, line, event: 'start' \| 'reach' \| 'hold' \| 'great' \| 'miss' \| 'fall' \| 'top' \| 'end', phase: 'climbing' \| 'lowering' \| 'ended', next, holds, grip (at `serverNow`), gripMax, gripPerSec (the client moves the bar with it), readyAt, check: { hold, startedAt, turnMs, zoneStart, zoneSize, greatSize (degrees) } \| null, startedAt, serverNow, duel, result?: 'topped' \| 'fell' \| 'let_go' \| 'cancelled' \| 'won' \| 'beaten', timeMs? }` |
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
  at most once a day (so at most 12 a day), for accounts 72 h old or more, from a recorded top: a free climb (solo
  `sports_matches` row of that line) or a won speed duel. Decided 2026-11-14: climbing is solo by design, so it does not
  use the core's `counts_for_tasks` rule (which never counts solo runs); the daily cap per line and the 72 h age stop
  farming. After the record, the socket sends `POST /tasks/climb-topped { ref, line, colour }`; Laravel checks the match
  is climbing, of that line or the duel, and that the account finished or won it.
