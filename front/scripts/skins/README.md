# Premium skins (Blender build scripts)

Procedural sources of the three semi-realistic, rigged skins in `public/assets/skins/`:
`neon_ronin` (cyber-samurai), `street_luxe` (luxury streetwear), `astral_oracle` (astral mage).

Each skin is one skinned mesh (~20k tris, <260 KB with Draco) on a shared 24-bone humanoid rig, plus
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
