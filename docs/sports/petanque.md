# Pétanque

Four outdoor pistes at the boulodrome, with a pétanque coach. Shared rules in [README.md](README.md).

## Rules

Simplified official rules.

- **1 v 1, 2 v 2 or 3 v 3**: 3 boules each in singles and doubles, 2 each in triples.
- A game to **13 or to 7 points**, chosen by the first player.
- Each end: a player throws the jack, then teams throw; the team not holding the point throws next. When all boules are thrown, the team closest to the jack scores one point per boule closer than the opponent's best.
- Carreau possible (a shot that takes the place of the boule it hits).

## Controls

- Aim with the mouse, **hold to charge a power meter** (like the darts meter), release to throw.
- **Wheel or a key** switches between **pointing** (the boule rolls) and **shooting** (the boule flies to hit another).

## Flow

- **Free play**: own boules on any free piste.
- **Structured game**: sign-up at the pétanque coach, one piste reserved per game, up to 4 games at once.

## HUD

Score, end number, boules left per player, power meter, **the boule holding the point marked and distances to the jack in cm** after each throw.

## Server authority

The socket simulates every boule and the jack (roll, bounce, collisions), measures the distances and scores the end. The client sends aim direction, mode, press and release; the power comes from the socket clock.

## Gear

**Set of boules bought** at the mall sports shop, held in hand. The jack is provided by the piste.

## Rewards

Task "games played"; feat task proposal: a carreau. No weekly board.

## Animations

Pointing throw (low, rolling), shooting throw (high), crouch, walk to the jack, small celebration.

## Failure cases

Leaver past the 30 s grace: their boules are skipped; a team at 0 players loses.

## Decisions (2026-11-14, building session)

- **Pistes**: 4 × 15 m of gravel (long axis z) inside 0.2 m boards (top 0.12, walkable), centres in `petanque.json`. The throwing circle is 1 m from an end board, on the piste axis, and alternates ends at each end (south first).
- **Ground**: a rolling boule slows down at 0.9 m/s². Balls bounce off each other (restitution 0.75). A ball touching a board is dead and stays where it stopped.
- **Own boules required**: the coach refuses a sign-up without `gear_boules` (`sports_no_gear`). No lent boules.
- **Full teams only**: each format needs exactly 2 × team size players (2, 4 or 6), so a game kicks off as soon as it is full.
- **Free play is not built yet**: only coach games are simulated.
- **Jack**: valid between 6 and 10 m from the circle and 0.5 m from the side boards. Otherwise the socket moves it to the nearest valid spot, or to 8 m on the axis if it died.
- **Shot clock**: 40 s per throw. When it runs out the boule is lost, or the socket places the jack at 8 m.
- **Who throws**: the team not holding the point. Within a team, the player with the most boules left goes first. When the jack dies, a team that still has boules scores them all; if both teams still have boules, nobody scores.
- **Carreau**: a shot that lands on a boule and stops within 0.3 m of the spot that boule left. It is announced to everyone; the match record has no field for it yet.

## Contract

Rules file `front/public/assets/sports/rules/petanque.json`, read by the socket (`parsePetanqueRules`), the front (`parsePetanqueClientRules`) and `build_sports_petanque.py`. Venues `petanque_1` to `petanque_4`, one coach `petanque_coach`.

| Message | Direction | Payload |
|---|---|---|
| `petanque_aim` | client → server | `{}`, the press. Only from the current thrower, standing within `circleReachM` (1.2 m) of the circle, once the last throw has settled. The socket stores its own clock. |
| `petanque_throw` | client → server | `{ yaw: number (rad, \|yaw\| ≤ π, clamped to ±maxAimDeg from the throwing axis, positive toward +x), mode: 'point' \| 'shoot' }`, the release. Power = the triangle wave of (release − press) / `riseMs` on the socket clock. Any other field is ignored. |
| `petanque_throw` | server → site | `{ venue, kind: 'jack' \| 'boule', mode, thrower, team, ball, from, landing, airMs, frames: [tMs, [id, x, z]...][], carreau, serverNow }`. The frames start at the landing. |
| `petanque_state` | server → site and players | `{ venue, phase: 'jack' \| 'boules' \| 'between', format, target, score, end, circle: { x, z, axisZ }, jackTeam, thrower, busyUntil, turnEndsAt, serverNow, players: [{ sessionId, name, team, out, left }], balls, point, distancesCm, lastEnd }`. Sent on every change and every 5 s. |
| `petanque_closed` | server → site and players | `{ venue, score, reason: 'finished' \| 'forfeit' }` |
| `sports_error` | server → client | `petanque_not_your_turn`, `petanque_wait`, `petanque_not_in_circle` |

Results: `win` or `loss` per team, with `score` = that team's points (`draw` when tied; `dnf` for everyone when both teams left). No coins.

## Open points

- Free play on a free piste with your own boules.
- A carreau counter for the feat task (needs a field in `sports_match_players` or a task counter).

## Proposed placeholder JSON fields

`sport` ("petanque"), `pistes` (4 × { centre, size, boundaries }), `formats` ([{ teamSize: 1, boules: 3 }, { teamSize: 2, boules: 3 }, { teamSize: 3, boules: 2 }]), `targetPoints` ([7, 13]), `boule` (radius, mass, friction), `jack` (radius, throwDistanceRangeM), `throwModes` (["point", "shoot"]), `powerMeter` (riseMs), `gear` (["boules"]), `coachId`, `tasks` (["games_played", "carreau"]).
