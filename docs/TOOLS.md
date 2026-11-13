# Job tools

Tools sold in the hardware store aisle. Each one gives a job bonus and hits harder but slower than the punch. Laravel owns the items, their uses and their price; the socket owns the hits, the damage and the pick timing.

## Items (Laravel, migration `add_job_tools`)

| Code | Job bonus | Uses | Price (cash) |
|---|---|---|---|
| `tool_secateurs` | Orchard pick 2.0 s instead of 3.0 s | 600 | 180 |
| `tool_crowbar` | none yet | 300 | 120 |
| `tool_hammer` | none yet | 300 | 120 |
| `tool_wrench` | none yet | 300 | 120 |

- `kind = 'tool'`, `max_stack = 1`: every tool is an `item_instances` row with its own `uses_left` (from `item_defs.max_uses` when granted).
- `item_defs.weapon = true` on every job tool. The house key is a `tool` but not a weapon. The police reads `weapon` to know a held item is an armed one.
- DB checks: `max_uses` only on an unstacked `tool`, `weapon` only on a `tool`, `uses_left > 0` (a tool at 0 is deleted, never kept).
- One use is spent per orchard pick done with the tool and per hit that lands on a player.
- No buyer takes tools back.

Realtime routes (socket only):

| Route | Body | Answer | Refusal |
|---|---|---|---|
| `POST /api/tools/hold` | `{ code }` | `{ code, uses_left }` of the carried tool with the fewest uses | 422 `tool_not_carried` (not in the inventory, locked in a trade, or not a weapon tool) |
| `POST /api/tools/wear` | `{ code }` | `{ code, uses_left }` after one use; `uses_left: 0` means it broke and is deleted | 422 `tool_not_carried` |

A carried tool is an instance in the player's inventory (gift inbox container), not locked by a trade.

Orchard: `POST /api/orchard/pick` takes an optional `{ tool: 'tool_secateurs' }`; with it the minimum interval is 1,750 ms instead of 2,500 ms and one use is spent with the apple, answered as `tool: { code, uses_left }` (details in `docs/ORCHARD.md`).

## Combat (socket)

| Hand | Damage | Cooldown | Reach |
|---|---|---|---|
| Fist | 8 | 0.8 s | 2.5 m |
| Secateurs | 14 | 1.4 s | 2.5 m |
| Crowbar | 18 | 1.7 s | 2.5 m |
| Hammer | 15 | 1.4 s | 2.5 m |
| Wrench | 12 | 1.1 s | 2.5 m |

Health is 100. Every swing costs stamina like the punch. The held tool is read by the server, never declared by the client.

## Death

Every job tool carried (not the house key) goes into the death bag with the cash (`CashDropService::dropAtDeath`): the tool instances move to a `death_drop` container linked by `cash_drops.container_id`, so they leave the victim's inventory. A bag exists when it holds cash or tools (`amount = 0` only with a container). Whoever picks the bag up within 5 minutes gets the cash and the tools, with their wear kept; the API answers `tools` (codes) on the drop and on the pickup, and the hospital bill carries `lostTools`. Same rules as the cash: an account younger than 72 h drops nothing (its tools are deleted), the killer cannot pick up the bag. After 5 minutes the tools stay in the dead container and are gone from the game. The socket empties the victim's hand when they are knocked out.

## Income

The secateurs reach the orchard quota faster, they never pay more: after 300 apples in 24 h an apple pays 0. The hoe waits until the farm quotas are brought to about 900 coins a day (the farm is owned by another branch).
