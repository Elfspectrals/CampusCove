# Climbing

Climbing hall: bouldering on mats and a lead wall of about 12 m with coloured routes. Shared rules in [README.md](README.md).

## Rules

- **6 boulders and 4 routes**. The colour is the difficulty: green, blue, red, black. A harder colour has more holds and a shorter click window.
- The holds of the route light up one by one; the player **clicks the next hold within its time window**. Too early or too late lowers the **grip bar**; an empty grip bar is a fall.
- **Boulders**: a fall lands on the mat, no damage.
- **Lead wall**: an automatic belay; a fall lowers the climber to the ground in 2 s and cancels the time. No partner needed.
- Time runs from the first hold to the top hold.

## Flow

- **Free play**: walk up to the start of a route and press interact; every climb is timed.
- **Speed duel**: the coach starts 2 climbers on two **twin routes** (identical, side by side, like speed climbing); first to the top wins.

## Controls

Mouse to aim, left click on the lit hold. Movement locked while climbing; a key lets go (drops down).

## HUD

Grip bar, the next hold highlighted with its window ring, route colour and name, time; in a duel the other climber's height.

## Server authority

The socket owns the sequence, the windows on its own clock (with the usual allowance), grip, falls and times. The client sends "hold clicked" with the hold id; a click on any other hold is a miss.

## Gear

None to buy: **climbing shoes are lent at the reception with the pass**.

## Rewards

- Weekly board per route and per boulder (best time). Dated badge for the first.
- Task "routes topped"; feat task proposal: top a black route.

## Animations

Reach to a hold (left and right), hang idle, fall from a boulder, lowered on the rope, top-out.

## Failure cases

Disconnect or letting go: the climb stops, no time recorded.

## Open points

- Click windows per colour and grip loss per miss.
- How the lent shoes are shown (worn automatically on the wall, or not shown).

## Proposed placeholder JSON fields

`sport` ("climbing"), `boulders` (6 × { id, colour, holds: positions, windowMs }), `routes` (4 × { id, colour, heightM, holds, windowMs }), `twinRoutes` (pair of route ids for duels), `grip` (max, lossPerMiss, lossPerLateMs), `belayLowerSec` (2), `allowanceMs`, `gear` ([], `lentAtReception`: ["climbing_shoes"]), `coachId`, `boards` (one per route and boulder), `tasks` (["routes_topped", "black_route"]).
