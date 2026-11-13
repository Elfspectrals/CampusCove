# In-game admin tools

An admin can, from inside the game, give money or items to themselves or to another player, collect the house taxes now, and open or close the town market now. The socket calls these Laravel routes for the admin. The pub quiz and the storage sale are started by the socket alone (`POST /api/storage/sale` already exists).

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

Every item that can be given, for the item picker, sorted by kind then name.

An item bought with gems (real money) is never listed nor given (`ItemDef::scopeBoughtWithGems`): its `item_defs.premium_only` is true (the premium skins), or a shop catalog row sells it for gems only (`allow_premium` true and `allow_coins` false, deleted rows ignored, for example `title_freshman`).

```json
{ "items": [ { "code": "farm_apple", "name": "Apple", "kind": "consumable" } ] }
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

The panel (`front/src/components/game/GameAdminPanel.vue`, opened from the watch's Admin app) talks only to the socket (`socket/src/admin.ts`). A message from a player who is not an admin (`is_admin` at join) is ignored, with no answer. Every admin message shares the 500 ms admin cooldown; one inside it is dropped.

### Client to socket

| Message | Payload | Rule |
|---|---|---|
| `admin_items` | none | answered by `admin_items` |
| `admin_give_money` | `{ sessionId: string, wallet: 'cash' \| 'bank', amount: integer }` | `amount` 1 to 100,000 |
| `admin_give_item` | `{ sessionId: string, code: string, quantity: integer }` | `code` `[A-Za-z0-9_]{1,64}`, `quantity` 1 to 999 |
| `admin_market` | `{ action: 'open', minutes: integer }` or `{ action: 'close' }` | `minutes` 1 to 240 |
| `admin_taxes` | none | |
| `admin_quiz_start` | none | starts the pub quiz soon (existing) |
| `admin_storage_sale` | none | starts the storage sale (existing, errors as `admin_error`) |

`sessionId` is a player of the room, the admin's own included. The socket reads that player's `accountId` and sends it as `account_id`; an `account_id` or `ref` in the payload is ignored. The socket makes a new `ref` (`crypto.randomUUID()`) for each grant message, so a message sent again is a new grant. The panel also uses `admin_open` / `admin_menu` for the online players.

### Socket to client

| Message | To | Payload |
|---|---|---|
| `admin_items` | the admin | `{ items: [{ code, name, kind }] }` |
| `admin_result` | the admin | success: `{ action: 'money', ok: true, pseudo, wallet, amount }`, `{ action: 'item', ok: true, pseudo, code, quantity }`, `{ action: 'market_open', ok: true, closesAt }`, `{ action: 'market_close', ok: true, returned }`, `{ action: 'taxes', ok: true, charged, seized }`; failure: `{ action, ok: false, message }` (`action` also `items`), `message` from Laravel when it refused |
| `admin_granted` | the receiver (the admin too, when they gave to themself) | `{ kind: 'money', byPseudo, wallet, amount, cash, bank }` (the receiver's new balances) or `{ kind: 'item', byPseudo, code, quantity }` (the receiver reloads their inventory) |
| `market_sync` | everyone | sent after a market open or close (the socket reads `GET /api/market` again) |
| `housing_units_sync` | everyone | after `admin_taxes`, when a house was seized (housing units reloaded) |
