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
