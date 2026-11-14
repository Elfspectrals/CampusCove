# Swimming races

The pool is 25 m with 6 lanes (diving pit apart, see [diving.md](diving.md)). Swimming itself (free movement in water) is its own later task; this file covers the timed races on top of it. Outside a race, players swim freely and calmly. Shared rules in [README.md](README.md).

## Rules

- One swimmer per lane, 1 to 6 swimmers.
- Distances chosen by the first player at the coach: **25 m, 50 m or 100 m** (1, 2 or 4 lengths). A length ends by touching the wall.
- Start from the block on a "take your marks" then a beep. A press before the beep is a **false start: that swimmer is disqualified**.
- Finish order and times decided by the socket.

## Controls

- **Start**: the dive key after the beep; the reaction time is measured.
- **Stroke**: alternate two keys (left / right) in rhythm. A steady cadence in the good window speeds up; too fast or out of step loses speed. Same family as Drink Fast.
- **Turn**: at the wall the swimmer turns on their own (proposed: a well-timed press at the wall gives a better push-off).
- No steering: a racer stays in their lane.

## Flow

Sign-up at the pool coach → choose distance → kick-off rules of the README (a solo race starts after the countdown) → swimmers teleported to their block → marks, beep → race → results board for 10 s → back to free swimming.

## HUD

Lane number, length counter ("2/4"), race clock, cadence bar with its good window, reaction time at the start, final place and time.

## Server authority

- The socket replays the stroke inputs on its own clock (as Drink Fast) and owns speed, position in the lane, wall touches, finish times and false starts.
- The client only sends key down / key up with no timestamps trusted.

## Gear

**Swimsuit required** to enter the pool water (race or free swimming). Without one, an invisible edge blocks the player with a "swimsuit required" message.

## Rewards

- Weekly board per distance (25, 50, 100 m), solo times count. The first of each board gets the dated badge.
- Task "races swum"; feat task proposal: 50 m under a target time.

## Animations

Block stance, start dive, front crawl in the water, wall turn, finish touch. Calm free-swimming crawl and treading water belong to the swimming task.

## Failure cases

- Leaving the lane or the water during a race: did not finish.
- Disconnect: did not finish (no grace in a solo timed race).

## Decided at build time (2026-11-14)

- Free swimming is a wade: the water of the basin and the pit has a walk floor at -1.3 m (water surface -0.3 m), so the head stays out of the water; real swimming movement is the later swimming task. Steps lead out of the basin at both ends and out of the pit.
- Stroke model (`socket/src/sports/swimRace.ts`, values in `swimming.json`): the dive after the beep glides 3 m at 1.8 m/s; a stroke in the window 450 +/- 150 ms after the previous one, on the other side, adds 0.55 m/s up to 2.2 m/s; a slower one adds 0.25 m/s; the same side twice or a faster one multiplies the speed by 0.6; the water slows the swimmer by 60 % of the speed per second. A steady good cadence swims 25 m in about 13 s.
- The turn is automatic, no bonus (`turnBonus` 0).
- The beep comes 1.5 to 3 s after "take your marks", rolled by the socket. Reaction time is measured from the tick that sent the beep.
- A race stops after 60 s per length; whoever is still swimming did not finish.
- Swimsuit check at the water edge: the socket asks Laravel once when the player enters the pool zone (`ownedGear`) and refuses a move into the water without one (`no_swimsuit`). Leaving the water is always allowed.

## Socket contract

| Message | Direction | Payload |
|---|---|---|
| `pool_dive` | client -> server | `{}`, the dive key of a signed-up swimmer on the block |
| `pool_stroke` | client -> server | `{ side: 'left' \| 'right' }` |
| `pool_race_start` | server -> swimmers and players in the pool | `{ venue, distanceM, lengthM, lanes: [{ sessionId, name, lane }], serverNow }` |
| `pool_race_beep` | server -> same | `{ venue, serverNow }` |
| `pool_race_state` | server -> same, every sports tick | `{ venue, clockMs \| null, swimmers: [{ sessionId, lane, phase, distanceM, x, z, length, lengths, speedMps, reactionMs, timeMs }] }` |
| `pool_stroke_result` | server -> the swimmer | `{ result: 'started' \| 'good' \| 'slow' \| 'off' \| 'false_start', reactionMs }` |
| `pool_race_result` | server -> same | `{ venue, distanceM, results: [{ sessionId, name, lane, status, place, timeMs, reactionMs }] }` |

`phase` / `status`: `marks`, `swimming`, `finished`, `disqualified`, `dnf`. The socket places the swimmers (`position_correction` reason `pool_block` at kick-off, then their position each tick); the client locks its movement while it is on the block or swimming. The match is recorded with `result: 'finished'`, `place` and `timeMs`, or `dnf` (a false start is a `dnf`).

## Proposed placeholder JSON fields

`sport` ("swimming"), `pool` (lengthM 25, `lanes` 6, lane positions, block positions, water volume and depths, exits), `distancesM` ([25, 50, 100]), `minPlayers` (1), `maxPlayers` (6), `startBeepDelayRangeMs`, `falseStart` ("disqualify"), `stroke` (goodCadenceMs, toleranceMs, speedCurve), `turnBonus`, `gear` (["swimsuit"]), `coachId`, `boards` (["swim_25", "swim_50", "swim_100"]), `tasks` (["races_swum", "swim_50_time"]).
