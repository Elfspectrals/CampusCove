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

## Open points

- Piste size and ground friction.
- Whether a player with no boules can join a structured game (lent boules) or not.

## Proposed placeholder JSON fields

`sport` ("petanque"), `pistes` (4 × { centre, size, boundaries }), `formats` ([{ teamSize: 1, boules: 3 }, { teamSize: 2, boules: 3 }, { teamSize: 3, boules: 2 }]), `targetPoints` ([7, 13]), `boule` (radius, mass, friction), `jack` (radius, throwDistanceRangeM), `throwModes` (["point", "shoot"]), `powerMeter` (riseMs), `gear` (["boules"]), `coachId`, `tasks` (["games_played", "carreau"]).
