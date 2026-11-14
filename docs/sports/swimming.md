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

## Open points

- Cadence window and speed curve (to be tuned like Drink Fast, with a golden test shared by front and socket).
- Does the turn timing matter, or is it automatic?

## Proposed placeholder JSON fields

`sport` ("swimming"), `pool` (lengthM 25, `lanes` 6, lane positions, block positions, water volume and depths, exits), `distancesM` ([25, 50, 100]), `minPlayers` (1), `maxPlayers` (6), `startBeepDelayRangeMs`, `falseStart` ("disqualify"), `stroke` (goodCadenceMs, toleranceMs, speedCurve), `turnBonus`, `gear` (["swimsuit"]), `coachId`, `boards` (["swim_25", "swim_50", "swim_100"]), `tasks` (["races_swum", "swim_50_time"]).
