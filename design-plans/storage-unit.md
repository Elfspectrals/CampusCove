# Storage units of the storage warehouse

Approved by the user on 2026-11-13. The storage warehouse holds 12 roll-up storage units, 2 rows of 6, facing each other across a central aisle. A unit shows the contents of the storage lot sold in it (`docs/STORAGE_AUCTION.md`).

## Unit

- One unit model built by a Blender builder (`build_storage_warehouse.py`), not `make model`: a simple repeated shape (back and side walls, floor, frame, roll-up door in slats) is cleaner as a builder.
- Inside: 4 m wide, 4 m deep, 2.6 m high, so a full house (up to 51 objects) fits. Roll-up door in its own node (`Door_Rollup`), raised by the game when the unit opens.
- About 800 triangles for the empty unit.
- Door colours: 3 tints (rust orange, steel blue, faded green), fixed per unit index so the rows look worn but stable. A unit number painted above each door (1 to 12).

## Warehouse

- Zone `storage`, built like the clinic: a standalone `work` building (`build_storage_warehouse.py` interior, `build_storage_warehouse_ext.py` exterior, `build_storage_site.py` site and path, `apply-storage.mjs`), flat ground.
- About 34 × 16 m inside: 2 rows of 6 units along the long walls (4 m deep each), a 6 m aisle between them, the auctioneer's stage at the far end with a lot board above it, the entrance at the other end. Strip lights, concrete floor, metal walls.
- Placed around x 150, z 0. A path leaves the town hedge on the east side between Sunny Nook (house_03) and Mint Villa (house_04), around (44, -10), and runs straight to the warehouse door, about 100 m.
- Auctioneer NPC in work clothes: coveralls and ear defenders, built like player clothes on the base body, standing on the stage.

## Contents

- The real models of the lot's items (`model_glb` from the lot contents), never baked into the unit. The front builds the pile when the lot is shown.
- Layout: a messy pile filling the unit from the back wall to about 0.5 m from the door. Big pieces on the floor first, small ones on top or in the gaps. Seeded by the lot id, so every player sees the same pile.
- Tarps: most pieces are under a tarp that keeps their outline (a box hull of the piece, draped, grey-brown cloth). 1 or 2 pieces are left uncovered, picked by the same seed. A stack of several copies of one item shows as one covered pile.
- Rule shown to players: everything you see is in the box, and everything in the box is shown (covered or not).
- An empty unit (no lot) stays closed.

## Questions answered

- Location: far edge of the world, around x 150 (2026-11-13).
- Building: indoor warehouse (2026-11-13).
- 12 units, 2 × 6, 4 × 4 m each (2026-11-13).
- Auctioneer in work clothes: coveralls and ear defenders (2026-11-13).
- Contents: messy pile under tarps, 1 or 2 pieces uncovered (2026-11-13).
