# Swimming races

The pool is 25 m with 6 lanes (diving pit apart, see [diving.md](diving.md)). Free swimming (moving in the water, under water, breath) is described in [Free swimming](#free-swimming); the rest of this file covers the timed races on top of it. Shared rules in [README.md](README.md).

## Rules

- One swimmer per lane, 1 to 6 swimmers.
- Distances chosen by the first player at the coach: **25 m, 50 m or 100 m** (1, 2 or 4 lengths). A length ends by touching the wall.
- Start from the block on a "take your marks" then a beep. A press before the beep is a **false start: that swimmer is disqualified**.
- Finish order and times decided by the socket.

## Controls

- **Start**: the dive key after the beep; the reaction time is measured.
- **Stroke**: a rhythm game, like the dance one. Notes fall in three lanes, left arm (move left or the left arrow), right arm (move right or the right arrow) and, every eighth note, a breath (the jump key). A note hit on time speeds the swimmer up, a missed note or a press with no note slows them down, and the notes come faster as the race goes on.
- **Turn**: at the wall the swimmer turns on their own (proposed: a well-timed press at the wall gives a better push-off).
- No steering: a racer stays in their lane.

## Flow

Sign-up at the pool coach → choose distance → kick-off rules of the README (a solo race starts after the countdown) → swimmers teleported to their block → marks, beep → race → results board for 10 s → back to free swimming.

## HUD

Lane number, length counter ("2/4"), race clock, the three note lanes with the label of the last note (Perfect, Good, Missed, Out of step), reaction time at the start, final place and time. In the race the body faces down the lane (the look is set by the game), so the third-person view sits behind the swimmer.

## Server authority

- The socket judges each press against the chart on its own clock and owns speed, position in the lane, wall touches, finish times and false starts.
- The client only sends which key was pressed (left, right, breath), with no timestamp. It builds the same chart from `swimming.json` to draw the notes; a note it draws is never judged by the client.

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

- Steps lead out of the basin at both ends and out of the pit. The `Water` walk level at -1.3 m in the layout is only used by those steps; nobody walks on the basin floor (see Free swimming).
- Stroke model (`socket/src/sports/swimRace.ts`, values in `swimming.json`): the dive after the beep glides 3 m at 1.8 m/s and the water slows the swimmer by 60 % of the speed per second. The chart is the same for everyone and depends only on the note number: the first note is 1200 ms after the beep, the next ones 560 ms apart then 4 ms closer each note down to 380 ms (`noteTimeMs`); left and right arm in turn, every eighth note a breath, the arms carrying on after it (`noteKind`). A press is compared with the first note of its lane not yet hit: never counted early, 120 ms of lag forgiven, then Perfect within 70 ms (+0.6 m/s) or Good within 150 ms (+0.45 m/s), up to 2.2 m/s. A note not hit 270 ms after its time is Missed (speed x 0.85); a press with no note in reach, the wrong arm included, is Out of step (speed x 0.8) and leaves the note to be missed. All Perfect swims 25 m in about 12.7 s, all Good in about 15.5 s.
- The turn is automatic, no bonus (`turnBonus` 0).
- What a swimmer can still do during a race, and what happens (decided 2026-11-15, see "Emergent gameplay" in `.claude/rules/global.md`): press before the beep (false start, disqualified); dive late (the notes that passed before the dive are skipped, not missed); press on the block after the beep without diving (ignored); hammer both arms (each press with no note slows the swimmer, so spamming loses); hold a key (one press, key repeat is not sent); hit the next note while the previous one is still in its late window (both count, each in its own lane); skip the breaths (each one is a missed note); move or look around (the socket places the swimmer in the lane and the game sets the look); press after the finish (ignored); leave the pool or disconnect (did not finish). The rules file is refused at boot if one press could reach two notes of the same lane.
- The beep comes 1.5 to 3 s after "take your marks", rolled by the socket. Reaction time is measured from the tick that sent the beep.
- A race stops after 60 s per length; whoever is still swimming did not finish.
- The swimsuit look: knee-length navy swim shorts with a red waistband and side stripe (`wear/bottom/swimsuit`, built in `wear.py` for every body and build). A player with the feet in the pool water is shown in it, with no top, shoes or headwear; women keep the base body's chest band. Out of the water the outfit comes back. It is never sold as clothing: the `gear_swimsuit` item is what the gate checks.
- Animations: `Swim` while moving in the water, `Tread` while still, `Dive` when a racer leaves the block (clips on the base body).
- Swimsuit check at the water edge: the socket asks Laravel once when the player enters the pool zone (`ownedGear`) and refuses a move into the water without one (`no_swimsuit`). Leaving the water is always allowed.

- Tasks (badges only, counted matches only, so never a solo race): "Swimmer" = races swum (every result but `dnf`, and a false start is recorded as `dnf`), tiers 5 / 25 / 100; "Fast lane" = 50 m finished under 30 s, tiers 1 / 5 / 20 (`SportsTaskCounters`).

## Decisions (2026-11-15, gameplay pass after the first review)

- In the pool water the view is third person (see "Camera" in [README.md](README.md)), so the swimmer sees their own
  crawl and tread clips; `U` goes back to first person.
- A swimmer became the placeholder avatar, with no clip: the swimsuit was given to the avatar loader as a key instead of
  its model file (`/assets/wear/bottom/swimsuit/model.glb`). Fixed in `swimwearOutfit`.
- A swimmer is drawn 0.3 m higher than their eye height says (`SWIMMER_LIFT_M`, `useRemoteAvatars`), so the head and the
  recovering arm break the surface: the first-person eye floats 0.15 m above the water while the clips put the head
  0.45 m under the standing eye.

## Free swimming

Decided 2026-11-15: a real pool. The player swims in the water of the basin and the pit, can go under water and holds their breath; nobody walks on the basin floor.

- **Where**: inside a `pool.waterVolume` rect and outside the `pool.exits` stairs, unless a walk level higher than the water stands under the feet (the diving boards over the pit). The exit stairs are walked as before.
- **Floating**: a still swimmer floats with the eyes `swim.floatEyeAboveWaterM` (0.15 m) above the water (`waterY` -0.3 m). Under water, with no vertical input, they rise back at 1 m/s.
- **Moving**: the move keys swim at `swim.speedMps` (2 m/s), the sprint key at `swim.fastSpeedMps` (3 m/s) for the same stamina as sprinting. At the surface, forward follows the look once it points more than 20 degrees down (that is how you dive under); under water forward follows the look in 3D. Jump and crouch (Space, Ctrl) go up and down at `swim.verticalMps` (1.6 m/s). The eyes never go lower than `swim.minEyeAboveFloorM` (0.3 m) above the floor of that water (`floorY`: -2 m in the basin, -4.5 m in the pit).
- **Falling in**: from the deck or a board the player falls with gravity, enters the water with that speed, is slowed by the water (drag 4 per s) and comes back up. A fall into the water never hurts (`onSurvivalMove` resets the fall peak while swimming); the same drop onto the deck does.
- **Under water**: the eyes lower than `swim.underwaterEyeBelowWaterM` (0.05 m) under the surface. The client tints the screen, shortens the fog to 14 m, puts a low-pass on the game sounds and the pool sounds, and plays a bubble sound going under and a breath (a gasp when the breath was below half) coming up.
- **Breath**: owned by the socket (`tickPoolBreath`, every 250 ms, from the last accepted position). Full is `breath.maxMs` (30 s) under water; at the surface or out of the water it refills `breath.refillPerMs` (3) times as fast, so 10 s from empty. The HUD shows the bar while under water or not full; it turns coral under 30 %.
- **Out of breath**: the lifeguard pulls the swimmer out. The socket moves them to the deck 1.2 m south of that water, facing the pool (`teleported`), takes `breath.rescueDamage` (10) health but never the last point (cause `drown`), and sends `pool_rescued`. No knock-out, so no hospital bill, no cash bag, no clothes lost and no respawn elsewhere: drowning is never a free trip or a way to pass money.
- **Water look**: the water material (`TW_SportsPoolWater`) is replaced in the game by a shader (`poolWaterSurface.ts`): moving waves, see-through with more cover at grazing angles, a lighter surface seen from below, and rings where a player swims at the surface (one every 0.7 m, a bigger one on entering), up to 8 at a time. Two flat quads and one fragment loop of 8: the same on every graphics tier.
- **Server checks** (`moveRejection`): a move whose eyes go under `floorY + minEyeAboveFloorM` (less 0.05 m) is refused with `below_pool_floor`; a move that starts swimming and goes further than `fastSpeedMps x 1.25` (times the speed boosts) per second plus 1.5 m is refused with `swim_too_fast`. A diver coming from above is not speed-checked until they swim.

## Socket contract

| Message | Direction | Payload |
|---|---|---|
| `pool_dive` | client -> server | `{}`, the dive key of a signed-up swimmer on the block |
| `pool_stroke` | client -> server | `{ side: 'left' \| 'right' \| 'breath' }` |
| `pool_race_start` | server -> swimmers and players in the pool | `{ venue, distanceM, lengthM, lanes: [{ sessionId, name, lane }], serverNow }` |
| `pool_race_beep` | server -> same | `{ venue, serverNow }` |
| `pool_race_state` | server -> same, every sports tick | `{ venue, clockMs \| null, swimmers: [{ sessionId, lane, phase, distanceM, x, z, length, lengths, speedMps, reactionMs, timeMs }] }` |
| `pool_stroke_result` | server -> the swimmer | `{ result: 'started' \| 'perfect' \| 'good' \| 'miss' \| 'stray' \| 'false_start', index: note number \| null, reactionMs }`; `miss` is sent when the note expires |
| `pool_race_result` | server -> same | `{ venue, distanceM, results: [{ sessionId, name, lane, status, place, timeMs, reactionMs }] }` |
| `pool_breath` | server -> the swimmer, every 250 ms while under water or not full, once more when full | `{ breathMs, maxMs, underwater }` |
| `pool_rescued` | server -> the swimmer | `{}`, after the `teleported` to the deck |
| `move` | client -> server | unchanged; the eye height `y` is free in the water and checked as above (`position_correction` reasons `swim_too_fast`, `below_pool_floor`) |

`phase` / `status`: `marks`, `swimming`, `finished`, `disqualified`, `dnf`. The socket places the swimmers (`position_correction` reason `pool_block` at kick-off, then their position each tick); the client locks its movement while it is on the block or swimming. The match is recorded with `result: 'finished'`, `place` and `timeMs`, or `dnf` (a false start is a `dnf`).

## Proposed placeholder JSON fields

`sport` ("swimming"), `pool` (lengthM 25, `lanes` 6, lane positions, block positions, water volume and depths, exits), `distancesM` ([25, 50, 100]), `minPlayers` (1), `maxPlayers` (6), `startBeepDelayRangeMs`, `falseStart` ("disqualify"), `stroke` (boostMps perfect and good, missFactor, strayFactor, maxSpeedMps, dragPerS), `rhythm` (leadInMs, intervalMs [first, last], fasterPerNoteMs, breathEvery, windowsMs perfect and good, allowanceMs), `turnBonus`, `gear` (["swimsuit"]), `coachId`, `boards` (["swim_25", "swim_50", "swim_100"]), `tasks` (["races_swum", "swim_50_time"]).
