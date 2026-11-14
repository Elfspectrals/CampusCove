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

## Open points

- Cadence curve for the 1 500 m (endurance: does the good cadence drift or tire?).
- Relay and other distances were not chosen.

## Proposed placeholder JSON fields

`sport` ("running"), `track` (centre line, `gates` positions per distance, start and finish lines), `distancesM` ([100, 400, 1500]), `maxPlayers` (8), `startBeepDelayRangeMs`, `falseStart` ("disqualify"), `stride` (goodCadenceMs, toleranceMs, speedCurve), `gear` (["running_spikes"]), `coachId`, `boards` (["run_100", "run_400", "run_1500"]), `tasks` (["races_run", "run_400_time"]).
