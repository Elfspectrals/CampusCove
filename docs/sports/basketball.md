# Basketball

Played on the gymnasium court (44 × 24 m, shared with football: two main baskets, plus side baskets for free play). Shared rules in [README.md](README.md).

## Rules

- Two teams, red and blue. A basket is worth 2 points, 3 from behind the three-point line. Most points at the end of the clock wins.
- After a basket, the other team restarts from under its basket.
- No fouls, no shot clock (kept simple).

## Controls

- The ball carrier **dribbles automatically** while moving.
- **Left click**: pass in the aim direction.
- **Shot**: hold the shot key, a meter rises; release near its top. Ball flight is real physics, aimed with the mouse, and a good timing adds a small trajectory help toward the rim (the mix the user chose). Distance makes the window smaller.
- **Dunk**: shooting while running within about 1.5 m of the rim plays a dunk animation that almost always scores.
- **Steal key** (rebindable): a defender close to the carrier tries to steal, with a chance and a cooldown (proposed 40 %, 2 s).
- **Jump** (Space) near a shooter blocks the shot if the jump is timed with the release.

## Flow

- **Free play**: ball asked from the coach, taken back when leaving the court; every basket is free to use.
- **Structured match**: sign-up with the gymnasium coach. The first player chooses format 1 v 1 to 5 v 5 and length 4 min, 6 min or 2 × 4 min. Kick-off, teams and leavers as in the README. The court is reserved: no football at the same time.

## HUD

Score, clock, half indicator, shot meter with its good window while holding, steal cooldown, "+2" / "+3" floating over the rim.

## Server authority

- The socket simulates the ball (flight, rim and backboard bounces, floor), decides possession, steals (chance rolled by the server), blocks and baskets.
- Shot timing is measured on the socket clock between press and release; the client only sends press, release and aim direction. The trajectory help is applied by the socket only.
- The three-point check uses the shooter's position known to the socket at release.

## Gear

None. The ball is lent by the coach.

## Rewards

Task "matches played"; feat task proposal: 5 three-pointers in one match. No weekly board.

## Animations

Dribble walk and run, pass, jump shot, dunk, block jump, steal swipe.

## Open points

- Size of the trajectory help and of the timing window per distance.
- Steal chance and cooldown.
- Whether side baskets can host a half-court 3 v 3 structured match while the main court is free.

## Proposed placeholder JSON fields

`sport` ("basketball"), `court` (size, `baskets`: positions, rim height 3.05, `threePointRadiusM`), `formats` ([1..5]), `durationsSec`, `minPlayers`, `kickoffCountdownSec`, `rejoinGraceSec`, `ball` (radius, mass, restitution), `shotMeter` (riseMs, windowMsByDistance), `aimAssistMax`, `dunkRangeM`, `steal` (reachM, chance, cooldownMs), `blockWindowMs`, `gear` ([]), `coachId`, `tasks` (["matches_played", "three_pointers"]).
