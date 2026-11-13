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
