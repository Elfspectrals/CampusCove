# Shelves with item slots

Approved by the user on 2026-11-10. A shelf is a zone prop whose shelves hold item slots; a filled slot shows the item
(a chosen number of copies, arranged in a chosen style) and sells it, an empty slot shows an "out of stock" marker.

## Prop

`kind: "shelf"` in a zone file (front/public/assets/zones/*.json), parsed in `front/src/game/zoneDecor/zoneDecor.ts`.

| Field | Type | Range / rule |
|---|---|---|
| `shelf` | `"gondola" \| "wall" \| "fridge" \| "chiller"` | gondola has 2 faces (front, back), the others 1 |
| `length` | metres | 1 to 6 |
| `levels` | integer | gondola, wall, fridge: 1 to 6; chiller: 1 |
| `slots` | integer per level | 1 to 8 |
| `fill` | object keyed `"<face>.<level>.<slot>"` (face 0 or 1, level 0 = bottom, slot 0 = left seen from the aisle) | only the filled slots; any key out of range is refused |

A filled slot is `{ "code", "key", "price", "count", "arrange" }`:
- `code` / `key`: an item like a zone `item` (consumable or decor code, same `itemAt` checks); `price`: whole coins, the zone
  price of that code (one price per code across the zone, same rule as items and mannequin pieces).
- `count`: copies shown, 1 to the slot capacity of that arrangement (visual only, never a stock).
- `arrange`: `"rows"` (neat grid facing the aisle), `"messy"` (same count, seeded small shifts and turns, about 1 in 6
  knocked over), `"stack"` (copies stacked, pyramid when they do not fit flat), `"front"` (one row pushed to the front
  edge).
- Position, yaw, scale 1, a shelf inside the zone; a shelf with a filled slot sits inside exactly one seller area.

## Geometry

Built from reusable kit pieces (project rule: modular assets), not one model per size: Blender builders in
`map-src/CampusCove/build_shop_decor.py` export `decor/shelf_kit/<piece>/model.glb` unit pieces (upright, board 1 m,
back panel 1 × 1 m, fridge frame and glass door 1 m, chiller tub 1 m); the game and the editor assemble them for
`length` / `levels` in a pure TS module (`front/src/game/shelves/shelves.ts`, tested): unit positions, level heights,
slot boxes (centre, width, depth, height) per face.

## Slots

`shelves.ts` also places the copies of a slot from the item size (`modelSize`) and the slot box: `slotCopies(box, size,
count, arrange, seed)` returns positions and yaws; the seed is `<shelf id>#<slot key>` (`seededRandom`) so every player
sees the same mess. Capacity per arrangement comes from the same function (editor max for `count`).

Empty slot: a small "OUT OF STOCK" tag on the shelf edge, in the editor and in game.

## Buying

Each filled slot is a display of the zone store of its seller area: aim at the slot box, the prompt shows name and
price, a click puts one in the basket, paid at the clerk (zone checkout, zone price list includes slot codes).

## Editor

Content browser **Shop** folder: Gondola, Wall shelf, Fridge, Chiller. Details: type, length, levels, slots, then a
slot grid per face (level rows, slot cells): click a cell to pick an item (search select of the catalogue items with a
model), count, arrangement; clear button. The slot cells show the item preview or "+".
