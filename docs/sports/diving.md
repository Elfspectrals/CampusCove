# Diving

Diving pit of the pool with a 1 m board, a 3 m board and a 5 m platform. Free play only, **no score**. Shared rules in [README.md](README.md).

## Rules

- Climb the ladder, walk to the end of the board or platform, jump. No queue system, no coach match.
- One player on the end of a board at a time (proposed: the next one is held at the ladder top while someone stands on the edge).

## Controls

- **Jump** (Space) at the end of the board.
- In the air, **1 or 2 trick keys** play a trick: twist, somersault, cannonball (proposed key mapping at build time).
- A splash on entry, bigger for a cannonball.

## Server authority

Light: the socket checks the player is on a board, broadcasts the trick so others see it, and blocks the edge while someone stands on it. Landing in the water hands over to the swimming code.

## Gear

Swimsuit, as for the pool water.

## Rewards

No score. Proposed task "dives from the 5 m platform" (badges only), counted by the socket on a real jump into the water.

## Animations

Ladder climb, edge stance, jump, twist, somersault, cannonball, entry; splash effect and sound.

## Open points

- Exact trick list and keys.
- Whether a tasks counter is wanted at all for diving.

## Proposed placeholder JSON fields

`sport` ("diving"), `boards` ([{ heightM: 1 }, { heightM: 3 }, { heightM: 5, kind: "platform" }] with positions and edge zones), `pitDepthM`, `tricks` (["twist", "somersault", "cannonball"]), `gear` (["swimsuit"]), `tasks` (["platform_dives"]).
