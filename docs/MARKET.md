# Town market

An outdoor market held every Saturday from 15:00 to 17:00 (Europe/Paris) on its own square near the town centre. Six stalls appear, players claim one, lay out lots of their items with a price, and other players buy them in cash. Market NPCs are ambience only: they never buy, so the market creates no coins.

Laravel (`MarketService`) owns the schedule, the stalls, the lots and every coin and item movement. The socket checks that the player stands at the stall and forwards intents; the front only shows and sends intents.

## Schedule

`MarketSchedule`: open when the Paris time is Saturday and `15:00 <= time < 17:00`.

| Paris time | Open |
|---|---|
| Saturday 14:59:59 | no |
| Saturday 15:00:00 | yes |
| Saturday 16:59:59 | yes |
| Saturday 17:00:00 | no |
| Sunday 15:30 | no |

A market is identified by its date (`market_date`, the Saturday in Paris time, `YYYY-MM-DD`).

Playtest: `MARKET_OPEN_NOW=1` in `backend/.env` opens the market all day, every day, when `APP_ENV=local` (ignored in any other environment). Put it in `.env` rather than in the container environment: `php artisan serve` only passes a few variables to the PHP server.

An admin can also open or close the market now from the game; the override wins over the schedule and the playtest switch until it ends (`docs/ADMIN.md`).

## Rules

| Rule | Value |
|---|---|
| Stalls | 6, numbered 1 to 6 |
| Stalls per player and market | 1 |
| Stall fee | 15 coins in cash, not refunded |
| Lots per stall | 6, numbered 1 to 6 |
| What can be sold | any tradable item (`TradeService::isTradable`), not worn |
| Lot quantity | 1 to the item's `max_stack`, at most 999 |
| Unit price | free, 1 to 1,000,000 coins |
| Container | `crate`, `basket` or `flat` (laid on the table), picked by the seller for each lot |
| Payment | buyer's cash to seller's cash |
| Tax | 5 % of the sale total, rounded down, only when the total is 20 coins or more |
| Account age | claiming a stall and buying both need an account at least 72 h old (`TradeService::MIN_GIVER_AGE_HOURS`), as for trades |
| Canopy colours | `red`, `blue`, `green`, `yellow`, `orange`, `purple` |

Tax examples: a total of 19 pays 0, 20 pays 1, 39 pays 1, 100 pays 5.

Items of a lot leave the seller's inventory when it is listed (escrow on the lot) and come back when the lot is withdrawn or when the market closes. `php artisan market:close` (scheduled every minute) returns every unsold lot of a market that is no longer open.

## Endpoints

`GET /api/market` (any signed-in player): the current or next market.

```json
{
  "open": true,
  "market_date": "2026-11-14",
  "opens_at": "2026-11-14T15:00:00+01:00",
  "closes_at": "2026-11-14T17:00:00+01:00",
  "stall_fee": 15,
  "stalls": [
    {
      "stall_no": 2,
      "account_id": 41,
      "canopy": "blue",
      "lots": [
        { "lot_id": 9, "slot": 1, "code": "farm_apple", "name": "Apple", "quantity": 18, "unit_price": 5, "container": "crate", "preview_image": "/assets/...", "model_glb": "/assets/..." }
      ]
    }
  ]
}
```

Only claimed stalls are listed; only active lots are listed. When the market is closed, `stalls` is empty and the dates are those of the next market.

The others are `realtime` routes: the socket calls them with the player's token after checking that the player stands at the stall.

| Route | Body | Result |
|---|---|---|
| `POST /api/market/stalls` | `stall_no` 1-6, `canopy` | the stall; a retry for the same stall returns it without charging again |
| `POST /api/market/lots` | `slot` 1-6, `code`, `quantity`, `unit_price`, `container` | the lot, on the player's own stall |
| `POST /api/market/lots/{id}/withdraw` | | the items come back to the seller |
| `POST /api/market/lots/{id}/buy` | `quantity`, `purchase_ref` (unique, at most 64 characters) | `{ "cash": <buyer cash>, "quantity_left": <left in the lot> }`; a retry with the same `purchase_ref` by the same buyer on the same lot returns the same answer without buying again |

## Socket

`socket/src/market.ts`. Stall positions come from the zone files: a prop with `kind: "market_stall"` and `stallNo` 1-6 (unique, checked by the front zone parser and the socket) is stall `stallNo`; the six stalls are in `front/public/assets/zones/town_market.json`. The socket refuses every action made more than 3 m (`STALL_REACH`) from the stall it targets: the claimed stall, the player's own stall for a lot, the lot's stall for a withdrawal or a purchase.

Client to server, one message `market`:

| `action` | Fields |
|---|---|
| `claim` | `stallNo` 1-6, `canopy` |
| `list` | `slot` 1-6, `code`, `quantity` 1-999, `unitPrice` 1-1,000,000, `container` |
| `withdraw` | `lotId` |
| `buy` | `lotId`, `quantity` 1-999, `ref` (8-40 of `A-Z a-z 0-9 -`, sent to Laravel as `<accountId>-<ref>`) |

Every message may carry a `request` number, echoed in the answer. One action per player every 500 ms.

Server to client:

| Message | To | Payload |
|---|---|---|
| `market_sync` | everyone, on join and after every change | the `GET /api/market` body |
| `market_done` | the player | `action`, `request` and the API answer |
| `market_error` | the player | `message`, `code`, `request`; socket codes `market_cannot_use`, `market_bad_request`, `market_busy`, `market_too_far`, `market_closed`, `market_no_stall`, `market_lot_gone`, or the API code |
| `market_sold` | the seller, when online | `lotId`, `code`, `quantity` |

The socket refreshes the state at the next opening or closing time (plus 1 s) with the token of a connected player, and again when someone joins after that time.

## Front

`useMarketStalls` draws each stall from `market_sync`; `useMarket` turns the crosshair into a prompt: a lot of another player's stall (within 2.4 m, tight cone) shows its name, price and stock and G opens the buy window; a free stall (when the player holds none) offers it for `stall_fee`; the player's own stall opens their table. `useMarketCrowd` walks the six `market_shopper_*` NPCs of `zones/town_market.json` from stall to stall while the market is open. The front never decides a price, a stock or an opening time: it shows what `market_sync` says.

## Rejection codes

| Code | Status | When |
|---|---|---|
| `market_closed` | 409 | outside the market hours |
| `market_account_too_new` | 403 | account younger than 72 h |
| `market_stall_taken` | 409 | another player holds the stall |
| `market_already_has_stall` | 409 | the player already holds another stall at this market |
| `market_canopy_unknown` | 422 | canopy not in the list |
| `market_container_unknown` | 422 | container not in the list |
| `market_no_stall` | 409 | listing without holding a stall |
| `market_slot_taken` | 409 | the slot already holds an active lot |
| `market_item_unknown` | 422 | unknown item code |
| `market_item_not_tradable` | 422 | item cannot be traded |
| `market_item_worn` | 409 | item is being worn |
| `market_item_missing` | 409 | not enough of the item |
| `market_quantity_too_big` | 422 | more than the item's `max_stack` |
| `market_lot_gone` | 409 | lot sold out, withdrawn, returned or unknown |
| `market_not_your_lot` | 403 | withdrawing someone else's lot |
| `market_own_lot` | 409 | buying from your own stall |
| `market_insufficient_cash` | 409 | buyer cannot pay, stall fee unpaid |
| `market_inventory_full` | 409 | buyer cannot carry that many |
| `market_already_bought` | 409 | `purchase_ref` already used by another buyer or lot |

## Ledger

| Movement | Transaction type | Ledger reason |
|---|---|---|
| Stall fee | `market_stall_fee` | `market_stall_fee` (−15 on the seller's cash) |
| Sale | `market_sale` | `market_purchase` (−total, buyer), `market_sale` (+total, seller), `market_tax` (−tax, seller) |
