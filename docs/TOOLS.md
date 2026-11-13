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

The held tools drop on the ground and anyone can pick them up for 5 minutes, then they are gone. Same rules as the cash bag: an account younger than 72 h drops nothing (its tools are destroyed), the killer cannot pick up their victim's tools. The house key never drops.

## Income

The secateurs reach the orchard quota faster, they never pay more: after 300 apples in 24 h an apple pays 0. The hoe waits until the farm quotas are brought to about 900 coins a day (the farm is owned by another branch).
