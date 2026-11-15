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

## Decided at build time (2026-11-14)

- Tricks: twist (Left arrow), somersault (Up arrow), cannonball (Down arrow), one per jump, while in the air. Rebindable in Settings (`diveTwist`, `diveSomersault`, `diveCannonball`).
- The splash grows with the board height, and a cannonball's is 1.8 times bigger.
- Each trick plays its clip (`Twist`, `Somersault`, `Cannonball`) on the diver for the other players.
- One diver at a time on a board edge: the socket refuses a move onto an edge zone (at that board's height) while another player stands on it (`board_taken`); whoever is there can stay and leave.
- The board ends are over the water, so standing on them needs the swimsuit too.

- Task "High diver" (badges only): dives from the 5 m platform, tiers 10 / 50 / 200. The socket reports each accepted jump from `platform_5m` (`POST /api/sports/dives { ref, board }`, realtime route, reply `{ dive: { counted } }`); Laravel counts at most 10 a day per account (Paris day), the same `ref` once.

## Socket contract

| Message | Direction | Payload |
|---|---|---|
| `pool_jump` | client -> server | `{ board }`, sent with Space; accepted only on the board's `edgeZone` with the feet within 0.4 m of its height, once every 1.5 s |
| `pool_trick` | client -> server | `{ trick }`, one of `tricks`, within the fall time of the last accepted jump (+ 0.4 s) |
| `pool_dive` | server -> players in the pool | `{ sessionId, board, heightM, airMs, serverNow }`: the front plays the splash when the diver hits the water |
| `pool_dive_trick` | server -> same | `{ sessionId, name, board, trick }` |

## Proposed placeholder JSON fields

`sport` ("diving"), `boards` ([{ heightM: 1 }, { heightM: 3 }, { heightM: 5, kind: "platform" }] with positions and edge zones), `pitDepthM`, `tricks` (["twist", "somersault", "cannonball"]), `gear` (["swimsuit"]), `tasks` (["platform_dives"]).
