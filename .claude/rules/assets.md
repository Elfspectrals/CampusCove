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
- Where a new model comes from: decor, props, plants and food items reuse an existing asset first (`front/public/assets/decor/`, `items/`), otherwise they are generated with `make model`. Clothes reuse a piece of `wear/` or are built in `front/scripts/skins/wear.py`, never with `make model`: a garment must fit and follow the body skeleton. A Blender script draws by hand only what the AI pipeline does badly: building pieces (walls, floors, roofs, doors, windows, stairs, trims) and thin, flat or simple parts (glass panes, planks, rails, fence segments, plain boxes), which come from the shared builders above. Before building anything, list each new piece with its source (existing asset, `make model` or builder) and a one-line reason.
- A new job or location ships its own asset pack in the same change, even when nothing of it is sold yet: the outfit of its NPCs (wear pieces), its building pieces with an interior players can walk into, its consumables (food items under its own group) and a decor category for the editor. The location opens with a first dressing from that pack, placed in its zone file, so it never looks empty; the user reworks it in the editor.
- One object, one model: the same item (for example an apple) uses one `model.glb` everywhere it appears.
- Variants through materials, not new models: a green and a red apple, a wooden and a metal wall, the same shirt in another colour, texture or pattern are one model with swappable materials. Build the model with named material slots so the front can change colour or texture at load time. Clothes follow the same rule so outfits can be customised later (colour already exists as `slotHexes`; texture and style come next).
- The list of variants lives in one shared file, `front/public/assets/variants.json` (item key -> variant key -> colour and texture per material slot), created with the first item that needs it. Blender scripts read it to build previews, the front reads it to apply a variant, and the backend refers to variants by the same keys. JSON, not TS, because the Python build scripts must read it too.
- Touching an existing asset: the parts you change follow this rule; the rest is not rewritten unless asked.
- Decor categories: every folder in `front/public/assets/decor/` is listed in exactly one category of `front/public/assets/decor/categories.json` (the mall editor's Decor folders; a unit test fails otherwise). When a model made with `make model` (or any new decor) is added there, put its key in the category it fits; when none fits, create a new category for it.
- Recolourable parts: every library texture and decor model map is split into its parts (bricks / mortar, planks / gaps, tiles / grout) by `map-src/CampusCove/texture_parts.py`, so the mall editor recolours a part as a whole. `make texture` and `make model` run it (name the parts with `PARTS=bricks,mortar`, largest part first; `make model` writes `parts.json` next to its `model.glb` in `out/ai/<slug>/`, copy both into `decor/<key>/`), and a rerun keeps the part names already given; after adding or changing a texture or decor model any other way, run `make texture-parts`. Outputs: `textures/<key>/mask.png` + `parts` in `texture.json`, `decor/<key>/parts.json` + `parts_<material>.png`. A map with one colour family gets no parts.
- Variety before building: when a new asset holds an array of items (fruit tree, shelf, crate, stall, bookcase, fridge) or is a new plant or natural piece (tree, bush, flower bed, rock), or when the user asks for more variety on an existing one, write a short variety plan before any build script. A single small piece (one rock, one plant) or a tweak to an existing asset does not need one.
  - The plan states a pick for each technical choice: randomness (seeded per instance or fixed hand-picked versions, rolled by the build script, the editor or the server), how many versions to ship, triangle budget.
  - It asks the user, with AskUserQuestion, only the product questions: layout (rows, messy, stacked, clustered, placement rules), item mix (which items, min / max count, empty or full states), visual variants (colours, materials, sizes).
  - Refine it round by round from the answers until the user explicitly validates it. Nothing is built before that.
  - The validated plan is saved in `design-plans/<asset>.md` (like `shelf-slots.md`) in the same change as the asset, so a later rebuild starts from it instead of asking again.
  - The questions happen in the main session before any work is handed to an agent, since agents cannot ask the user.

## `make model` anti-patterns

The texture is the concept image (`ref.png`) projected flat along one axis, and Hunyuan only rebuilds the shape. So a model is only as good as its concept image. Look at every `ref.png` before the 3D step and regenerate with another `SEED=` when one of these shows:

- Wrong anatomy: extra or missing legs, two heads, more than two eyes, a fifth leg made of a tail, legs fused into one block, a beak and a snout on the same head.
- Wrong view: anything rigged or animated (animals) is made with `VIEW=side` (strict profile facing right, legs apart); a three-quarter image projected sideways shifts the face onto the neck and turns the body along the depth axis.
- Extra objects: ground disc, soil, pot, grass tuft, shadow, fence, a second animal, text. Add "no soil, no pot" style words or regenerate.
- Painted details that must move, be recoloured or stay readable on their own (fruit on a tree, eyes, buttons): the mesh will not have them as geometry, and small ones vanish in the projection. Model them as separate pieces (apple trees: `lib_common.import_ai_apple_tree`; animal eyes: `lib_common.add_ai_eyes` finds the pupil in `ref.png` and places a glossy eye on both sides of the head).
- Flat 2D illustration: Hunyuan needs shading to read the volume; the `side` view asks for a 3D render.
- Rim light, outlines and white highlights along the silhouette: they get stretched over the faces seen side-on. Animals project a posterized image (`palette=<colours>` in `project_ref_image`: the rembg silhouette `mask.png`, edge pixels replaced by the interior, each pixel snapped to a small k-means palette), so a stretched face only repeats a body colour.
- Too few triangles or the turbo shape model: decimating an animal to about 1200 triangles gives visible facets and breaks the colour patches. Animals are made with `SHAPE=hunyuan3d-dit-v2-0 STEPS=30 OCTREE=384` and 3000 to 6000 triangles.

For animals, `make model ... VIEW=side CHECK=quadruped` (or `CHECK=biped`) also checks the concept image automatically (one subject, wider than tall, the right number of legs on the ground) and stops before the 3D step when it fails; `make model-checked` retries with the next seeds. After the 3D step `build_barnyard.py` refuses a body that is not lengthwise along the view. Clip rules (hock and bird ankle fold point-backward, the foot goes forward) are in `docs/animation/playbook.md`.
