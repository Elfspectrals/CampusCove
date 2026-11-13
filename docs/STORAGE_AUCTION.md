# Storage auction

A house seized for unpaid tax does not lose its contents: its placed furniture and its chest go into one storage lot (`storage_lots`), sold at the live auction of the storage zone every evening at 19:00. Laravel owns the lots, the bids and the money; the socket owns the clock and the live sale; the front only shows it and sends bid intents.

## Zone

The sale happens in the Cove Storage warehouse (zone `storage`, building `work` `storage`). `world.manifest.json` `storage` gives, in world coordinates, the auctioneer, the lot board and the 12 units: `id`, `door` (the roll-up node `Door_Rollup_NN` of the interior), `threshold` (where players stand to look in), `inside` (floor centre), `size` (width, height, depth in metres) and `yaw` (facing the aisle). Written by `front/scripts/apply-storage.mjs` from `park/storage_site/storage_site.layout.json`.

## Lots

| Field | Rule |
|---|---|
| `source` | `seized` (a seized house) or `generated` (filled by the game) |
| Contents | a `storage_lot` container: item instances and stacks, rolled or moved when the lot is created, never at opening |
| Opening bid, seized | 30 % of the shop value, rounded to the nearest 50, at least 50; an item the shop does not sell counts 0 |
| Opening bid, generated | 250 |
| Generated contents | 3 objects among the furniture the shop sells for coins; each object rolls its rarity out of 1000: r1 80 %, r2 17 %, r3 2.5 %, r4 0.5 %, then a furniture of that rarity at random |
| Generated per night | the listed generated lots are topped up to 2 every night (relisted ones count); `(generated_for, generated_slot)` is unique, so opening the same night twice creates nothing |
| Order | seized lots first, then generated, oldest first |
| Unsold | back the next night at 0.6 times the opening bid, rounded to 50, at least 50; destroyed with its contents at the third unsold night |

## Bids

The first bid is the opening bid; then each bid adds +10 while the best bid is under 500, +25 up to 2,000, +50 from 2,000. A bid is paid from the bank (`coins`) and held at once (`storage_bid_hold`); the previous best bid is refunded (`storage_bid_refund`). When the box is sold, the held coins of the winning bid are destroyed: nobody receives them, not even the former owner. The former owner may bid on their own box.

A bid is refused when the lot is not on sale (`storage_lot_closed`, 409), the account is younger than 72 h (`storage_bid_too_young`, 403), the account already won a generated box today and bids on a generated one (`storage_daily_win_cap`, 409), the amount is not the next bid (`storage_bid_stale`, 409, the message gives the next bid), the bidder already holds the best bid with another amount (`storage_already_leading`, 409) or the bank is too low (`insufficient_funds`, 422). The best bidder sending the same amount again gets the same answer.

The winner opens the box at the storage zone: its contents go to their inventory. They can come back and open it later; opening it again returns the same contents and delivers nothing more.

## Laravel routes

| Route | Called by | Body | Answer |
|---|---|---|---|
| `POST /api/storage/sale` | socket only (`X-Realtime-Secret`, no player) | `night` `YYYY-MM-DD` | `lots`: `lot_public_id`, `source`, `former_owner_name`, `opening_bid`, `nights_listed`, `next_bid`, `contents` (`code`, `name`, `rarity`, `model_glb`, `quantity`). Refunds the bids left by an interrupted sale. |
| `POST /api/storage/lots/{publicId}/bid` | socket for a player (token + secret) | `amount` integer 1 to 10,000,000 | `lot_public_id`, `amount`, `leader_account_id`, `next_bid` |
| `POST /api/storage/lots/{publicId}/hammer` | socket only | none | `lot_public_id`, `status` (`sold`, `listed`, `destroyed`), `winner_account_id`, `sale_price`, `opening_bid`; hammering a closed lot again returns the same result |
| `POST /api/storage/lots/{publicId}/open` | socket for the winner | none | `lot_public_id`, `contents`; anyone else gets `storage_not_winner` (403) |

All instances share the same lots: a lot is one row locked during each bid, hammer and opening, so it is sold once.

## Live sale (socket)

The socket starts the sale at 19:00 Paris time (summer and winter time), announces it to everyone at 18:55 (`storage_sale_soon`), and only starts it until 20:00 if it could not start at 19:00. An admin starts it at any time from the watch (`admin_storage_sale`). Constants live in `socket/src/storageSale.ts`, the room handlers in `socket/src/storageAuction.ts`.

The lots of the night go to the units in order (lot 1 in unit 1, and so on); lots beyond the 12th wait for the next night. For each box:

| Phase | Duration | What happens |
|---|---|---|
| `walking` | 4 s | the auctioneer walks to the unit |
| `preview` | 45 s | the roll-up door is up, players look from the threshold, no bids |
| `bidding` | 15 s, +10 s for each accepted bid, no ceiling | players in the bid zone bid; the front calls "going once" at 5 s left and "twice" at 2 s |
| `hammering` | until Laravel answers | the socket calls the hammer; a failed call is tried again on the next tick |
| `result` | 6 s | sold, back on sale next night, or destroyed |

The bid zone is a 6 m circle in the aisle, 3 m in front of the unit's threshold; the auctioneer stands 0.6 m in front of the threshold, facing the aisle.

| Message | Direction | Fields and rules |
|---|---|---|
| `storage_sale` | socket → everyone, on join and on every change | `active`; when active: `night`, `phase`, `endsAt` and `serverNow` (ms, socket clock), `index`, `count`, `unitId`, `lot` (`id`, `source`, `formerOwnerName`, `openingBid`, `contents`), `auctioneer` (`x`, `y`, `z`, `yaw`), `bidZone` (`x`, `z`, `radius`), `leader` (`pseudo`, `amount`) or null, `nextBid`, `result` (`status`, `winnerAccountId`, `price`) or null; always `won` (boxes won tonight not opened yet: `lotId`, `unitId`, `winnerAccountId`, `winnerPseudo`) and, when idle, the auctioneer's place on the stage |
| `storage_bid` | client → socket, no field | bids the `nextBid` the socket holds; refused (`storage_sale_error`) when not bidding (`storage_not_bidding`), outside the bid zone (`storage_out_of_zone`), already leading (`storage_already_leading`), within 1 s of the last bid or while a call is running (`storage_busy`), or by Laravel (its code) |
| `storage_lot_open` | client → socket, `lotId` string | the winner, within 3 m of the unit's threshold, opens a box won tonight; everyone gets `storage_opened` (`lotId`, `unitId`, `pseudo`, `contents`) |
| `storage_open_mine` | client → socket, no field | within 5 m of the auctioneer on the stage, opens every box the player won and left closed, on any day; everyone gets `storage_opened` with `unitId` null |
| `storage_sale_started`, `storage_sale_ended` | socket → everyone | the start (`night`, `count`) and the end of the sale |
