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

## Open points

- Size of the hitting window and how much timing changes power.
- Whether doubles partners can both hit the same ball.

## Proposed placeholder JSON fields

`sport` ("tennis"), `courts` (2 × { centre, size, net height }), `modes` (["singles", "doubles"]), `formats` (["short_set_4", "tiebreak_7"]), `ball` (radius, restitution, drag), `hit` (windowMs, reachM, powerByTiming), `lob`, `faults` ("simplified"), `gear` (["tennis_racket"]), `coachId`, `tasks` (["matches_played", "set_4_0"]).
