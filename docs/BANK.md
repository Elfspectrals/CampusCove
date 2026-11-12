# Cash, bank and ATMs

Money earned in the game lives in two wallets per account (`wallets.currency`):

| Wallet | Currency | Paid to it | Taken from it |
|---|---|---|---|
| Cash, carried | `cash` | orchard sale, zone buyers, pub rewards, withdrawals, cash received in a trade | shops and baskets, pub orders and fees, clinic heal, deposits, cash given in a trade |
| Bank | `coins` | welcome bonus, referrals, deposits, transfers received | house purchase, housing tax, hospital bill, hangover bill, withdrawals, transfers sent |

The housing tax is taken from the bank only: a bank too low for the tax loses the house even with cash on the player.

## ATMs

An ATM is a zone prop `{ "kind": "item", "key": "atm", "code": "decor_atm", "forSale": false }` in any `front/public/assets/zones/<zone>.json`. The socket reads their positions at start-up (`loadAtms`), the front shows them and the "Use the ATM" prompt.

## Socket message `atm` (client → socket)

| Field | Type | Rule |
|---|---|---|
| `action` | `'withdraw' \| 'deposit' \| 'transfer'` | required |
| `amount` | integer | 1 to 1,000,000 |
| `ref` | string | 8 to 40 of `A-Z a-z 0-9 -`, one per operation (the front sends a UUID) |
| `request` | integer | optional, echoed back to match the answer |
| `username` | string | transfer only, 1 to 64 characters, trimmed |
| `tag` | integer | transfer only, 0 to 9999 |

The socket refuses when the player is knocked out or has no token (`atm_cannot_use`), stands more than 2.5 m (horizontal) from every ATM (`atm_too_far`), sends an invalid field (`atm_bad_request`) or sends again within 500 ms (`atm_busy`). Otherwise it calls Laravel `POST /api/bank/<action>` on the realtime routes with `ref` prefixed by the account id, so the same operation sent twice is done once (`bank_already_done`, 409).

Answers (socket → client):

- `atm_done` `{ action, bank, cash?, request }`: `cash` is absent for a transfer, which only moves bank money.
- `atm_error` `{ message, code, request }`: the socket codes above, or the Laravel code (`bank_insufficient_funds`, `bank_unknown_recipient`, `bank_self_transfer`, `bank_account_too_new`, `bank_already_done`).

## Laravel routes

- `GET /api/bank` (player token): `{ cash, bank, history }`, the last 20 bank ledger rows `{ reason, delta, at, from, to }`; `from` and `to` are `name#tag` for transfers.
- `POST /api/bank/deposit`, `/withdraw` `{ ref, amount }` and `/transfer` `{ ref, amount, username, tag }`: realtime routes, socket only. A transfer needs a sender at least 72 h old (`TradeService::MIN_GIVER_AGE_HOURS`).

## Cash bag at death

When health reaches 0 (not an alcohol black-out), the socket calls `POST /api/survival/hospital` with `{ killer_account_id }` when a punch knocked the player out. In the same request Laravel (`CashDropService`) takes all the cash carried out of the ledger (`cash_drop`) and answers `cash_drop: { id, amount, expires_at } | null`:

- `null` when the player carried no cash, or when the account is younger than 72 h: its cash is destroyed and no bag drops, so an alt account cannot hand its welcome bonus to the account that knocks it out.
- otherwise a `cash_drops` row lives 5 minutes (`CashDropService::LIFETIME_MINUTES`). Anyone can pick it up, its owner included, except the killer. The pickup locks the row and succeeds once (`cash_pickup`); after the expiry the coins are gone.

Socket messages:

- `cash_bag_dropped` `{ id, x, y, z, expiresAt }` to everyone, at the eye position where the player fell (the front puts the bag on the ground); `init.cashBags` lists the bags still on the ground; `cash_bag_removed` `{ id }` when a bag is picked up or expires.
- `cash_bag_pick` `{ id }` (client → socket): refused when knocked out (`cash_bag_cannot_pick`), farther than 2 m (`cash_bag_too_far`) or within 500 ms of the last try. The socket then calls `POST /api/cash-drops/{id}/pick` (realtime route) and answers `cash_bag_picked` `{ id, amount, cash }` or `cash_bag_error` `{ id, message, code }` (`cash_drop_gone` 409, `cash_drop_killer` 403).
- `survival_hospital_bill` carries `lostCash`, the amount dropped.

## Chat message `chat` (client → socket)

`{ text }`, 1 to 120 characters after trimming and collapsing spaces, one message per second. The socket relays `user_chat { sessionId, text }` to players within 30 m on the same side of a house wall, never back to the speaker.
