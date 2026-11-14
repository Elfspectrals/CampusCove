# Cove Gymnasium: football and basketball

The `sports_gym` venue (footprint x −467 → −404, z −231 → −191, [MASTER_PLAN.md](MASTER_PLAN.md) § 6). How the two
sports play: [football.md](football.md), [basketball.md](basketball.md). Shared core: [CORE.md](CORE.md).

## Building

| Piece | Where |
|---|---|
| Hall 48 × 27.8 m (court 44 × 24 + run-off), 9 m high, high windows on both long sides | interior, `build_sports_gym.py` |
| 4 rows of stands on the north side, 2 stairs, a 1.1 m barrier, a 1.4 m coach aisle in front of the stands | interior |
| Lobby (door on the west face at z −211), changing room, store | interior |
| Futsal goals 3 × 2 m on the end lines, hoops with the rim 1.575 m in from the end lines, board 1.2 m | interior |
| 4 side hoops on the south wall for free play (cross-court, 8 and 16 m either side of the halfway line) | interior |
| Shell, roof, sign, fire exit on the SE street side | `build_sports_gym_ext.py` |
| Lawn, entrance apron from the promenade door stub, exit path, lamps, benches, hedges | `build_sports_gym_site.py` |
| Decor pack, editor category Sports: `gym_team_bench`, `gym_ball_rack` | `build_sports_gym_decor.py` |
| Coach NPC (`"coach": "gym_coach"`) and first dressing | `front/public/assets/zones/sports_gym.json` |

Build order (headless Blender, `exec(open(p).read(), {"__file__": p})`): `build_sports_gym.py` (runs the exterior
too), `build_house_lightmaps.py -- work sports_gym`, `build_sports_gym_site.py`, `build_sports_gym_decor.py`; then
from `front/`: `npm run assets:optimize -- work sports_gym`, `-- park sports_gym`, `-- decor gym_team_bench gym_ball_rack`,
`node scripts/apply-decor-collision.mjs public/assets/decor/<key>/model.glb` for each decor key,
`node scripts/apply-sports-gym.mjs` and `npm run zone:prices`.

The rules files are read by the build: `football.json` `venues[gym_court]` (court and goal size) and `basketball.json`
`court` (rim height and radius, board, three-point radius).

## Court contract: `front/public/assets/sports/gym/court.json`

Written by `apply-sports-gym.mjs` from the site layout (the Blender build owns the geometry); read by the socket
(`readGymCourt`, `parseGymCourt`) and the front (`parseGymCourtView`). Game space, metres.

| Field | Type | Meaning |
|---|---|---|
| `floorY`, `ceilingY` | number | hall floor (0.2) and ceiling |
| `arena` | bounds | walls the ball bounces off (barrier, south wall, lobby wall, east wall) |
| `playArea` | bounds | reserved during a match (`registerVenue`), kept inside the walls so a pushed-out player stays in the hall |
| `court` | bounds | the painted lines, inside `arena` |
| `centre`, `coach` | `{ x, z }` | kick-off spot, coach spot (aisle, halfway line) |
| `goals.red`, `goals.blue` | `{ lineX, inward: 1 \| -1, minZ, maxZ, height, depth }` | the goal that team attacks; a goal is the ball crossing `lineX` in the `inward` direction inside the mouth; posts, bar and nets (`depth` behind the line) are solid for the ball |
| `baskets.red`, `baskets.blue` | `{ x, y, z, rimRadius, board: { minX, maxX, minY, maxY, minZ, maxZ }, threePointRadius }` | the basket that team attacks, its rim and its backboard box |
| `sideBaskets` | list of `{ x, y, z, rimRadius, board }` | the free-play hoops; no score |

Red attacks east (+x), blue attacks west. Sides do not swap at half time.

## Socket

Venues `gym_football` and `gym_basketball`, one coach `gym_coach`, shared play area `gym_court` (one match at a time on
the court). Registered at boot by `loadGymVenues()` (`socket/src/sports/gymVenues.ts`, called from `server.ts`), since
the rules are read over HTTP. Logic: `gymBall.ts` (ball physics, exact parabolic step, rims and boards), `gymMatch.ts`
(possession, actions, scoring), `gymRules.ts` (rules parsing), `gym.ts` (room glue).

| Message | Direction | Payload |
|---|---|---|
| `gym_action` | client → server | `{ kind: 'pass' \| 'shot_start' \| 'shot_release' \| 'tackle' \| 'jump' }`; ignored unless the sender is an active player of the running gym match; at most one every 60 ms (a release always passes) |
| `gym_state` | server → players and everyone in `sports_gym`, every 100 ms | `{ venue, sport, ball: [x, y, z, vx, vy, vz], owner: sessionId \| null, score: { red, blue }, half, halves, endsAt, restartTeam, players: [{ sessionId, team }], serverNow }` |
| `gym_event` | same | `{ venue, kind: 'score', team, points, dunk, scorer: name \| null, sessionId }`, `{ kind: 'kick', shot }`, `{ kind: 'tackle' \| 'steal', won }`, `{ kind: 'block' }`, `{ kind: 'half', half }` (each with `sessionId` of the player) |
| `gym_end` | same | `{ venue, sport, score, winner: team \| null, reason: 'finished' \| 'forfeit' }` |
| `gym_ball` | client → server | `{ sport: 'football' \| 'basketball' }` within 3 m of the coach and while no gym match runs: lends one free-play ball (core loan `gym_ball`, area `sports_gym`), replacing the player's previous one; it appears on the court in front of the coach |
| `gym_ball_return` | client → server | `{}`: gives the player's ball back |
| `gym_free` | server → everyone in `sports_gym`, every 100 ms while balls exist | `{ balls: [{ id, sport, lender: sessionId \| null, ball: [x, y, z, vx, vy, vz], owner: sessionId \| null }], serverNow }` |
| `gym_error` | server → client | `{ code: 'gym_too_far' \| 'gym_court_busy', message }` |

Free play: anyone on the court takes a loose ball by running into it and uses the same `gym_action` intents on the ball they hold or the nearest loose one within 2 m; no team, no score, every hoop and goal is free. A ball disappears when its lender gives it back, leaves the gym, disconnects or dies, and every free ball is taken back when a match kicks off.

Ball physics: walls, floor and ceiling, goal posts, bar and nets, backboards and rims, and every player as a 0.35 m cylinder up to 1.9 m (the kicker is ignored for 350 ms). The ball sub-steps so it never moves more than half its radius per step.

A missed tackle puts the player down: the socket refuses their moves for the tackle's `groundMs` (move rejection `tackled`) and the front freezes them for the same time.

The client never sends a direction, a power or a time: the aim is the player's `ry` known to the socket, shot power
and the basketball meter come from the socket clock between `shot_start` and `shot_release` (held over 5 s is ignored),
steals and dunks are rolled by the socket. Results go to `POST /api/sports/matches` through `recordMatch` with
`score` = goals (football) or points (basketball) per player; a player out of the match records `dnf`. No coins.
Then the socket sends the feats to `POST /api/sports/gym/tasks` (tasks in [../TASKS.md](../TASKS.md)): matches played, hat tricks (3 goals or more), sharpshooter matches (5 three-pointers or more), once per match `ref`.
The gym tasks count every recorded match and ignore the core's `counts_for_tasks` anti-farm flag (decided 2026-11-14).

## Decisions taken in this venue

- Football needs 4 players (2 v 2, `minPlayers`), basketball 2 (1 v 1). Gym football formats 2 v 2 to 5 v 5: the
  `football.json` sign-up lists only these until the outdoor pitch gets its own options.
- 2 × 4 min is `durationSec: 480` with `halvesByDurationSec: { "480": 2 }`: blue kicks off the second half from the centre.
- A tackle takes the ball when it is within 1.8 m in a 70° cone in front, else the tackler is down 0.8 s; cooldown 3 s.
- Only a free ball is picked up by running into it; an owned football is only won by a tackle, an owned basketball by a steal.
- Basketball shot: the meter rises over 0.9 s then falls; inside the good window (18 % of the meter near the rim, 7 % at 12 m)
  the socket removes 80 % of the aim error. A block is an opponent within 1.6 m who jumped in the last 350 ms before the
  release. A dunk is a release within 1.5 m of the rim while moving at 4 m/s or more, 95 % success.
- After a goal or a basket only the conceding team may touch the ball for 3 s (football: centre; basketball: under the basket).

## Animations

Clips on the shared human rig (`front/scripts/skins/clips.py`, table in `docs/animation/skeleton-human.md`): `Kick`, `Shot`, `Tackle`, `Celebrate`, `JumpShot`, `Dunk`, `Block`, `Steal` (one-shots that keep playing while the player moves) and `Dribble` (replaces Walk and Run while a player carries a basketball). Other players see them from the `gym_event` messages (`playAvatarSportsMove`, `setAvatarDribbling` in `glbCharacter.ts`); first person shows no body clip.

## Sounds

`map-src/CampusCove/build_gym_sfx.py` synthesizes `sfx/gym/kick.mp3` (a kick, a shot) and `sfx/gym/bounce.mp3` (a basketball pass and each dribble bounce). Earshot hears both as dry punchy hits, not as a ball; a goal or basket still uses the market bell. No referee whistle and no net swish: the synthesized takes sounded like an error buzz and hi-hats, so they were not shipped.

## Not built yet

- A referee whistle and a net swish (needs real recordings).
