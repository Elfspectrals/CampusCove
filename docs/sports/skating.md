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
