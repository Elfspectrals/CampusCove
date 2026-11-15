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
- The player **runs to the ball on their own** (60 % of the walking speed) and comes back to the baseline between shots. Any movement key takes over, at full speed.
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

Leaver past the 30 s grace: the other side wins.

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
- **Auto-run** (front only, the socket only checks the move speed as for any move): towards where the ball will be
  350 ms after its bounce, 0.6 m to the side so it comes on the racket side, at 60 % of the walking speed; in doubles
  only the partner nearest to that spot runs. After the player's side has hit, back to the middle of the baseline
  (singles) or to their side of it (doubles). At 70 % every ball was reachable and no point ended.
- **Free play**: the side (camera, target) is the half the player stands on when they step on the court with a ball, and
  stays until they leave the court.

## Decisions (2026-11-15, after the user's first match)

- **Serve**: at each new serve the socket puts the server 1 m behind their baseline, at their current width kept inside
  the court lines (`position_correction`, reason `tennis_serve`). The front locks their movement while they serve (match:
  from the serve wait to the hit; free play: during their own toss, `tennis_free.server`). The socket only accepts the
  serve hit from a server within 1.0 m of the tossed ball: a server who walked away from the toss could still hit it.
- **Smash**: a fifth timing, earned by being early (second review, 2026-11-15, on the model of the star of Mario Tennis; it was a click in a 100 ms window before). A player is *in position* when the incoming ball will pass within 0.8 m of them at a height they can hit (2.8 m at most), on their half. Standing in position for 0.6 s without a break charges the shot (`chargeMs`, `trackReady` in `tennisRally.ts`, followed on each sports tick and at the click); stepping out, a new ball or their own shot starts the charge again. A charged drive struck in the perfect window (60 ms late to 200 ms early) with a quality of 0.85 or more leaves at 25 m/s. Examples: in position for 600 ms, click 50 ms before the ball: smash; in position for 599 ms: perfect; charged but 201 ms early: early; out and back 300 ms before the click: perfect; a lob is never a smash.
- **A swing at nothing** (decided 2026-11-15, under the "Emergent gameplay" rule): clicking in bursts returned the ball about 6 times in 10 without reading the ring. A click that finds no ball to strike while the ball is coming now costs 700 ms before the next click instead of 400 ms, in a match. Free play keeps 400 ms.
- **Serve ring** (2026-11-15, after the user tested alone and saw no circle: alone only the serve can be played): during the server's own toss the ring is drawn around them, closing as the ball rises; green within 60 ms of the top of the toss (the socket's Perfect), orange within 280 ms, red outside (`serveRing`).
- **Mark on the court**: as soon as the other side hits, a disc of 0.8 m is drawn where the player should stand for that ball (`interceptSpot`, the spot the auto-run goes to); a star 1.5 times wider for a high ball (apex of 4 m or more). It is pale yellow, turquoise once the player is in position, and a white disc grows inside it while the charge builds, purple when it is full. The front shows its own estimate (`inPlace`, `chargeFill`, the same numbers as the socket); the socket decides.
- **Swing ring**: a ring on the ground around that mark (around the player when there is no mark), from 900 ms before the ball passes closest, shrinking from 2.4 m to 0.6 m as it comes. Its colour is what a click now would give: red a miss (more than 350 ms early, more than 150 ms late, or out of reach), orange a weak shot, green a good one, purple a smash (charged). Purple rather than yellow: yellow is the aim target. Front only (`swingRing`, `swingTone`), from the same constants as the socket; a ball passing higher than 2.8 m over the player no longer counts as a pass.

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
