# Basketball

Played on the gymnasium court (44 × 24 m, shared with football: two main baskets, plus side baskets for free play). Shared rules in [README.md](README.md).

## Rules

- Two teams, red and blue. A basket is worth 2 points, 3 from behind the three-point line. Most points at the end of the clock wins.
- After a basket, the other team restarts from under its basket.
- No fouls, no shot clock (kept simple).

## Controls

- The ball carrier **dribbles automatically** while moving.
- **Left click**: pass. With a team-mate within 20 m in a 70° cone ahead it goes to where they will be when it arrives; else straight ahead.
- **Shot**: hold the shot key, a meter rises; release in the green zone. No aiming: the shot is locked on the basket. Distance makes the zone smaller, and so does a defender: none within 2 m leaves it whole, one within 0.8 m cuts it to 45 %, in between it shrinks in a straight line. The zone drawn on the meter is the one the socket uses.
- **Dunk and lay-up**: a shot within 1.5 m of the rim at 4 m/s or more is a dunk (95 %). A shot within 3.5 m while moving at 2.5 m/s or more is a lay-up with no meter: 85 % with no defender within 2 m, 50 % with one within 0.8 m, in between on a straight line.
- **Dribble move** (F, rebindable): with the ball in hand, a hop of 1.4 m to the side held on the screen, or towards the camera with the back key or no side held; once every 1.5 s. Front only (it is a move like any other, checked by the socket's speed limit).
- **Steal key** (rebindable): a defender close to the carrier tries to steal, with a chance and a cooldown (proposed 40 %, 2 s).
- **Jump** (Space) near a shooter blocks the shot if the jump is timed with the release.

## Flow

- **Free play**: ball asked from the coach, taken back when leaving the court; every basket is free to use.
- **Structured match**: sign-up with the gymnasium coach. The first player chooses format 1 v 1 to 5 v 5 and length 4 min, 6 min or 2 × 4 min. Kick-off, teams and leavers as in the README. The court is reserved: no football at the same time.

## HUD

Score, clock, half indicator, shot meter with its good window while holding, steal cooldown, "+2" / "+3" floating over the rim.

## Server authority

- The socket simulates the ball (flight, rim and backboard bounces, floor), decides possession, steals (chance rolled by the server), blocks and baskets.
- Shot timing is measured on the socket clock between press and release; the client only sends press and release. The defender's distance, the lay-up roll and the pass target come from the socket positions.
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
