---
paths:
  - "front/scripts/**"
  - "front/public/assets/**"
  - "map-src/**"
---

# Modular assets

Use the `blender-asset` skill. Every new or rebuilt 3D asset is assembled from reusable pieces, never modelled as one block, so a piece can be reused or sold later without rework.

- Buildings: walls, floors, roofs, doors, windows, stairs and trims each come from their own parameterised builder (size, material) and stay separate named nodes in the export. A building is a composition of those pieces; the next building reuses the builders instead of copying geometry.
- Characters and NPCs: an outfit is a set of wear pieces, one per slot, built in `front/scripts/skins/wear.py` and shipped as `public/assets/wear/<slot>/<key>/`, the same format as player clothes. Never bake clothes into an NPC.
- Props and decor: a piece used in more than one place (lantern, crate, fence segment, sign) is one shared builder (`lib_common.py` or a kit module), not redrawn in each build script.
- One object, one model: the same item (for example an apple) uses one `model.glb` everywhere it appears.
- Variants through materials, not new models: a green and a red apple, a wooden and a metal wall, the same shirt in another colour, texture or pattern are one model with swappable materials. Build the model with named material slots so the front can change colour or texture at load time. Clothes follow the same rule so outfits can be customised later (colour already exists as `slotHexes`; texture and style come next).
- The list of variants lives in one shared file, `front/public/assets/variants.json` (item key -> variant key -> colour and texture per material slot), created with the first item that needs it. Blender scripts read it to build previews, the front reads it to apply a variant, and the backend refers to variants by the same keys. JSON, not TS, because the Python build scripts must read it too.
- Touching an existing asset: the parts you change follow this rule; the rest is not rewritten unless asked.
- Decor categories: every folder in `front/public/assets/decor/` is listed in exactly one category of `front/public/assets/decor/categories.json` (the mall editor's Decor folders; a unit test fails otherwise). When a model made with `make model` (or any new decor) is added there, put its key in the category it fits; when none fits, create a new category for it.
- Recolourable parts: every library texture and decor model map is split into its parts (bricks / mortar, planks / gaps, tiles / grout) by `map-src/CampusCove/texture_parts.py`, so the mall editor recolours a part as a whole. `make texture` and `make model` run it (name the parts with `PARTS=bricks,mortar`, largest part first; `make model` writes `parts.json` next to its `model.glb` in `out/ai/<slug>/`, copy both into `decor/<key>/`), and a rerun keeps the part names already given; after adding or changing a texture or decor model any other way, run `make texture-parts`. Outputs: `textures/<key>/mask.png` + `parts` in `texture.json`, `decor/<key>/parts.json` + `parts_<material>.png`. A map with one colour family gets no parts.
