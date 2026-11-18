# Tennis

Two outdoor courts, with a tennis coach between them. Shared rules in [README.md](README.md).

## Rules

- Singles or doubles, chosen by the first player at the coach, with the format:
  - **one short set**: first to 4 games, tie-break at 3–3;
  - **one tie-break** to 7 points (2 clear).
- Scoring 15-30-40-game inside a set.
- **Simplified faults**: no service box fault, any ball that lands in the opponent's half is good. A ball out, in the net or that bounces twice loses the point. Serves alternate as usual.

## Controls

- The view is third person from behind the player's baseline (see "Camera" in [README.md](README.md)); the body always faces the net.
- **Only the movement keys move the player** (walk 5 m/s, sprint 8.5 m/s): the camera faces the net, so forward goes to the net and the side keys run along the baseline. A mark on the court shows where to stand for the incoming ball.
- **Left click to swing**. The swing can be started up to 350 ms before the ball passes; the timing and how close the ball passes give power and accuracy.
- **The mouse moves a yellow target** on the opponent's half: the ball is sent there.
- **Right click**: lob.
- Serve: the same click on a ball toss.

## Flow

- **Free play**: hit balls with a friend, balls lent by the court.
- **Structured match**: sign-up at the tennis coach, one court reserved for the match, the other stays free.

## HUD

Score (games and points), server indicator, "Hit!" cue from 180 ms before the ball passes closest, a label after each of the player's shots (Perfect, Good, Early, Late), a white ring where the incoming ball will bounce, a shadow under the ball, the yellow target, "Out" call on the court. On an `out` call the ball leaves a mark where it landed (the `ball` of the point state starts at the landing spot), lying along its path; it stays 2.5 s then fades out over 1.5 s. The mark only shows the socket's call, it never decides it.

## Server authority

The socket simulates the ball (flight, bounce, net), judges in / out, net and double bounce, and the hit: it checks the player's position and the click time on its own clock against the ball position. The client sends click time and aim spot only.

## Gear

**Racket bought** at the mall sports shop, held in hand. Balls lent by the court.

## Rewards

Task "matches played"; feat task proposal: win a set 4–0. No weekly board.

## Animations

Ready stance, side step, forehand, backhand, lob, serve, celebration.

## Failure cases

Leaver past the 10 s grace: the other side wins. While a player of the match is away the serve waits: neither a click nor the automatic toss starts a point, and the wait before the automatic toss starts again when they are back; a ball already in play finishes its point.

## Decisions (2026-11-14, building session)

- **Hitting window**: the socket looks back 150 ms from the moment it receives the click and takes the closest point of the
  ball's path within 1.6 m of the player (ball height up to 2.8 m, on the player's half). Within 0.6 m the shot is perfect;
  from 0.6 m to 1.6 m the quality falls linearly to 0. Quality sets the speed (drive 10 to 20 m/s, lob 6.5 to 8.5 m/s,
  serve 12 to 22 m/s) and the accuracy: a shot of quality q lands up to (1 − q) × 4 m long, along its line.
- **Serve**: the first click tosses the ball (1.8 m, 5 m/s up), the second click within 250 ms of the top of the toss
  serves; the timing gives the quality. A toss left to fall gives the point to the receivers. A server who waits 10 s
  tosses automatically.
- **Doubles**: either partner hits; once a side has hit, the ball belongs to the other side, so partners cannot both hit
  the same ball. The serve rotates between partners each time their side serves again.
- **Free play**: a ball basket stands by each court in the coach strip (x −444.7 and −442.3, z −266). A player with a
  valid pass and a racket takes a ball there (lent, taken back on leaving `sports_tennis`). Anyone holding a ball can
  toss and serve on a court with no match and hit the balls coming to their half; no score, the rally ends on the same
  calls as a match and the court is free again after the 2 s pause. A match kick-off on that court stops it.
- **Animations**: `TennisReady` loops while a player plays (match or ball in hand) and stands still; `TennisServe` plays
  at the toss (contact at 0.55 s, the top of the toss is at 0.51 s), `TennisForehand` / `TennisBackhand` on the racket
  side or the other side of the player facing the net, `TennisLob` on a right click, `TennisCelebrate` for the winners.
- No drag; bounce keeps 75 % of the vertical speed and 80 % of the horizontal speed. Lines count as in. A ball that
  catches the net (under 0.914 m between the posts) loses the point.

## Decisions (2026-11-15, gameplay pass after the first review)

The first version asked for a click within 150 ms of a ball passing within 1.6 m, in first person, and was found
impossible. Reworked on the model of Wii Sports Tennis (automatic positioning, the player only swings) and of
`bilalm-19/weblympics` (authoritative server, widened hit window, net-clearing launch):

- **Committed swing**: on a click the socket looks for the point where the ball passes closest to the player (within
  1.8 m, up to 2.8 m high, on the player's half, through the first bounce) from 150 ms before the click. If that point is
  at most 350 ms ahead, the swing is committed and the ball is struck when it gets there; further ahead, the click is a
  miss. One swing at a time per side. 400 ms between two clicks of one player.
- **Quality** = distance quality x timing factor. Distance: 1 within 0.8 m, falling linearly to 0 at 1.8 m. Timing
  (contact time minus click time): 1 from 60 ms late to 200 ms early, falling linearly to 0.5 at 150 ms late and at
  350 ms early. Examples: click 100 ms before contact, ball at 0.5 m: 1; click 275 ms before: 0.75; click 105 ms after:
  0.75; ball at 1.3 m, good timing: 0.5.
- **Label** sent with the shot (`shot.timing`): `early` beyond 200 ms early, `late` beyond 60 ms late, else `perfect`
  from a quality of 0.85, else `good`.
- **Speed** by quality: drive 11 to 19 m/s, lob 6.5 to 8.5 m/s, serve 12 to 20 m/s. A shot still lands up to
  (1 - quality) x 4 m long.
- **Net**: a shot of quality 0.5 or more is given the flight time it needs to cross the net 0.35 m above the tape, and
  still lands where it was aimed. A weaker shot keeps its flat flight and can catch the net.
- **Serve**: any click during the toss serves. Quality = 1 - (time from the top of the toss) / 400 ms, never under 0.3.
- **Auto-run**: removed on 2026-11-18 (see below). It ran the player at 60 % of the walking speed towards where the ball
  would be 350 ms after its bounce, 0.6 m to the side.
- **Free play**: the side (camera, target) is the half the player stands on when they step on the court with a ball, and
  stays until they leave the court.

## Decisions (2026-11-15, after the user's first match)

- **Serve**: at each new serve the socket puts the server 1 m behind their baseline, at their current width kept inside
  the court lines (`position_correction`, reason `tennis_serve`). The front locks their movement while they serve (match:
  from the serve wait to the hit; free play: during their own toss, `tennis_free.server`). The socket only accepts the
  serve hit from a server within 1.0 m of the tossed ball: a server who walked away from the toss could still hit it.
- **Smash**: a fifth timing, earned by being early (second review, 2026-11-15, on the model of the star of Mario Tennis; it was a click in a 100 ms window before). A player is *in position* when the incoming ball will pass within 0.8 m of them at a height they can hit (2.8 m at most), on their half. Standing in position for 1 s without a break (0.6 s until 2026-11-18) charges the shot (`chargeMs`, `trackReady` in `tennisRally.ts`, followed on each sports tick and at the click); stepping out, a new ball or their own shot starts the charge again. A charged drive struck in the perfect window (60 ms late to 200 ms early) with a quality of 0.85 or more leaves at 25 m/s. Examples: in position for 1,000 ms, click 50 ms before the ball: smash; in position for 999 ms: perfect; charged but 201 ms early: early; out and back 300 ms before the click: perfect; a lob is never a smash.
- **A swing at nothing** (decided 2026-11-15, under the "Emergent gameplay" rule): clicking in bursts returned the ball about 6 times in 10 without reading the ring. A click that finds no ball to strike while the ball is coming now costs 700 ms before the next click instead of 400 ms, in a match. Free play keeps 400 ms.
- **Serve ring** (2026-11-15, after the user tested alone and saw no circle: alone only the serve can be played): during the server's own toss the ring is drawn around them, closing as the ball rises; green within 60 ms of the top of the toss (the socket's Perfect), orange within 280 ms, red outside (`serveRing`).
- **Mark on the court**: as soon as the other side hits, a disc of 0.8 m is drawn where the player should stand for that ball (`interceptSpot`: where the ball will be 350 ms after its bounce, 0.6 m to the side so it comes on the racket side); a star 1.5 times wider for a high ball (apex of 4 m or more). It is pale yellow, turquoise once the player is in position, and a white disc grows inside it while the charge builds, purple when it is full. The front shows its own estimate (`inPlace`, `chargeFill`, the same numbers as the socket); the socket decides.
- **Swing ring**: a ring on the ground around that mark (around the player when there is no mark), from 900 ms before the ball passes closest, shrinking from 2.4 m to 0.6 m as it comes. Its colour is what a click now would give: red a miss (more than 350 ms early, more than 150 ms late, or out of reach), orange a weak shot, green a good one, purple a smash (charged). Purple rather than yellow: yellow is the aim target. Front only (`swingRing`, `swingTone`), from the same constants as the socket; a ball passing higher than 2.8 m over the player no longer counts as a pass.

## Decisions (2026-11-18, manual movement)

The user found the auto-run took the player where they had not asked to go. Only the movement keys move a human player
now; robots still run on their own (`tennisRobot.ts`). Nothing else moves them but the socket's serve placement.

- **Run speed** stays at 5 m/s walking, 8.5 m/s sprinting (game-designer review): the widest hard-robot drive leaves
  about 1.5 s from its hit to 350 ms after its bounce, and the run needed to come within reach is about 2.1 m, so
  walking reaches it with time to spare; the sprint is the dash for a ball read late. A faster walk would leave no
  reason to sprint.
- **Mark and ring** are unchanged: the mark is still where full quality comes (0.6 m from the ball, inside the 0.8 m
  sweet spot) and the ring is drawn around it. The charge starts as soon as the player is within 0.8 m of the ball's
  path, before reaching the mark.
- **Smash charge 1 s** (was 0.6 s, chosen 2026-11-18 from the measures below): walking at 5 m/s gets a player to the
  mark early, so with 0.6 s most returns became smashes and the smash was no longer a reward. At 1 s a player who walks
  to the mark smashes about 3 returns in 10 against normal (6 in 10 before) and 1 in 7 against hard; a slower player
  about 1 in 6 and 1 in 11. Against easy the balls are slow, so a smash stays common (6 in 10). At 1.2 s a slower
  player almost never smashes against hard (1 in 16), so 1 s is kept. The hard robot smashes about 3 shots in 10.
- **Rooted while swinging**: a click that commits a swing (the ball within reach, 350 ms ahead at most) locks the
  player's movement until the ball passes (`committedSwingAt`, `swinging()` in `useTennis`), as the serve already
  does. The socket strikes a committed swing only if the player is still within 1.8 m + 0.5 m (`SWING_DRIFT_M`, for
  the network) of the contact point when the ball gets there; otherwise the swing is dropped and the ball flies on.
  The 0.5 m covers the position updates still in flight at the click. The front keeps the socket's click cooldown
  (400 ms, 700 ms after a swing at nothing in a match, `swingClick`), so a click the socket would refuse never roots
  the player. In doubles a click while the partner's swing is already committed still roots the player until the
  ball passes (the front does not know about the partner's swing); the socket refuses that click without the 700 ms.

Played on 2026-11-18 on a stack of this branch, in the browser, against the normal robot, with the movement keys
only (a script holding W, A, S, D toward the mark and clicking about 100 ms before the ball): the player did not move
on their own through a whole point; D moved them 5.2 m/s to the screen's right and S backwards; the mark, the
swing ring closing on it (orange, then green) and the landing ring were drawn as before; with D held through 35
swings the player stayed rooted every time (0 m). A tie-break stood at 5-5 after a rally of 23 returns.

Also measured headless through the socket's match code (`runTennis`, `onTennisHit`, the robot brains), with a
player moved only at walking speed (5 m/s, sprint 8.5 m/s) from a 250 ms reaction, clicking 100 ms before the ball
with ±60 ms of error; 6 tie-breaks each, points won-lost:

| Player | Easy | Normal | Hard |
|---|---|---|---|
| Walks to the mark | 42-0 | 42-0 | 43-16 |
| Slow (450 ms reaction, ±120 ms) | 42-3 | 42-11 | 24-42 |
| Never moves | 42-3 | 6-42 | 1-42 |
| Walks to the mark, doubles (robot partner at the same level) | 42-1 | 42-7 | 9-42 |

The table was measured with the 0.6 s charge; at 1 s the scores stay within a few points (walker against hard 43-11,
slow against hard 26-38). Smashes per returns, by charge, for the player who walks to the mark:

| Charge | Easy | Normal | Hard |
|---|---|---|---|
| 0.6 s | 63 / 87 | 148 / 255 | 151 / 747 |
| 0.9 s | 58 / 87 | 101 / 308 | 125 / 845 |
| 1.0 s (kept) | 52 / 87 | 86 / 308 | 115 / 852 |
| 1.2 s | 40 / 75 | 66 / 334 | 101 / 768 |

A player who stands still wins against easy, which plays to the middle.

What a player can now do, and what happens:

| Case | Decision | Covered by |
|---|---|---|
| Stands still while the ball comes | Allowed: the socket judges reach from where they stand; out of reach the click is a miss (700 ms in a match) and the ball wins the point if it bounces twice | `tennisRally.test.ts` (out of reach), `tennis.test.ts` (swing at nothing) |
| Runs away from the ball | Allowed: nothing pulls them back, the mark stays where the ball comes | `tennisManualMovement.test.ts` (no auto-run in the front, fails on the old code) |
| Clicks, then runs off before the contact | Blocked on the front (rooted until the ball passes); a modified client that runs anyway misses | `tennis.test.ts` (front, `committedSwingAt`, `swingClick`), `tennisRally.test.ts` (socket drops the swing); played in the browser |
| Leaves the court during a match | Allowed: it is the same as standing far from the ball; no hit is accepted from out of reach. Leaving `sports_tennis` follows the 10 s grace of every sport | `tennisRally.test.ts`, sports rejoin tests |
| Runs through the net line to the other half | Allowed to walk there (no wall), but no hit counts from more than 0.5 m past the net on their side, and the ball is only struck on their own half | `tennisRally.test.ts` (hitter on the wrong half) |
| Moves while serving | Blocked: the socket puts the server 1 m behind the baseline, the front locks them from the serve wait to the hit, and the toss is only hit within 1.0 m of it | `tennisRally.test.ts`, `tennis.test.ts` (socket) |

## Robot opponent (2026-11-17)

Called from the coach panel by the first player signed up (CORE.md § robots), in singles (one robot) or doubles (a
player alone gets a robot partner and two robot opponents). Each robot is driven on the sports tick (every 100 ms) by
`tennisRobot.ts` (`thinkTennis`, tested) and plays through the hit path of a player (`matchHit` in `tennis.ts`): same
reach, 400 ms between hits, 700 ms after a swing at nothing, same timing judgement, charge and smash, same aim clamp.
It has no rule of its own.

- **Serve**: it waits 1.2 s with the ball, tosses, then hits around the top of the toss. It stays on the spot the
  socket puts every server on. It never serves while a player of the match is away (the socket's hold applies to it,
  and the 1.2 s start again when they are back); a robot is never away.
- **Rally**: after its reaction time it runs, at its level's speed, to the first point of the ball's path after the
  bounce that it can reach in time (from 200 ms after the bounce), 0.6 m to the side so the ball comes on its
  forehand, and swings so that the ball is struck in the middle of the perfect window. Its timing and the spot it
  stands on are off by a random error drawn once per incoming ball. It walks back to its kick-off place after its
  side has hit. It stays in the play area, at least 1 m from the net.
- **Balls it leaves**: a ball that will land out or die in the net is left alone (the white ring shows the same to a
  player).
- **Doubles**: the robot nearest to the spot goes for the ball, its partner keeps its place; a robot in reach still
  swings.

| Level | Run | Reaction | Swing timing off by | Standing spot off by | Reached balls it lets through | Aim (width used, depth past the net) | Plays the open side | Lob |
|---|---|---|---|---|---|---|---|---|
| Easy | 2.2 m/s | 550 ms | up to 500 ms | up to 1.0 m | 25 % | middle quarter, 6 to 9 m | never | never |
| Normal | 3.0 m/s | 350 ms | up to 300 ms | up to 0.5 m | 10 % | 60 %, 7 to 10 m | 35 % of shots | 5 % |
| Hard | 3.8 m/s | 200 ms | up to 150 ms | up to 0.15 m | 4 % | 80 %, 8.5 to 11 m | 80 % of shots | 15 % |

The timing error is the sum of two draws, so small errors are the most common: easy is often early or late (weaker,
longer shots), hard is on time almost every ball. The open side is the aim spot (left, right or middle) furthest from
every opponent. For reference a player walks at 5 m/s and sprints at 8.5 m/s. The numbers
are in one table, `TENNIS_ROBOT`.

Measured with a scripted feeder that never misses (not a playtest): easy sends back about 7 balls in 10 played within
2 m of the middle and 5 in 10 played to the lines; normal about 9 in 10; hard more than 9 in 10, and with the 0.6 s charge of then it smashed most
balls it waited for, so a player who only stood on the mark (as the former auto-run did) lost about 3 points in 4 against it.

Not covered: the robot never comes to the net or volleys on purpose, plays no drop shot, does not change its play
with the score, and a robot partner does not cover for the player. A robot's missed swing shows no stroke (as for a
player, only a struck ball sends `tennis_stroke`). No robot in free play. The levels were tuned on the simulation
above and have not been played in the game.

## Contract

Socket constants: `socket/src/sports/tennisConstants.ts`, mirrored in `front/public/assets/sports/rules/tennis.json`
(a socket test and a front test check they agree). Red plays the south half (larger z), blue the north half.

| Message | Direction | Payload |
|---|---|---|
| `tennis_hit` | client → server | `{ aimX: number, aimZ: number, lob?: boolean }` (finite numbers; the aim is clamped to the receiving half, from 1 m past the net to 3 m past its lines; the front keeps its target 0.5 m inside the lines and 1.5 m from the net). 400 ms between two hits of one player, 700 ms after a swing at nothing in a match. Only a player of a running tennis match, back on court. |
| `tennis_state` | server → match players and players in `sports_tennis` | `{ venue, court: { cx, netZ, halfWidth }, mode, format, phase: 'serve_wait' \| 'toss' \| 'flight' \| 'point' \| 'ended', games, points (labels '0', '15', '30', '40', 'AD' or tie-break counts), tiebreak, serving, server: sessionId \| null, ball: { x, y, z, vx, vy, vz, t (server ms) } \| null, hitter, bounces: 0 \| 1, shot: { sessionId, timing: 'smash' \| 'perfect' \| 'good' \| 'early' \| 'late' } \| null (the last shot of the ball in flight), call: 'out' \| 'net' \| 'double_bounce' \| 'missed_toss' \| null, pointWinner, winner, players: [{ sessionId, team }], serverNow }`, sent at kick-off, on each toss, hit, bounce and point, and once with `phase: 'ended'`. |
| `tennis_ball_take` | client → server | `{ court: 'tennis_1' \| 'tennis_2' }` within 2.5 m of its basket: lends `tennis_ball` (`sports_loans`), or `sports_error` (`sports_too_far`, `sports_no_pass`, `sports_no_gear`, `sports_venue_busy`). |
| `tennis_free` | server → players in `sports_tennis` | `{ court, geometry: { cx, netZ, halfWidth } \| null, phase: 'idle' \| 'serve_wait' \| 'toss' \| 'flight' \| 'point', ball, hitter, server: sessionId \| null (who tosses), bounces, shot, call, serverNow }` for a free rally; `idle` when the court is free again. |
| `tennis_stroke` | server → players in `sports_tennis` but the striker | `{ sessionId, stroke: 'serve' \| 'forehand' \| 'backhand' \| 'lob' \| 'celebrate' }`, for the third-person clip. |

The client draws the ball from `ball` on the server clock (`serverNow`); the socket alone judges hits, bounces and points.
Results: `win` / `loss` per side, `dnf` for a player out past the grace, `score` = games won (short set) or tie-break
points.

## Proposed placeholder JSON fields

`sport` ("tennis"), `courts` (2 × { centre, size, net height }), `modes` (["singles", "doubles"]), `formats` (["short_set_4", "tiebreak_7"]), `ball` (radius, restitution, drag), `hit` (windowMs, reachM, powerByTiming), `lob`, `faults` ("simplified"), `gear` (["tennis_racket"]), `coachId`, `tasks` (["matches_played", "set_4_0"]).
