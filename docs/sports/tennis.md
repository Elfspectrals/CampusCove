# Tennis

Two outdoor courts, with a tennis coach between them. Shared rules in [README.md](README.md).

## Rules

- Singles or doubles, chosen by the first player at the coach, with the format:
  - **one short set**: first to 4 games, tie-break at 3–3;
  - **one tie-break** to 7 points (2 clear).
- Scoring 15-30-40-game inside a set.
- **Simplified faults**: no service box fault, any ball that lands in the opponent's half is good. A ball out, in the net or that bounces twice loses the point. Serves alternate as usual.

## Controls

- Move to the ball; **left click when the ball is in the hitting zone**. The timing gives power and accuracy; the mouse aims at a spot in the opponent's half.
- **Right click**: lob.
- Serve: the same click on a ball toss.

## Flow

- **Free play**: hit balls with a friend, balls lent by the court.
- **Structured match**: sign-up at the tennis coach, one court reserved for the match, the other stays free.

## HUD

Score (games and points), server indicator, hitting zone cue as the ball arrives, "Out" call on the court.

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

## Contract

Socket constants: `socket/src/sports/tennisConstants.ts`, mirrored in `front/public/assets/sports/rules/tennis.json`
(a socket test and a front test check they agree). Red plays the south half (larger z), blue the north half.

| Message | Direction | Payload |
|---|---|---|
| `tennis_hit` | client → server | `{ aimX: number, aimZ: number, lob?: boolean }` (finite numbers; the aim is clamped to the receiving half, from 1 m past the net to 3 m past its lines). 120 ms between two hits of one player. Only a player of a running tennis match, back on court. |
| `tennis_state` | server → match players and players in `sports_tennis` | `{ venue, court: { cx, netZ, halfWidth }, mode, format, phase: 'serve_wait' \| 'toss' \| 'flight' \| 'point' \| 'ended', games, points (labels '0', '15', '30', '40', 'AD' or tie-break counts), tiebreak, serving, server: sessionId \| null, ball: { x, y, z, vx, vy, vz, t (server ms) } \| null, hitter, call: 'out' \| 'net' \| 'double_bounce' \| 'missed_toss' \| null, pointWinner, winner, players: [{ sessionId, team }], serverNow }`, sent at kick-off, on each toss, hit, bounce and point, and once with `phase: 'ended'`. |
| `tennis_ball_take` | client → server | `{ court: 'tennis_1' \| 'tennis_2' }` within 2.5 m of its basket: lends `tennis_ball` (`sports_loans`), or `sports_error` (`sports_too_far`, `sports_no_pass`, `sports_no_gear`, `sports_venue_busy`). |
| `tennis_free` | server → players in `sports_tennis` | `{ court, geometry: { cx, netZ, halfWidth } \| null, phase: 'idle' \| 'serve_wait' \| 'toss' \| 'flight' \| 'point', ball, hitter, call, serverNow }` for a free rally; `idle` when the court is free again. |
| `tennis_stroke` | server → players in `sports_tennis` but the striker | `{ sessionId, stroke: 'serve' \| 'forehand' \| 'backhand' \| 'lob' \| 'celebrate' }`, for the third-person clip. |

The client draws the ball from `ball` on the server clock (`serverNow`); the socket alone judges hits, bounces and points.
Results: `win` / `loss` per side, `dnf` for a player out past the grace, `score` = games won (short set) or tie-break
points.

## Proposed placeholder JSON fields

`sport` ("tennis"), `courts` (2 × { centre, size, net height }), `modes` (["singles", "doubles"]), `formats` (["short_set_4", "tiebreak_7"]), `ball` (radius, restitution, drag), `hit` (windowMs, reachM, powerByTiming), `lob`, `faults` ("simplified"), `gear` (["tennis_racket"]), `coachId`, `tasks` (["matches_played", "set_4_0"]).
