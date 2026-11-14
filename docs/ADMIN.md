# In-game admin tools

An admin can, from inside the game, give money, items or a vacant house to themselves or to another player, turn powers on them (invincible, never hungry, never thirsty, full health, full stomach, quenched, sober, stars cleared), collect the house taxes now, and open or close the town market now. The socket calls these Laravel routes for the admin. The pub quiz and the storage sale are started by the socket alone (`POST /api/storage/sale` already exists).

## Who may call

Every route is in the `realtime` group inside `auth:sanctum` (`backend/routes/api.php`, prefix `/api/admin/game`): the socket sends `X-Realtime-Secret` and the admin's own bearer token. Laravel then checks the token's account with the `admin` middleware (`accounts.is_admin`), so the socket's own check is never enough.

| Refusal | Status | When |
|---|---|---|
| `realtime_only` | 403 | no or wrong `X-Realtime-Secret` |
| `admin_required` | 403 | the token's account is not an admin |
| Laravel validation (`errors.<field>`) | 422 | a field below is missing or out of range |

`account_id` is the target: any account that is not deleted (the admin's own id gives to themselves). Laravel does not check that the target is online; the socket offers only online players.

## Routes

### `GET /api/admin/game/items`

Every item that can be given, for the item picker, sorted by kind then name, with its picture (`item_defs.preview_image`, null when it has none) and, for a consumable, what one portion restores. The front sorts them into sections by `kind` and into groups by code prefix (`front/src/game/admin/adminItems.ts`).

An item bought with gems (real money) is never listed nor given (`ItemDef::scopeBoughtWithGems`): its `item_defs.premium_only` is true (the premium skins), or a shop catalog row sells it for gems only (`allow_premium` true and `allow_coins` false, deleted rows ignored, for example `title_freshman`).

```json
{ "items": [ { "code": "farm_apple", "name": "Apple", "kind": "consumable", "preview": "/assets/items/farm/apple/preview.png", "portion": { "hunger": 12, "thirst": 2, "health": 0 } } ] }
```

### `GET /api/admin/game/wallets?account_id=<id>`

The cash and bank of one account, for the player sheet of the watch. `account_id` is an existing, not deleted account (422 otherwise).

```json
{ "cash": 85, "bank": 1240 }
```

### `POST /api/admin/game/money`

| Field | Type | Rule |
|---|---|---|
| `account_id` | integer | existing, not deleted |
| `wallet` | string | `cash` (carried) or `bank` |
| `amount` | integer | 1 to 100,000 |
| `ref` | string | UUID, one per grant |

Answer: `{ "cash": <target cash>, "bank": <target bank> }`. One `transactions` row of type `admin_grant` (`created_by_account_id` = the admin, `meta_json` = `amount`, `ref`, `currency`, `to_account_id`) and one `wallet_ledger` row with reason `admin_grant` on the chosen wallet. The same `ref` sent again pays nothing and answers `bank_already_done` (409).

### `POST /api/admin/game/items`

| Field | Type | Rule |
|---|---|---|
| `account_id` | integer | existing, not deleted |
| `code` | string | an `item_defs.code` |
| `quantity` | integer | 1 to 999 |
| `ref` | string | UUID, one per grant |

Answer: `{ "account_id", "code", "quantity" }`. One `admin_item_grants` row (`ref` unique) and the items are written in one transaction; the items go through `AccountInventoryService::grantItem`, as for the web admin: cosmetics to the locker, the rest to the gift inbox.

| Refusal | Status | When |
|---|---|---|
| `admin_item_premium` | 422 | the item is bought with gems |
| `admin_grant_already_done` | 409 | this `ref` was already used: nothing more is given |

### `POST /api/admin/game/house`

| Field | Type | Rule |
|---|---|---|
| `account_id` | integer | existing, not deleted |
| `unit_id` | string | UUID, a `housing_units.public_id` |

Gives a vacant house for free, as if bought (`AdminHousingService::assign`, `HousingService::occupy`): apartment room, first tax due in 24 h, one house key. No money moves. One `staff_audit_logs` row `housing.assign` (`account_id` = the receiver) and the realtime server is told the housing changed. Answer: `{ "account_id", "unit_id", "model_key" }`.

| Refusal | Status | When |
|---|---|---|
| `unit_not_found` | 404 | no house with this id |
| `unit_not_vacant` | 422 | someone owns it (evict them from the web admin first) |
| `already_owns_unit` | 422 | the receiver already owns a house |

### Taking back

Everything the console gives can be taken back. Money and items need the same `ref` UUID as a grant; replaying a `ref` takes nothing more.

| Route | Body | Answer | Refusals |
|---|---|---|---|
| `POST /api/admin/game/money/take` | `account_id`, `wallet` (`cash` or `bank`), `amount` 1 to 100,000, `ref` | `{ cash, bank }` | `bank_insufficient_funds` 422 (the wallet holds less), `bank_already_done` 409 |
| `GET /api/admin/game/inventory?account_id=<id>` | | `{ items: [{ code, name, kind, preview, quantity }] }`: what the account holds that can be taken (never an item bought with gems) | |
| `POST /api/admin/game/items/take` | `account_id`, `code`, `quantity` 1 to 999, `ref` | the same `{ items }` list after the take | `admin_take_too_many` 422, `admin_item_premium` 422, `admin_grant_already_done` 409 |
| `POST /api/admin/game/house/take` | `account_id` | `{ account_id, unit_id, model_key }` | `unit_not_occupied` 422 (the account owns no house) |

A money take is a `transactions` row of type `admin_take` (`meta_json`: `amount`, `ref`, `currency`, `from_account_id`) and a negative `wallet_ledger` row with reason `admin_take`. An item take is an `admin_item_grants` row with `direction` `take` (`give` for a grant) and `AccountInventoryService::revokeItem`. A house take is the web admin's eviction (`AdminHousingService::kickOwner`, as a seizure: keys revoked, contents boxed), audited `housing.kick_owner`.

### `POST /api/admin/game/taxes/collect`

No body. Runs the same collection as `php artisan housing:collect-taxes` (`HousingService::collectDueTaxesSummary`): only houses whose tax is due are charged. Answer: `{ "charged": <houses that paid at least one day>, "seized": <houses seized for unpaid tax> }`. Running it twice charges nothing the second time, since the due dates have moved on.

### `POST /api/admin/game/market/open`

| Field | Type | Rule |
|---|---|---|
| `minutes` | integer | 1 to 240 |

Opens the market now for `minutes`. If the Saturday market is already open (or the admin opens it shortly before), it stays open at least until its usual 17:00 close. When a market is already open its `market_date` is kept, so its stalls and lots stay; otherwise `market_date` is today in Paris time. Answer: the `GET /api/market` body (`docs/MARKET.md`).

### `POST /api/admin/game/market/close`

No body. Closes the market now and returns every unsold lot to its seller, as `market:close` does. A Saturday market (or the local `MARKET_OPEN_NOW` playtest switch) stays closed until its normal close time, then the schedule takes over again. Answer:

```json
{ "returned": 3, "market": { "open": false, "market_date": "2026-11-21", "...": "the GET /api/market body" } }
```

## Market override

The override lives in the cache under `market.admin_override` (`MarketSchedule::OVERRIDE_CACHE_KEY`) and expires on its own at its end time, so a socket poll or a restart sees the same state. `MarketSchedule::window` reads it before the schedule:

| Override | Market |
|---|---|
| none | Saturday 15:00 to 17:00 Paris, or all day with `MARKET_OPEN_NOW` in local |
| open until T | open until T, then back to the schedule |
| closed until T | closed until T (the end of the market it closed), then back to the schedule |

When an opening ends, the scheduled `market:close` (every minute) returns the lots left. The socket must send a new `market_sync` after it calls open or close.

## Socket messages

The watch's Admin tile opens the console docked on the right (`GameAdminPanel.vue` and its tabs in `components/game/admin/`), which talks only to the socket (`socket/src/admin.ts`). The House tab pins every house on the town picture of the full map (`housePins`): free houses can be given, the chosen player's own house taken back. A message from a player who is not an admin (`is_admin` at join) is ignored, with no answer. Every admin message shares the 500 ms admin cooldown; one inside it is dropped.

### Client to socket

| Message | Payload | Rule |
|---|---|---|
| `admin_open` | none | answered by `admin_menu` |
| `admin_teleport` | `{ key: string }` | a listed place |
| `admin_summon` | `{ sessionId: string }` | the player lands 1.5 m in front of the admin, facing them; refused while they are at the clinic |
| `admin_goto` | `{ sessionId: string }` | the admin lands 1.5 m in front of the player, facing them; not the admin's own id |
| `admin_player` | `{ sessionId: string }` | answered by `admin_player`; no admin cooldown (a read) |
| `admin_items` | none | answered by `admin_items` |
| `admin_give_money` | `{ sessionId: string, wallet: 'cash' \| 'bank', amount: integer }` | `amount` 1 to 100,000 |
| `admin_give_item` | `{ sessionId: string, code: string, quantity: integer }` | `code` `[A-Za-z0-9_]{1,64}`, `quantity` 1 to 999 |
| `admin_market` | `{ action: 'open', minutes: integer }` or `{ action: 'close' }` | `minutes` 1 to 240 |
| `admin_power` | `{ sessionId: string, power: string, on?: boolean }` | a toggle (see Powers) with `on`; or a boost `heal`, `feed`, `drink`, `sober`, `clear_wanted` (no `on`) |
| `admin_moderate` | `{ sessionId: string, action, minutes?, stars?, key? }` | `kick` (never oneself), `jail` with `minutes` 1 to 60 (an officer-held cell: no fine to pay, refused when already jailed), `release` (refused when not jailed), `stars` with `stars` 0 to 5, `send` with a listed place `key` (refused at the clinic, knocked out or jailed) |
| `admin_house` | `{ sessionId: string, unit: string }` | `unit` a UUID; calls `POST /api/admin/game/house` |
| `admin_take_money` | `{ sessionId, wallet, amount }` | as `admin_give_money`; calls `POST /api/admin/game/money/take` |
| `admin_inventory` | `{ sessionId }` | answered by `admin_inventory`; no admin cooldown (a read) |
| `admin_take_item` | `{ sessionId, code, quantity }` | as `admin_give_item`; answered by `admin_result` and a fresh `admin_inventory` |
| `admin_take_house` | `{ sessionId }` | calls `POST /api/admin/game/house/take`, then reloads the housing units |
| `admin_taxes` | none | |
| `admin_quiz_start` | none | starts the pub quiz soon (existing) |
| `admin_storage_sale` | none | starts the storage sale (existing, errors as `admin_error`) |

`sessionId` is a player of the room, the admin's own included. The socket reads that player's `accountId` and sends it as `account_id`; an `account_id` or `ref` in the payload is ignored. The socket makes a new `ref` (`crypto.randomUUID()`) for each grant message, so a message sent again is a new grant. The panel also uses `admin_open` / `admin_menu` for the online players.

### Socket to client

| Message | To | Payload |
|---|---|---|
| `admin_menu` | the admin | `{ destinations: [{ key, name }], players: [{ sessionId, pseudo, distance, stars }], events }`, `events` = `{ quiz: { state: 'scheduled' \| 'registration' \| 'running', startsAt }, storage: { state: 'scheduled', startsAt } \| { state: 'running', index, count }, market: { open, opensAt, closesAt } \| null }` (times in ms, market times ISO) |
| `admin_player` | the admin | `{ sessionId, accountId, cash, bank, stars, vitals: { health, hunger, thirst, intoxication }, powers: string[] }` (cash and bank from `GET /api/admin/game/wallets`, the rest from the socket) |
| `admin_items` | the admin | `{ items: [{ code, name, kind, preview, portion }] }` |
| `admin_inventory` | the admin | `{ sessionId, items: [{ code, name, kind, preview, quantity }] }` |
| `admin_powers` | the player whose toggles changed | `{ powers: string[] }`: the client moves accordingly (fly, speed x2, freeze, endless stamina) |
| `chat_muted` | a muted player who chats | `{}` |
| `user_left` / `user_joined` | everyone else | when invisible is turned on / off |
| `admin_result` | the admin | success: `{ action: 'money', ok: true, sessionId, pseudo, wallet, amount, cash, bank }` (the receiver's new balances), `{ action: 'item', ok: true, pseudo, code, quantity }`, `{ action: 'market_open', ok: true, closesAt }`, `{ action: 'market_close', ok: true, returned }`, `{ action: 'taxes', ok: true, charged, seized }`, `{ action: 'power', ok: true, sessionId, pseudo, power, on, stars, vitals, powers }` (`on` null for a boost), `{ action: 'house', ok: true, sessionId, pseudo, unit, modelKey }`, `{ action: 'moderate', ok: true, sessionId, pseudo, moderation, minutes?, stars?, place?, stars, vitals, powers }`, `{ action: 'take_money', ok: true, sessionId, pseudo, wallet, amount, cash, bank }`, `{ action: 'take_item', ok: true, sessionId, pseudo, code, quantity }`, `{ action: 'take_house', ok: true, sessionId, pseudo, modelKey }`; failure: `{ action, ok: false, message }` (`action` also `items`), `message` from Laravel when it refused |
| `admin_granted` | the receiver (the admin too, when they gave to themself) | `{ kind: 'money', byPseudo, wallet, amount, cash, bank }` (the receiver's new balances) or `{ kind: 'item', byPseudo, code, quantity }` (the receiver reloads their inventory), `{ kind: 'power', byPseudo, power, on }`, `{ kind: 'house', byPseudo, modelKey }` (the receiver reloads their inventory for the key), `{ kind: 'moderate', byPseudo, moderation: 'jail', minutes }`, `{ kind: 'take_money', byPseudo, wallet, amount, cash, bank }`, `{ kind: 'take_item', byPseudo, code, quantity }`, `{ kind: 'take_house', byPseudo, modelKey }` |

A kicked player's connection is closed with code 4002 (`KICK_CLOSE_CODE`, front `ADMIN_KICK_CLOSE_CODE`); the page says an admin kicked them and they can come back.
| `market_sync` | everyone | sent after a market open or close (the socket reads `GET /api/market` again) |
| `housing_units_sync` | everyone | after `admin_taxes` or `admin_house`, when a house changed hands (housing units reloaded) |

## Powers

Owned by the socket (`socket/src/adminPowers.ts`), never saved: toggles stay on until the admin turns them off or the player leaves the room. Every change of the gauges goes through `survival.setStats`, which holds the toggled gauges at 100.

| Power | Kind | Effect |
|---|---|---|
| `god` | toggle | health held at 100, no damage message, never knocked out by damage or alcohol |
| `endless_food` | toggle | hunger held at 100 |
| `endless_water` | toggle | thirst held at 100 |
| `heal` | boost | health to 100 |
| `feed` | boost | hunger to 100 |
| `drink` | boost | thirst to 100 |
| `sober` | boost | intoxication to 0 |
| `clear_wanted` | boost | wanted stars to 0 (`wanted.clearWanted`, saved and broadcast) |
| `endless_stamina` | toggle | sprint, jump and punch spend no stamina (socket and client) |
| `fly` | toggle | the move check only keeps the world bounds and knock-outs: through walls, locked doors and cells, at any speed. The client flies along the look (Space up, Ctrl down, Shift faster) without collisions. No fall damage while flying, and the landing after it is turned off is free |
| `speed` | toggle | the move check allows twice the walk and run speed (`SPEED_POWER_FACTOR`); the client moves twice as fast |
| `freeze` | toggle | every move is refused (`frozen`); the client stops sending moves |
| `invisible` | toggle | the others get `user_left`, no more `user_moved`, the player is left out of the join list, chat and voice reach nobody; off sends `user_joined` |
| `mute` | toggle | chat reaches nobody (the player gets `chat_muted`) and the voice sync subscribes nobody to them |
| `one_punch` | toggle | each landed punch does 100 damage |
