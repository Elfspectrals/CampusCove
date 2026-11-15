# Cove Gymnasium: football and basketball

The `sports_gym` venue (footprint x −467 → −404, z −231 → −191, [MASTER_PLAN.md](MASTER_PLAN.md) § 6). How the two
sports play: [football.md](football.md), [basketball.md](basketball.md). Shared core: [CORE.md](CORE.md).

## Building

| Piece | Where |
|---|---|
| Hall 48 × 27.8 m (court 44 × 24 + run-off), 9 m high, high windows on both long sides | interior, `build_sports_gym.py` |
| 4 rows of stands on the north side, 2 stairs, a 1.1 m barrier, a 1.4 m coach aisle in front of the stands | interior |
| Lobby (door on the west face at z −211), changing room, store | interior |
| Futsal goals 3 × 2 m on the end lines, hoops with the rim 1.575 m in from the end lines, board 1.2 m. Goal and hoop are `make model` pieces (`AI_GOAL`, `AI_HOOP`) fitted to the physics: each goal stretched to its 3 × 2 × 1 m box, each hoop scaled to the board width and moved until the rim found by ray casts lies within 5 cm of the contract rim; the main hoops hang on steel beams from the end walls | interior |
| 4 side hoops on the south wall for free play (cross-court, 8 and 16 m either side of the halfway line) | interior |
| Shell, roof, sign, fire exit on the SE street side | `build_sports_gym_ext.py` |
| Lawn, entrance apron from the promenade door stub, exit path, lamps, benches, hedges | `build_sports_gym_site.py` |
| Decor pack, editor category Sports: `gym_football` (truncated icosahedron built in code), `gym_basketball`, `gym_team_bench`, `gym_ball_rack`, `gym_ball_cart`, `gym_lockers`, `gym_scoreboard` (`make model`, posterized palette) | `build_sports_gym_props.py` |
| Coach NPC (`"coach": "gym_coach"`) and first dressing | `front/public/assets/zones/sports_gym.json` |

Build order (headless Blender, `exec(open(p).read(), {"__file__": p})`): `build_sports_gym.py` (runs the exterior
too), `build_house_lightmaps.py -- work sports_gym`, `build_sports_gym_site.py`, `build_sports_gym_props.py`; then
from `front/`: `npm run assets:optimize -- work sports_gym`, `-- park sports_gym`, `-- decor gym_football gym_basketball gym_team_bench gym_ball_rack gym_ball_cart gym_lockers gym_scoreboard`,
`node scripts/apply-decor-collision.mjs public/assets/decor/<key>/model.glb` for each decor key,
`node scripts/apply-sports-gym.mjs` and `npm run zone:prices`.

The rules files are read by the build: `football.json` `venues[gym_court]` (court and goal size) and `basketball.json`
`court` (rim height and radius, board, three-point radius).

## Court contract: `front/public/assets/sports/gym/court.json`

Written by `apply-sports-gym.mjs` from the site layout (the Blender build owns the geometry); read by the socket
(`readGymCourt`, `parseGymCourt`) and the front (`parseGymCourtView`). Game space, metres.

| Field | Type | Meaning |
|---|---|---|
| `walls` | boolean | `true` in the hall: the ball bounces off `arena`. `false` on an open pitch (`sports/athletics/pitch.json`): a ball or a carrier leaving `court` comes back on the line, 0.3 m inside; in a match it is a throw-in for the team that did not touch it last |
| `floorY`, `ceilingY` | number | hall floor (0.2) and ceiling |
| `arena` | bounds | walls the ball bounces off (barrier, south wall, lobby wall, east wall) |
| `playArea` | bounds | reserved during a match (`registerVenue`), kept inside the walls so a pushed-out player stays in the hall |
| `court` | bounds | the painted lines, inside `arena` |
| `centre`, `coach` | `{ x, z }` | kick-off spot, coach spot (aisle, halfway line) |
| `goals.red`, `goals.blue` | `{ lineX, inward: 1 \| -1, minZ, maxZ, height, depth }` | the goal that team attacks; a goal is the ball crossing `lineX` in the `inward` direction inside the mouth; posts, bar and nets (`depth` behind the line) are solid for the ball |
| `baskets.red`, `baskets.blue` | `{ x, y, z, rimRadius, board: { minX, maxX, minY, maxY, minZ, maxZ }, threePointRadius }` | the basket that team attacks, its rim and its backboard box; absent on a football-only pitch (a basketball venue refuses a court without baskets) |
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

Free play is a list of courts (`addGymFreeCourt`: id, court, sports lent, zone, busy rule): the gym lends footballs and basketballs, the athletics coach lends footballs on the outdoor pitch (busy during a race or a football match there). The coach the player stands near picks the court; the ball spawns inside its arena, on the coach side, and `gym_free` tags each ball with its `court`. Anyone on the court takes a loose ball by running into it and uses the same `gym_action` intents on the ball they hold or the nearest loose one within 2 m; no team, no score, every hoop and goal is free. A ball disappears when its lender gives it back, leaves the gym, disconnects or dies, and every free ball is taken back when a match kicks off.

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
- Basketball shot, forgiving on purpose (after the first test, 2026-11-14, in the spirit of NBA 2K): the meter rises over
  0.9 s then falls. A release in the good window (30 % of the meter near the rim, 15 % at 12 m) always scores: the socket
  removes all of the aim error and all timing error. The top 40 % of the window is "Perfect", the rest "Good"; outside it
  is "Early" or "Late", and the socket then removes half the aim error and lets the ball land short or long by a quarter
  of the timing error. The rim is softer (restitution 0.4). The shooter sees the label after each shot.
- A block is an opponent within 1.6 m who jumped in the last 350 ms before the release. A dunk is a release within 1.5 m
  of the rim while moving at 4 m/s or more, 95 % success.
- Football (after the first test): the ball is 0.18 m in radius (bigger than a real futsal ball, to see who has it), a
  pass leaves at 8 m/s and a shot at 8 to 17 m/s. A coloured ring on the floor marks whoever holds a ball: the team
  colour in a match, yellow in free play.
- The changing-room lockers stand against its west wall, clear of the door.
- Hat trick tiers 1 / 10 / 40 (economist, 2026-11-14): a 2 v 2 gives a hat trick often, so 1 / 5 / 25 made its gold
  easier than the matches-played gold.
- Not built, on purpose: a half-court 3 v 3 on the side hoops (it would overlap the main court, which runs one match at a
  time; the side hoops stay free play), and players blocking each other's movement (a game-wide movement change, not a
  gym file; the ball already bounces off players).
- Venues register at boot from `server.ts` (`loadGymVenues()`), not by an import in `sports/index.ts`: their rules are
  read over HTTP at boot, and reading them at import breaks the socket tests that import the index.
- After a goal or a basket only the conceding team may touch the ball for 3 s (football: centre; basketball: under the basket).
- In first person your dribbled basketball rises into view at the top of each bounce (0.9 m ahead, 1.1 m high), and the football you carry shows at your feet as soon as you look down. No HUD line says you have the ball (decided 2026-11-15: the ball on screen says it).

## Decisions (2026-11-15, gameplay pass after the first review)

The review found the basketball controls hard and the aim weird. NBA 2K never asks the player to aim (the shot is locked
on the rim, one timing input); `mike007jd/vibebasketball` and the NBA Hangtime source decide the outcome first and aim
the arc after.

- **No aiming**: `missAimAssist` goes from 0.5 to 1. A missed release no longer follows the look: it flies on the line to
  the rim, short when early, long when late, with the small random side error only.
- **Third-person view** (see "Camera" in [README.md](README.md)) for a player of a gym match and for a player whose own
  ball is out in free play; `U` goes back to first person. In that view the ball is drawn in the hand or at the foot of
  the player's own avatar, which plays the same clips and wears the same team jersey as the others see.
- **Target ring**: while a player holds a basketball, a yellow ring sits on the rim the shot will go to: the team's basket
  in a match, in free play the hoop the socket picks (`hoopAhead`, the same rule as `targetHoop`: nearest, a hoop behind
  counting up to three times its distance).
- **Free play meter**: the good window is drawn on the meter in free play too (it was only drawn in a match).
- **Goals and hoops facing the court**: the build turned each goal and hoop with `rotation_euler`, which Blender ignores on an object imported from glTF (its rotation mode is quaternion), so none was turned: the west goal and the west hoop faced the wall, and the four side hoops stood sideways, off their wall arm. `face_and_fit` now sets the rotation mode first. Interior rebuilt, lightmap baked again, `court.json` rewritten (the west backboard is now 0.67 m behind its rim like the east one, it was 0.35 m).

## Animations

Clips on the shared human rig (`front/scripts/skins/clips.py`, table in `docs/animation/skeleton-human.md`): `Kick`, `Shot`, `Tackle`, `Celebrate`, `JumpShot`, `Dunk`, `Block`, `Steal` (one-shots that keep playing while the player moves) and `Dribble` (replaces Walk and Run while a player carries a basketball). Other players see them from the `gym_event` messages (`playAvatarSportsMove`, `setAvatarDribbling` in `glbCharacter.ts`); first person shows no body clip.

## Sounds

`map-src/CampusCove/build_gym_sfx.py` synthesizes `sfx/gym/kick.mp3` (a kick, a shot) and `sfx/gym/bounce.mp3` (a basketball pass and each dribble bounce). `sfx/gym/whistle.mp3` (a match kicks off, a goal, half time, full time) and `sfx/gym/swish.mp3` (a basket) are cut with ffmpeg from two Creative Commons 0 recordings on Freesound: "Referee whistle blow, gymnasium" by SpliceSound (218318) and "Basketball dribbling and shooting" by OBXJohn (262506, from 5.78 s, 1.23 s long).

## Scoreboard

The `gym_scoreboard` decor on the east wall carries a live screen: `court.json` `scoreboard` (`x, y, z, width, height, facing`) is the screen rectangle, and the front draws the teams' scores and the clock on a canvas plane there during a match.

## Playtest (2026-11-15)

Played on a separate local stack with one browser player and three socket bots. Seen:
- the hall, with the AI goals and hoops and the live scoreboard;
- free play: a borrowed basketball and a borrowed football, and a perfect shot that dropped through the hoop;
- the coach sign-up screen;
- a 1 v 1 basketball match, ended by forfeit: a 2-pointer, a 3-pointer from the browser with the "Good" label, the "+2" pop, opponents in the team jersey, the scoreboard following the score;
- a 2 v 2 football match to full time: a goal, a won tackle, the scoreboard.

Checked in the database: `football_matches` +1 for all four players; the forfeited player gets no basketball count.

Also checked:
- an admin grant of the red team jersey;
- wearing it from the inventory, and other players receiving its model.

Second session, same day:
- a football carried in first person shows at your feet when you look down;
- a day pass bought from the clerk at the reception: 40 cash taken, the end of the pass moved one day later on the panel;
- the blue team jersey put in the basket at Summit Sports and paid at the counter: 110 cash taken (`shop_purchase`);
- a missed tackle from the browser: the player stands still for about 0.8 s, then walks again; a bot's moves are refused with `tackled` for the same time;
- a bot's hat trick in a 2 v 2 football match (3-0 at full time): `hat_tricks` 1, Hat trick bronze reached and `task_done` sent;
- a bot's five three-pointers in a 1 v 1 basketball match (15-0), watched from the spectator HUD: `sharpshooter_matches` 1, Sharpshooter bronze reached and `task_done` sent.
