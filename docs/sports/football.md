# Indoor football

Played on the gymnasium court (44 × 24 m, shared with basketball) and on the outdoor pitch inside the athletics track, with the same rules. Shared rules in [README.md](README.md).

## Rules

- Two teams, red and blue, score in the opponent's goal. Most goals at the end of the clock wins; a draw is a draw.
- No dedicated goalkeeper: anyone can defend the goal, nobody catches the ball by hand.
- Indoors the ball **bounces off the walls**: no throw-ins, no corners, play only stops after a goal (kick-off from the centre by the team that conceded).
- Outdoors (open pitch, no walls): a ball that leaves the pitch comes back to the nearest line spot for the other team, simplified throw-in. Formats go up to 7 v 7.
- Sliding tackle allowed; no fouls, no cards.

## Controls

- Move and run as usual. Running into the ball dribbles it (it sticks lightly to the feet); at a sprint the ball runs up to 0.6 m further ahead, so a tackle reaches it more easily.
- **Left click**: a tap is a ground pass. With a team-mate within 30 m in a 70° cone ahead, it goes to where they will be when it arrives, faster the further they are (8 m/s plus 0.35 per metre, 16 at most); with nobody there it goes straight ahead at 8 m/s. **Held 250 ms or more**: a lob at 40° over the defenders, to that team-mate, or 10 to 30 m ahead by how long it is held (full after 1 s) when nobody is there.
- **Right click held**: charged shot; release shoots where the body faces. In a match a shot that would pass up to 2.5 m wide of a post is pulled 0.35 m inside it. From 90 % of the meter the shot is over-hit: it lifts 3 m/s more and clears the bar from close range, so release before the red zone.
- **Tackle key** (C, rebindable): under 6.5 m/s a standing tackle (1.1 m of reach in a 90° cone, no fall on a miss, 1 s of cooldown); at 6.5 m/s or more a sliding tackle (1.8 m in a 70° cone, a miss leaves the player on the ground 0.8 s, 3 s of cooldown).
- **Through ball** (F, rebindable): a ground pass at 13 m/s into the space 5 m ahead of the team-mate's run (5 m past a standing one, on the line to him); straight ahead with no team-mate in the cone.
- **Face the ball** (X held, rebindable): the player moves at 55 % of the speed and, in the television view, keeps the body turned to the ball, so a standing tackle lands. Front only: the socket still reads the yaw and the speed.
- **In a match the players stay on the pitch**: the socket refuses a move out of the play area for a match player who is in it (`match_bounds`), and the front holds them at the line. Holding N for 1.5 s leaves the match (`sports_match_leave`): the player is out, the team plays on short, an empty team forfeits.
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
- The client sends intents: pass press and release, shot start and release, tackle. Pass and shot power come from the socket clock between press and release, the direction from the player's yaw known to the socket and the team-mate from the socket positions; the client sends none of them.
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
