# Ice skating

Indoor ice rink, 60 × 30 m with stands. Free skating and timed races. Shared rules in [README.md](README.md).

## Rules

- Sliding movement with inertia: the skater keeps speed, turns wide, brakes on purpose.
- **Races**: laps of an oval marked by cones; the first player chooses **1, 3 or 5 laps**, 1 to 8 skaters. Cutting inside a cone adds a **2 s penalty**.
- Skaters push each other on contact; a crash at full speed makes both fall for 1.5 s. Hitting the boards too fast is a fall too.
- **Hockey later**: goals and lines are drawn on the ice for a future hockey game, not playable now.

## Controls

- **Forward key in pushes**: each push gives speed, a push timed in the good rhythm gives more.
- Mouse and side keys turn (wider at speed).
- **Space**: brake.

## Flow

Free skating whenever the rink is open. Races: sign-up with the rink coach, laps chosen by the first player, start line, beep, race, results.

## HUD

Speed, push rhythm cue, lap counter, race clock, penalties, final place and time.

## Server authority

The socket owns the skating movement during a race (it replays the push inputs on its clock), cone checks and penalties, collisions between skaters, laps and times. In free skating it checks speed like normal movement (no faster than skating allows).

## Gear

**Ice skates required** (bought at the mall sports shop). Without skates the player cannot step on the ice.

## Rewards

- Weekly board per lap count (1, 3, 5). Dated badge for the first.
- Task "races skated"; feat task proposal: 3 laps under a target time with no penalty.

## Animations

Skating push (left and right), glide, turn lean, brake, fall and get-up, small stumble on a push.

## Failure cases

Leaving the ice or disconnecting: did not finish.

## Open points

- Inertia, turn radius and push rhythm numbers.
- Do falls slow the race too much for casual players?

## Proposed placeholder JSON fields

`sport` ("skating"), `rink` (60 × 30, boards, hockey markings for later), `raceOval` (cone positions), `lapsChoices` ([1, 3, 5]), `maxPlayers` (8), `cutPenaltyMs` (2000), `skate` (pushGain, rhythmMs, toleranceMs, friction, maxSpeed, turnRadiusBySpeed, brake), `crash` (speedThreshold, fallMs 1500), `gear` (["ice_skates"]), `coachId`, `boards` (["skate_1", "skate_3", "skate_5"]), `tasks` (["races_skated", "skate_3_clean"]).

## Contract (built 2026-11-14)

Venue `rink_skating` (zone `sports_ice_rink`, coach `rink_coach`), registered at boot by `loadSkating()`
(`socket/src/sports/skating.ts`, called from `server.ts`). Race logic in `socket/src/sports/skatingRink.ts`, pure
model in `skatingSim.ts`; the front mirrors the speed model in `front/src/game/sports/skating/skateMotion.ts`
(golden values shared by both tests). Every number below lives in `front/public/assets/sports/rules/skating.json`,
which the Blender build (`build_sports_ice_rink.py`), the socket and the front all read.

### Rink

- Ice: x −556.4 → −496.4, z −290.5 → −260.5 (60 × 30 m), corners cut at 4 m, boards 1.1 m (collision 1.8 m), two
  gates of 1.6 m on the lobby side at z −272.5 and −278.5. Hockey lines, circles and creases are painted, no goals.
- Race line: 22 cones around a spine from (−540.4, −275.5) to (−512.4, −275.5), radius 6 m. Skaters go
  counterclockwise seen from above (east along the south straight). Start line at x −526.4 on the south lane,
  8 grid spots behind it.

### Movement

| Value | Number |
|---|---|
| Push (normal / in rhythm / too early) | +1.6 / +2.6 / +0.4 m/s |
| Rhythm | 650 ms between pushes, ±150 ms on the client, ±250 ms on the server (100 ms network allowance) |
| Glide friction / brake (Space) | 0.5 / 7 m/s² |
| Top speed | 9 m/s; the socket's move check allows 9 × 1.25 on the ice with skates |
| Turn rate (follows the camera) | 3.2 rad/s standing, 0.9 rad/s at top speed; side keys turn 1.6 rad/s |

- Stepping on the ice without `gear_ice_skates` in the inventory is refused (`position_correction`, reason
  `no_skates`). Ownership is read from Laravel (`GET /api/sports/gear`) each time the player enters the venue zone,
  and again at most every 5 s while a player who was refused tries the ice (skates bought inside the rink count).
- Every avatar standing on the ice shows the `shoes/ice_skates` wear piece instead of its shoes (position only: the
  socket already refuses the ice without skates).
- During a race the socket replays the pushes on its clock: a move may not go further than the replayed glide since
  the last accepted move, plus 1.5 m (`too_fast`).
- Collisions, for every skater on the ice (`tickSkating`, every 100 ms): two skaters closer than 0.9 m both fall for
  1.5 s when one of them is at 6.5 m/s or more (replayed speed), then cannot fall again for 2 s; slower, they are pushed
  1 m apart and lose 30 % of their speed (`skate_bump`, at most one per 600 ms). Moving towards a board at 6.5 m/s or
  more within 0.6 m of it is a fall too. A fallen skater's moves are refused (`skate_fallen`). The front predicts the
  board fall when its collision stops a fast skater.

### Race

1 to 8 skaters, 1, 3 or 5 laps, no teams, no rejoin grace. Kick-off moves the racers to the grid
(`position_correction` reason `skate_grid`) and holds them for 3 s (`skate_start`). Laps are the angle travelled around
the spine; entering the cone line adds 2 s once per cut. Two racers closer than 0.9 m with one of them at 6.5 m/s or
more both fall for 1.5 s (`skate_fall`, moves refused with `skate_fallen`), then cannot fall again for 2 s. Leaving the
ice, the venue or the game is a did-not-finish. Time limit 60 s + 40 s per lap. Results go to `POST /api/sports/matches`
(`finished` with `place` and `timeMs` penalties included, or `dnf`). No coins.

| Message | Direction | Payload |
|---|---|---|
| `skate_push` | client → server | `{}`, on the ice with skates, at most one per 150 ms |
| `skate_brake` | client → server | `{ on: boolean }` |
| `skate_race` | server → players in the venue and racers | `{ venue, phase: 'countdown' \| 'racing', laps, goAt, serverNow, racers: [{ sessionId, name, lap, penaltyMs, finishedMs: number \| null, dnf }] }`, at kick-off, at the start and on each change |
| `skate_fall` | server → same | `{ sessionId, until, serverNow }` |
| `skate_bump` | server → the pushed skater | `{ sessionId, dirX, dirZ, distance, serverNow }` (the front applies it as a knockback) |
| `skate_move` | server → the other players in the venue | `{ sessionId, move: 'push' \| 'brake' \| 'stumble' }`: a push (`stumble` when it came too early), a brake above 1 m/s, or a bump; drives the other players' avatar clips |
| `skate_result` | server → same | `{ venue, laps, results: [{ sessionId, name, place: number \| null, timeMs: number \| null, penaltyMs, dnf }] }` |

### Tasks, boards and sounds

- After `recordMatch`, each finisher is reported with their own token: `POST /api/tasks/skate-race` (realtime)
  `{ ref, penaltyMs }`. Laravel counts it only when the stored match has `counts_for_tasks` (core anti-farm, so solo
  races never count) and the player finished; laps and time come from the stored match. Counters `skate_races` and
  `skate_clean_runs` (3 laps, no penalty, 60 s or less), each at most 5 a day and once per match. Tasks `races_skated`
  10 / 50 / 150 and `skate_3_clean` 1 / 10 / 30, badges only (`docs/TASKS.md`).
- Weekly boards are the core's `skate_1`, `skate_3` and `skate_5` (`GET /api/sports/boards/{board}`, CORE.md § Weekly
  boards, `sports_champion` badge). The HUD shows the top 5 of each and last week's champions while the player is in
  the hall and not skating or racing.
- Sounds (`build_skating_sfx.py`, Earshot bank): `skate_push`, `skate_brake`, `skate_fall`, `skate_bump`,
  `skate_start`.
- Stands: one walkable level per tier (`interior.layout.json` `levels`), a 2 m aisle through the seat rows. Sitting
  is not built on purpose (decided 2026-11-14): the seat system belongs to the pub (socket `pub.ts`, front seats) and
  sharing it is a change of its own; spectators stand on the tiers.
