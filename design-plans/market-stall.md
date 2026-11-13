# Town market stalls

Approved by the user on 2026-11-13. Product choices come from the user; technical choices are picks.

## Square

- Zone `town_market`, east of the town: x 52 to 98, z -41 to 7 (46 × 48 m). Two hedge segments of the town ring are removed between `house_03` and `house_04` (around x 42, z -17) and a path leads from that opening to the square.
- Six stalls in an open U around the centre, the open side facing the hedge opening.
- Centre: a small bandstand, where the market music comes from, with benches around it.
- The square stays all week: paving, bandstand, benches, unlit bunting, a sign "Market on Saturday, 15:00-17:00".

## Stall

- One long table, 3 m wide, under a striped canopy on four posts. Six lots side by side along the table, numbered 1 to 6 from the left as the buyer sees them.
- Three states, one model with separate nodes, picked by the front from `market_sync`:

| State | When | Shown |
|---|---|---|
| Folded | market closed | frame and table, canopy folded, a tarp over the table |
| Free | market open, stall not claimed | bare frame and empty table, no canopy |
| Taken | market open, stall claimed | frame, table and the canopy in the colour the seller picked |

- Canopy colours: `red`, `blue`, `green`, `yellow`, `orange`, `purple` (`MarketService::CANOPIES`), applied to the canopy stripe material at load time from `variants.json` (one model, material variants).

## Lots

- The seller picks a container for each lot: crate, basket, or flat on the table. This adds a `container` field to a lot (`crate`, `basket`, `flat`): a new column, the list endpoint, the socket `list` intent and `docs/MARKET.md`.
- Copies shown: one item model per unit up to 8, then the heap stays full at 8. A lot of 3 shows 3, a lot of 20 shows 8 until 8 are left.
- Copies are laid in a messy heap with the shelf slot placer (`slotCopies`, arrangement `messy`), seeded by the lot id, so every player sees the same heap. Flat items lie in one row.

## Pieces and sources

| Piece | Source | Why |
|---|---|---|
| Stall frame, table, posts | builder (`lib_kit` planks and posts) | planks and posts are what the AI pipeline does badly |
| Canopy (striped, folded) and tarp | builder | flat cloth panels, simple shapes |
| Crate | existing `decor/vegetable_crate` | already in the Farm category |
| Basket | existing `decor/basket_stack`, or one basket from it | already in the Shop category |
| Bandstand | builder (posts, roof, deck) | building pieces |
| Benches | existing `decor/garden_bench` | reuse |
| Bunting and lanterns | builder (string, flags) and the orchard lantern | thin pieces |
| Sign | shared sign builder | reuse |
| Market NPC outfits | `wear/` pieces | project rule: no clothes baked into NPCs |

## Technical picks

- Randomness: fixed hand-made versions for the stall (one model, three states, six colours); heaps seeded per lot id by the front.
- Triangle budget: stall about 1,200 triangles in each state; bandstand about 2,500; items as their own models, at most 8 per lot, so at most 48 copies per stall.
- Positions: each stall is a zone prop with `key: "market_stall"` and `stallNo` 1 to 6 (read by the socket for the reach check).
