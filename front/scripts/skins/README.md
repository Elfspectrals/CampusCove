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
| `base_body.py` | base body regions + underwear |
| `wear.py` | the pieces, their materials (`W_<slot>_<key>_Main` is the tintable one) and the weight transfer |
| `wear_preview.py` | 256 px preview per piece |
| `run_wear.py` | entry point |

```
blender --background --factory-startup --python front/scripts/skins/run_wear.py -- previews
blender --background --factory-startup --python-expr "p='map-src/CampusCove/build_fp_arms.py'; exec(open(p).read(), {'__file__': p, 'WEAR_TOPS': []})"
npm run assets:optimize -- wear                                           # first-person arms per top
npm run wear:check
```

The first-person arms come from the base body plus the equipped top (`wear/top/<key>/fp_arms.glb`, bare arms in
`wear/bare/fp_arms.glb`).
