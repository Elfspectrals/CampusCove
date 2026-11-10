# Premium skins (Blender build scripts)

Procedural sources of the three semi-realistic, rigged skins in `public/assets/skins/`:
`neon_ronin` (cyber-samurai), `street_luxe` (luxury streetwear), `astral_oracle` (astral mage).

Each skin is one skinned mesh (~20k tris, <260 KB with Draco) on a shared 21-bone humanoid rig, plus
secondary bones (cape, sash, pendant, halo rings, orbiting crystals) and three looping clips: `Idle`, `Walk`, `Run`.
The game plays them from the avatar's speed (`updateAvatarAnimation` in `src/avatar/glbCharacter.ts`).

| File | Role |
| --- | --- |
| `lib.py` | primitives (sweeps along a path, boxes, ellipsoids), PBR materials, rig, weights |
| `base.py` | base anatomy, studio lighting / camera for renders |
| `neon.py`, `street.py`, `oracle.py` | one outfit each (geometry + materials + extra bones) |
| `anim.py`, `clips.py` | pose helper, Idle/Walk/Run generators, per-skin secondary motion |
| `assemble.py`, `produce.py` | join + bind, export GLB (Draco) |
| `preview.py`, `post.py` | hero renders -> `preview.png` |
| `run.py` | entry point |

```
blender --background --python front/scripts/skins/run.py              # rebuild the GLBs
blender --background --python front/scripts/skins/run.py -- previews  # hero renders into scripts/skins/out/
python front/scripts/skins/post.py                                    # -> public/assets/skins/<key>/preview.png
```

Conventions: Blender Z-up, the character faces -Y (glTF +Z, what the game expects); feet at z = 0;
emissive strengths stay ~1 (the game uses ACES tone mapping, which washes out brighter values).

Checks: `npm run skins:check` (from `front/`) verifies the committed GLBs — Draco, rigged, Idle/Walk/Run present,
<= 30k triangles, <= 5 MB, shared height, feet at y = 0 — so a model that drifts from the game's contract fails fast.
The generators are deterministic (fixed random seed), so rerunning `run.py` reproduces the committed files up to
Blender-version float noise. The scripts share state through `exec()` globals set by `run.py`; running a single
file on its own raises an explicit error.

## Wearable pieces (base body + clothes)

`run_wear.py` builds the modular character into `public/assets/wear/`: one base body in underwear on the same
21-bone rig (`base/model.glb`, Idle/Walk/Run, one skinned mesh per body region tagged `extras.region`) and the
pieces worn over it (`<slot>/<key>/model.glb` + `preview.png`, slots `hair`, `head_accessory`, `top`, `bottom`,
`shoes`). A piece carries no clip: the game rebinds it to the base skeleton by bone name, and hides the body
regions listed in its `extras.hides`. Pieces are weighted from the nearest body vertices so they follow the body.

| File | Role |
| --- | --- |
| `base_body.py` | base body regions + underwear, and the 6 preset faces per sex |
| `wear.py` | the pieces, their materials (`W_<slot>_<key>_Main` is the tintable one) and the weight transfer |
| `fit.py` | body fits: sex x build, one deformation shared by the body and the clothes |
| `stylized.py` | the stylized character: swept body, hands, simple head, drawn face graphics, haircuts, beard |
| `stylized_base.py` | turns it into game pieces: reference body skinned and split into regions, a head and six faces per sex, haircut pieces |
| `run_stylized.py` | review renders of the stylized man and woman (no export) |
| `sculpt_prep.py` | one-time: places a raw haircut sculpt on our head and saves it in `sculpts/` |
| `sculpt_bake.py` | wraps a haircut onto its sculpt and bakes the locks into a normal map |
| `wear_preview.py` | 256 px preview per piece |
| `run_wear.py` | entry point |

**One skeleton for every character.** The base body ships in six fits, `m_slim`, `m_normal`, `m_broad`, `f_slim`,
`f_normal`, `f_broad` (`base/model.glb` is `m_normal`, the others `base/model_<fit>.glb`). They all carry the same
21-bone rig, bone order and rest pose, so Idle/Walk/Run/Sit play the same on every character; a fit only moves
vertices (`fit.py`). The torso scales by height, the limbs around their bone; head, neck, hands and feet never change.
The same deformation runs on tops and bottoms through their bone weights, so they ship one file per fit too
(`<slot>/<key>/model_<fit>.glb`) and always fit the body they are worn on; hair, head accessories and shoes have one
file. Each body file holds its sex's 6 faces (skinned meshes with `extras.region = "face"`, `extras.face = 1..6`): the
game shows the chosen one and hides the rest. Facial hair uses the `BB_Brow` material. `npm run wear:check` fails
if a fit's rig differs from `base/model.glb` or a fit file is missing.

```
blender --background --factory-startup --python front/scripts/skins/run_wear.py -- previews=newcomer   # only these keys' previews
blender --background --factory-startup --python front/scripts/skins/run_wear.py -- previews
blender --background --factory-startup --python-expr "p='map-src/CampusCove/build_fp_arms.py'; exec(open(p).read(), {'__file__': p, 'WEAR_TOPS': []})"
npm run assets:optimize -- wear                                           # first-person arms per top
npm run wear:check
```

The first-person arms come from the base body plus the equipped top (`wear/top/<key>/fp_arms.glb`, bare arms in
`wear/bare/fp_arms.glb`).

## Sculpted haircuts

A haircut that has a sculpt, `sculpts/hair_<key>.glb`, keeps its own low-poly mesh, triangle budget and rig. The
build wraps its outer shell onto the sculpt and bakes the sculpt's locks into a 512 px tangent-space normal map. The
map is exported as WebP inside the piece, in the `W_hair_<key>_Main` material, so the hair colour tint still applies.
The inner cap, which stays hidden in the skull, and the strands framing the face keep their built shape and a flat
normal. `buzz` has no sculpt: it is a 3 mm cap.

The sculpts are reference shapes, not shipped meshes. Each was made once: an original concept image of a
stylized bust with that haircut, then image-to-3D with Hunyuan3D-2mini (shape only, run locally; Tencent Hunyuan 3D
community licence), then `sculpt_prep.py`. The prep puts the sculpt's nose tip on ours and its top on the top of the
current haircut, keeps the head and hair, and decimates them to 150k faces. To add or redo one:

```
blender --background --factory-startup --python front/scripts/skins/sculpt_prep.py -- <raw_sculpt.glb> <key>
blender --background --factory-startup --python front/scripts/skins/run_wear.py -- previews=hair
```
