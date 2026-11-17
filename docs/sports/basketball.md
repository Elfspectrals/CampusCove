# Basketball

Played on the gymnasium court (44 × 24 m, shared with football: two main baskets, plus side baskets for free play). Shared rules in [README.md](README.md).

## Rules

- Two teams, red and blue. A basket is worth 2 points, 3 from behind the three-point line. Most points at the end of the clock wins.
- After a basket, the other team restarts from under its basket.
- No fouls, no shot clock (kept simple).

## Controls

- The ball carrier **dribbles automatically** while moving.
- **Left click**: pass. With a team-mate within 20 m in a 70° cone ahead it goes to where they will be when it arrives; else straight ahead.
- **Shot** (arcade, in the spirit of NBA Jam, decided 2026-11-15): pressing the shot key makes the carrier jump, 0.9 m high, topping out after 450 ms (`shotMeter.riseMs`); letting go at the top shoots. There is no meter: the jump is the cue, and a label (Perfect, Good, Early, Late) follows each shot. No aiming: the shot is locked on the basket. The good window ends at the top of the jump and is 30 % of the rise near the rim, 15 % at 12 m; a defender cuts it: none within 2 m leaves it whole, one within 0.8 m cuts it to 45 %, in between it shrinks in a straight line. A player who lands still holding the key shoots at the landing, late.
- **Dunk and lay-up**: a shot at 4 m/s or more within 3 m of the rim is a dunk (95 %), within 4.5 m at a sprint of 7 m/s or more (`turboDunk`); the dunker leaps 1.5 m high and keeps the run going to the rim. Sprint is the turbo: it costs stamina as everywhere. A shot within 3.5 m while moving at 2.5 m/s or more is a lay-up: 85 % with no defender within 2 m, 50 % with one within 0.8 m, in between on a straight line.
- **On fire**: three baskets in a row by the same player in a match set them on fire: their good window is doubled (never more than the whole rise), an orange ring marks them on the floor and the HUD names their team. It lasts until the other team scores. A basket by a team-mate keeps the fire and restarts the count for that team-mate. Not in free play, where baskets are not counted.
- **Dribble move** (F, rebindable): with the ball in hand, a hop of 1.4 m to the side held on the screen, or towards the camera with the back key or no side held; once every 1.5 s. Front only (it is a move like any other, checked by the socket's speed limit).
- **Shove key** (rebindable, the tackle key): a shove knocks down the ball carrier standing within 1.6 m in a 100° cone ahead: the carrier is on the floor 0.7 s (no move, pass or shot) and the ball pops loose 0.5 m past them at 3 m/s in the direction the shover faces. No dice: reach and cone decide. The 2.5 s cooldown is spent on a miss too.
- **Jump** (Space) near a shooter blocks the shot if the jump is timed with the release.

## Flow

- **Free play**: ball asked from the coach, taken back when leaving the court; every basket is free to use.
- **Structured match**: sign-up with the gymnasium coach. The first player chooses format 1 v 1 to 5 v 5 and length 4 min, 6 min or 2 × 4 min. Kick-off, teams and leavers as in the README. The court is reserved: no football at the same time.
- **Robots**: the first player signed up can fill the empty places of both teams with robots of three levels, down to one against one robot; how they play is in [gym.md](gym.md#robots-2026-11-17).

## HUD

Score, clock, half indicator, the timing label after each shot, "on fire" line, shove cooldown, "+2" / "+3" floating over the rim.

## Server authority

- The socket simulates the ball (flight, rim and backboard bounces, floor), decides possession, shoves (reach and cone from its own positions), blocks, baskets and who is on fire.
- Shot timing is measured on the socket clock between press and release; the client only sends press and release. The defender's distance, the lay-up roll and the pass target come from the socket positions.
- The three-point check uses the shooter's position known to the socket at release.

## Gear

None. The ball is lent by the coach.

## Rewards

Task "matches played"; feat task proposal: 5 three-pointers in one match. No weekly board.

## Animations

Dribble walk and run, pass, jump shot, dunk, block jump, steal swipe (played by the shover). The shoved player plays the football slide clip: there is no fall clip on the rig yet.

## What a player can still do

- Shove a team-mate, a player without the ball, from behind or from further than 1.6 m: nothing happens and the cooldown is spent.
- Shove during the 3 s that protect the restart after a basket: refused, cooldown spent.
- Shove in free play: allowed on anyone carrying a ball, as the steal was; once every 2.5 s per player.
- Two defenders taking turns to shove the same carrier: allowed, the carrier has to pass first.
- Shove the player on fire: allowed, it does not end the fire.
- Jump without the ball on the shot key: no jump, nothing sent that the socket uses.
- Hold the shot key for ever with a modified client: the socket ignores a hold over 5 s.
- Dunk from 4.5 m with no stamina left: no sprint, so the 3 m range applies.
- Leave the court in the air: the court hold applies to the jump as to a run.

## Open points

- Size of the trajectory help and of the timing window per distance.
- Whether side baskets can host a half-court 3 v 3 structured match while the main court is free.

## Proposed placeholder JSON fields

`sport` ("basketball"), `court` (size, `baskets`: positions, rim height 3.05, `threePointRadiusM`), `formats` ([1..5]), `durationsSec`, `minPlayers`, `kickoffCountdownSec`, `rejoinGraceSec`, `ball` (radius, mass, restitution), `shotMeter` (riseMs, windowMsByDistance), `aimAssistMax`, `dunkRangeM`, `turboDunk` (rangeM, speedMps), `shove` (reachM, coneDeg, downMs, cooldownMs, ballSpeed), `fire` (baskets, windowFactor), `blockWindowMs`, `gear` ([]), `coachId`, `tasks` (["matches_played", "three_pointers"]).
