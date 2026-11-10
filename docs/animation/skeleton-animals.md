# Skeleton: animals

CampusCove animals keep the skeleton and clips of a CC0 Quaternius animal and wear our own low-poly pieces
(`docs/ANIMALS.md`, `map-src/CampusCove/build_animals.py`). Quaternius builds one skeleton and one clip set per body
plan, then puts another shape on it. A new animal starts from the family that matches its body plan.

## Families

| Family | Template (Poly Pizza, CC0) | Joints | Skin | Clips |
|---|---|---|---|---|
| Bird | chicken `Z3RCoCYss4`, chick `LH96IMq0rE` | 7 | rigid, 1 bone per vertex | Idle, Idle_Peck, Run, Attack, Death |
| Small quadruped | pig `u35l6uP5vj` (13), sheep `rgJXF570ZK` (16) | 13-16 | rigid | Idle, Idle_Eating, Walk, Run, Jump_Start, Jump_Loop, Headbutt, Death |
| Large quadruped | cow `26zM1outCr` | 42 | smooth, up to 4 bones | 13 clips (Walk, Gallop, Eating, Idle_Headlow, Attack_Kick...) |

Hierarchies (`_end` leaf bones omitted):

```
Bird             Root > Leg.L, Leg.R ; Body
Small quadruped  All > FrontLeg.L/R, BackLeg.L/R, Body > [Neck >] Head ; All > [Tail]   (pig has Neck, sheep has Tail
                 and a separate Root bone beside All)
Large quadruped  Body > Back > Torso > Torso2 > Torso3 > Neck1 > Neck2 > Neck3 > Head
                       Torso2 > FrontShoulder.L/R > FrontUpperLeg > FrontLowerLeg
                       Back   > BackShoulder.L/R > BackLeg > BackUpperLeg > BackLowerLeg
                       Back   > Tail1 ... Tail7
                 IKFrontLeg.L/R, IKBackLeg.L/R and PoleTarget* controls (exported as joints)
```

- The bird rig has **no head bone**: the head is part of `Body`. A head-bob is faked with `Body` pitch and
  translation; a real Head bone changes the rig and the skin, so it is a decision for the user.
- Small quadrupeds have one bone per leg (no knee).
- The cow's imported clips are already baked (glTF carries no constraints); its IK*/PoleTarget* controls arrive as
  ordinary joints. Set `use_deform=False` on them before automatic weights, author FK on the deform bones only, and
  keep 4 influences per vertex at most **(to check on the imported cow)**.

## Chicken (built)

Source rest pose, after `import_rig`, in source units (the armature object then scales by about 0.36 to 0.45 m):

| Bone | Head (Blender world) | Moves |
|---|---|---|
| Root | (0, 0, 0) | parent of the legs |
| Leg.L / Leg.R | (±0.106, 0.031, 0.301) | swing from the hip; pieces `Chicken_Leg_*` |
| Body | (0, 0, 0.253) | everything else: body, head, beak, comb, wattle, eyes, wings, tail |

- The armature object keeps the Quaternius transform: rotation -90° about X and scale 100 × `scale_to_height`.
  Never apply it: the imported clips rely on it. Armature space is X = side, Y = down, Z = backward, and `P.move`
  offsets are in armature units (divide metres by `arm.scale[0]`).
- Signs measured on the chicken: `rx` positive on `Leg.*` swings the leg backward (forward is negative, as on the
  human); `rx` positive on `Body` pitches the beak down.
- Clip names are lowercased on import: `idle`, `idle_peck`, `run`, `attack`, `death`. Our own: `walk` (`bird_walk`,
  20 frames at 24 fps = 0.83 s, legs in stance 70 % of the cycle, ±18° sweep, body drops to keep the planted foot on
  the ground, roll 3° at k = 1, nod 6° at k = 2 with a hold then a thrust before each touchdown). Design speed about
  0.14 m/s.

## Authoring rules for animals

- Load the human `Pose` helper at module level with `exec`, globals `SKINS_DIR` and `bpy` (`build_animals.py`). It
  also defines an `export_glb` that is not `lib_common.export_glb`.
- Call `sample_actions(arm, clips, fps=sc.render.fps)`: the Quaternius clips are imported at 24 fps and the default
  30 would play them 25 % too fast.
- `sample_actions` deletes the NLA tracks that hold the imported clips: they survive with no user until the next
  `new_build_scene`, so build and export in one run, without saving the .blend in between.
- Export with `export_anim_slide_to_zero=True` so the new clips start at t = 0 like the imported ones.
- `export_animal` refuses to export when an action other than this animal's clips exists in the file (ACTIONS mode
  would ship it), and sets the `idle` slot explicitly.
- Never give a new clip the name of an imported one unless the user asked to replace it.

## Adapting a template

Keep bone names, hierarchy and rest orientation; change only bone lengths and positions, moderately. Rotation
clips survive; translation keys (body bob, neck, tail) are few and small. A much longer neck or legs needs new
clips. Never retarget across families (bird, quadruped, humanoid): author the clip for the family instead.
