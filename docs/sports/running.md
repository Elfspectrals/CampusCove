# Running

400 m athletics track around the outdoor football pitch, with a small stand. Shared rules in [README.md](README.md).

## Rules

- Distances chosen by the first player at the athletics coach: **100 m, 400 m, 1 500 m**. 1 to 8 runners.
- No lanes to stay in: the time counts only if the runner passes **every invisible gate** along the track in order. A missed gate disqualifies. Cutting across the grass misses gates.
- Start on a beep; a press before it is a false start and disqualifies (as in swimming).

## Controls

- **Alternate two keys (left / right) in rhythm**: cadence is speed, as in swimming. Too fast or out of step loses speed.
- Mouse look steers (technical choice: the two rhythm keys are the mouse buttons or two keys away from the movement keys, set at build time).

## Flow

Sign-up at the athletics coach → distance → kick-off rules of the README → runners on the start line → beep → race → results 10 s.

## HUD

Race clock, cadence bar with its good window, next gate arrow, lap count on the 1 500 m, final place and time.

## Server authority

The socket replays the rhythm inputs on its clock and owns speed, position, gate passing, false starts and times. The client sends key down / up and the look direction only.

## Gear

**Running spikes required** for timed races (worn in the shoe slot). Free jogging on the track needs none.

## Rewards

- Weekly board per distance, solo runs count. Dated badge for the first.
- Task "races run"; feat task proposal: 400 m under a target time.

## Animations

Sprint start crouch, rhythm run (the run cycle speed-matched), finish lean, out-of-breath idle.

## Failure cases

A missed gate or a disconnect: did not finish.

## Decisions (built 2026-11-14)

- Rules and track geometry live in `front/public/assets/sports/rules/running.json` (status `ready`); the socket, the HUD and `build_sports_athletics.py` read it.
- Runners go counter-clockwise; the home straight is the south one and the finish line is at x −431.8. The 100 m starts in the west chute; the 400 m and 1 500 m start 400 m and 1 500 m before the finish (the 1 500 m on the east bend). 8 runners start side by side across the 8 lanes.
- Gates every 25 m across the whole track width (1 m margin each side); the last one is the finish line. Crossing a later gate before the next one disqualifies (`missed_gate`).
- The two rhythm keys are the **left and right mouse buttons**; mouse look steers. During a race the player's own movement keys do nothing and the socket moves the runner.
- Cadence per distance, no tiring (first open point): 100 m 170 ± 40 ms between steps, top 9.5 m/s; 400 m 200 ± 45 ms, 8.5 m/s; 1 500 m 260 ± 60 ms, 7.0 m/s. A step in the window aims at top speed; rushing aims at 50 %, the same foot twice at 30 %, a late step falls linearly to 0 over one more target step; 2.5 target steps without a step stop the runner. Speed moves towards the aim at +4 m/s² and −5 m/s². A perfect 100 m runs in about 11.9 s.
- "On your marks" at kick-off, "Set" 4 s later, the beep 5 to 7 s after kick-off (random, server clock). A step before the beep is a false start. Time limits after the beep: 40 s, 150 s, 480 s, then `time` (did not finish).
- A runner who leaves, disconnects or is knocked out does not finish (`rejoinGraceMs` 0).
- The stand is a solid block (no climbing, no seats to sit on yet); spectators watch from the paved strip in front of it.
- Running spikes (`gear_running_spikes`, 260 cash) are sold at Summit Sports on the east folded clothes table (model `decor/running_spikes`, from `make model` with the full shape model, 1 500 triangles; a strict side view was tried and drew legs under the shoe, so the three-quarter view was kept). During a race the socket shows the worn piece `wear/shoes/running_spikes` on the runner through `player.sportsWear` (the shown appearance, like the police uniform) and takes it off when the race ends or the runner leaves.
- Each step plays a crisp tock when it lands in the window and alternates feet, a dull thud otherwise (`sfx/running/`, judged on the client for feedback only; the socket judges the speed).
- A scoreboard stands in the infield at (−436, −342) facing the stand (`scoreboard` in `running.json`). Within 140 m it shows the live ranking during a race (finished by time, then runners by gates passed, the disqualified last), then the results for 10 s. With no race, within 40 m it shows the week's top 3 per distance.
- Weekly boards are the core's `run_100`, `run_400`, `run_1500` (`SportsBoardService`, `GET /api/sports/boards/{board}`, `docs/sports/CORE.md`): best finished time per runner this week, solo races included, and the weekly `sports_champion` badge. The scoreboard reads the board ids from `boards` in `running.json`.
- Tasks (thresholds from the `game-designer`): `races_run` counts finished races, tiers 10 / 50 / 200; `fast_400` counts 400 m races under 52 s, tiers 1 / 10 / 50. Only matches Laravel marks `counts_for_tasks` count (core anti-farm: 2 accounts older than 72 h, at most 3 matches per pair a day), so a solo race shows on the board but does not count for the tasks. Counted when a new race is recorded, so a replayed result counts once.
- Outdoor football (`athletics_football`) runs on the gym football code with `sports/athletics/pitch.json` (`walls: false`, throw-ins, no baskets), in the zone `sports_athletics`, signed up at the same `athletics_coach`. Races and football share the play area id `athletics_field`, so only one of them runs at a time (`sports_venue_busy`).
- Outdoor formats are the gym's 2 v 2 to 5 v 5 (decided 2026-11-14): the coach panel reads one sign-up spec per sport file, so 7 v 7 outdoors needs per-venue options in the core panel first. 5 v 5 fits the 55 × 35 m pitch.
- Free play on the pitch: the athletics coach lends a football (`gym_ball`, same panel as the gym coach, football only); it is taken back during a race or a match on the field, and a ball leaving the pitch comes back on the line.
- Animations (other players only, driven by `sports_run_state`): `RunSet` crouch while set (left foot forward, the usual standing start), `RunLean` dip at the finish, then `Breathless` for 6 s (hands on knees, the clearest read of being out of breath from afar); the run cycle is the existing Run clip matched to the server speed.

## Socket messages

| Message | Direction | Payload |
|---|---|---|
| `sports_run_step` | client → server | `{ foot: 'left' \| 'right' }`, the runner's own session only; steps closer than 40 ms are ignored |
| `sports_run_look` | client → server | `{ ry: number }` (radians, finite, wrapped to −π..π), the runner's heading |
| `sports_run_state` | server → runners and players in `sports_athletics`, every 100 ms | `{ venue, distanceM, laps, gateCount, phase: 'marks' \| 'set' \| 'running', beepAt: ms \| null (null before the beep), endsAt: ms \| null, serverNow, goodStepMs, toleranceMs, runners: [{ sessionId, name, lane, x, z, ry, speed, quality, lastStepAt, state: 'set' \| 'running' \| 'finished' \| 'dnf', lap, next: { x, z } \| null, timeMs: int \| null, dnf: 'false_start' \| 'missed_gate' \| 'left' \| 'knocked_out' \| 'time' \| null }] }` |
| `sports_run_result` | server → same | `{ venue, distanceM, results: [{ sessionId, name, accountId, result: 'finished' \| 'dnf', place?, timeMs?, dnf }] }`, then `POST /api/sports/matches` with the same results |

At kick-off each runner gets a `position_correction` with reason `race_start` on its start spot. While a runner is set or running, the socket ignores its `move` messages.

## Open points

- Relay and other distances were not chosen.

## Proposed placeholder JSON fields

`sport` ("running"), `track` (centre line, `gates` positions per distance, start and finish lines), `distancesM` ([100, 400, 1500]), `maxPlayers` (8), `startBeepDelayRangeMs`, `falseStart` ("disqualify"), `stride` (goodCadenceMs, toleranceMs, speedCurve), `gear` (["running_spikes"]), `coachId`, `boards` (["run_100", "run_400", "run_1500"]), `tasks` (["races_run", "run_400_time"]).
