# Indoor football

Played on the gymnasium court (44 × 24 m, shared with basketball) and on the outdoor pitch inside the athletics track, with the same rules. Shared rules in [README.md](README.md).

## Rules

- Two teams, red and blue, score in the opponent's goal. Most goals at the end of the clock wins; a draw is a draw.
- No dedicated goalkeeper: anyone can defend the goal, nobody catches the ball by hand.
- Indoors the ball **bounces off the walls**: no throw-ins, no corners, play only stops after a goal (kick-off from the centre by the team that conceded).
- Outdoors (open pitch, no walls): a ball that leaves the pitch comes back to the nearest line spot for the other team, simplified throw-in. Formats go up to 7 v 7.
- Sliding tackle allowed; no fouls, no cards.

## Controls

- Move and run as usual. Running into the ball dribbles it (it sticks lightly to the feet).
- **Left click**: pass in the aim direction, fixed medium power.
- **Right click held**: charged shot, power meter like the darts meter; release shoots in the aim direction.
- **Tackle key** (rebindable): a sliding tackle forward, takes the ball if it reaches it, with a cooldown (proposed 3 s). A missed tackle leaves the player on the ground for about 0.8 s.
- Players block each other by collision.

## Flow

- **Free play**: the ball is asked from the coach and taken back when the player leaves the court. Goals are not counted.
- **Structured match**: sign-up with the gymnasium coach (the athletics coach outdoors). The first player chooses:
  - format: 2 v 2 to 5 v 5 indoors, up to 7 v 7 outdoors;
  - length: 4 min, 6 min or 2 × 4 min.
- Minimum 4 players (2 v 2). Kick-off rules, teams and leavers as in the README.
- While a match runs the court is reserved for that sport: no basketball at the same time on the gymnasium court.

## HUD

Score red–blue, match clock, half indicator, a short "GOAL" banner with the scorer's name, shot power meter while charging, tackle cooldown.

## Server authority

- The socket simulates the ball (position, velocity, bounce on walls, posts and players) and decides possession, tackles and goals.
- The client sends intents: pass (aim direction), shot start and release (aim direction), tackle. Shot power is computed from the socket clock between press and release, never sent by the client.
- Reach checks: a player can only touch the ball within a short distance of the ball position known to the socket; a tackle is checked against the socket positions.

## Gear

None. The ball is lent by the coach; sportswear is cosmetic.

## Rewards

- Task "matches played" (tiers set later). Feat task proposal: a hat-trick in one match.
- No weekly board for football.

## Animations

Dribble run, pass kick, charged shot (wind-up and kick), sliding tackle and get-up, goal celebration (short, optional).

## Open points

- Exact tackle cooldown, ground time and ball "stickiness".
- Whether a structured match needs both teams non-empty at kick-off with at least 2 per side, or allows 1 v 1.
- Outdoor pitch size and its 7 v 7 maximum.

## Proposed placeholder JSON fields

`sport` ("football"), `venues` (gymnasium court, outdoor pitch: size, goal size, walls true/false), `formats` (list of team sizes per venue), `durationsSec` ([240, 360, 480 as 2 halves]), `minPlayers`, `kickoffCountdownSec` (60), `rejoinGraceSec` (30), `ball` (radius, mass, restitution, friction), `passPower`, `shotPowerRange`, `tackle` (reachM, cooldownMs, groundMs), `dribbleReachM`, `gear` ([]), `coachId`, `tasks` (["matches_played", "hat_trick"]).
