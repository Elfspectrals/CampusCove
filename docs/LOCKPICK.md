# Lockpicking house doors

A player with a lockpick can pick the locked front door of a house that is not theirs, whether the owner is online or not. Laravel owns the lockpick, its wear, the attempts and the rules that need history; the socket owns the live mini-game (`socket/src/lockpick.ts`): pins rolled and judged on its own clock, and the noise.

## Rules (`LockpickService`)

| Constant | Value | Meaning |
|---|---|---|
| `ITEM_CODE` | `tool_lockpick` | tool, tradable, stacks of 10, sold at Crispin's Hardware for 120 cash |
| `USES_PER_PICK` | 5 | one use is one session at a door, spent when it starts |
| `BREAK_PERCENT_PER_MISS` | 40 | chance that a missed pin breaks the lockpick (the session ends) |
| `HOUSE_PROTECTION_HOURS` | 24 | after a success, nobody can pick that house |
| `BURGLAR_COOLDOWN_MINUTES` | 30 | after a success, the burglar cannot start another session; a failure does not count |

A session is refused when nobody lives in the house (`unit_not_found`, 404), the door is not locked (`door_not_locked`, 409), the burglar is the owner or a key holder (`has_house_key`, 403), the burglar or the owner signed up less than 72 h ago (`burglar_too_new`, `owner_too_new`, 403), the house is protected (`house_recently_burgled`, 409), the burglar is cooling down (`burglar_cooldown`, 429) or has no lockpick (`no_lockpick`, 422).

A success unlocks the door (`door_locked = false`) until the owner or a key holder locks it again.

## Realtime routes (socket → Laravel)

All under the `realtime` middleware, with the burglar's bearer token.

| Route | Body | Answer |
|---|---|---|
| `POST /api/lockpicks/attempts` | `unit_public_id` (string, 64 max) | `{ attempt_id }`; abandons the burglar's open session if any |
| `POST /api/lockpicks/attempts/{id}/miss` | `miss` (integer, 1 to 1000, the miss count in this session: 1, 2, 3...) | `{ broke }`; the same `miss` sent twice is rolled once |
| `POST /api/lockpicks/attempts/{id}/success` | none | `{ ok: true }`; idempotent, `attempt_over` (409) if the session already broke or was abandoned |
| `POST /api/lockpicks/attempts/{id}/abandon` | none | `{ ok: true }`; idempotent |

An unknown session, or one of another account, is `attempt_not_found` (404).

## Mini-game (socket)

A plain door has 3 pins. For each pin the socket rolls a needle period (1,200 to 2,000 ms per turn) and a start phase (0 to 1), and the window is the 12 % arc centred on 0. A press hits when the needle was in the window at any time in the last 150 ms of the socket clock (the client may be late, never early). After each press, hit or miss, the lock settles 8 s before the next press counts, so a perfect door takes about 24 s.

- Hit: the pin is set and the next pin is rolled; the last pin calls `success` and the door unlocks.
- Miss: one set pin drops (none below 0), the socket calls `miss` with the miss count of the session, and Laravel rolls the break.
- Each press is heard within 12 m of the door (`door_sound` with `pick_click` on a hit, `pick_scrape` on a miss).
- A press from more than 3 m, by a knocked-out player, or on a door that was unlocked meanwhile abandons the session.

| Message | Direction | Fields |
|---|---|---|
| `lockpick_start` | client → socket | `unitId` (house public id) |
| `lockpick_press` | client → socket | none |
| `lockpick_cancel` | client → socket | none |
| `lockpick_pin` | socket → client | `pinsSet`, `pins`, `period` (ms), `phase` (0 to 1, at receipt), `window` (0.12), `readyInMs` |
| `lockpick_result` | socket → client | `outcome`: `'set' \| 'miss' \| 'broke' \| 'open' \| 'abandoned'` |
| `lockpick_error` | socket → client | `message`, `code` (`door_not_locked`, `lockpick_too_far`, `has_house_key`, `lockpick_settling`, or a Laravel code above) |

## Trace for the police

Every session is a `lockpick_attempts` row (burglar, house, start, misses, outcome, end). The police reads none of it: the socket calls `reportCrime(room, player, 'lockpick')` from `socket/src/wanted.ts` (police branch) once per session, when Laravel accepts the start, whatever the outcome (+1 wanted star). Not wired until that file exists.
