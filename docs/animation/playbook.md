# Animator Playbook: CampusCove skeletons and clips in code

Scope: design rigs and generate clips with code only, using Blender 5.2 Python, exporting glTF and playing in three.js 0.187. No hand keying, no paid or cloud tools. Confidence is high unless marked **(med)** or **(low)**.

---

## 1. Skeleton design rules

### 1.1 Humanoid (the player rig)

- **The canonical rig has 21 bones**, defined in `front/scripts/skins/lib.py:246-263`:
  - Centre chain: Hips > Spine > Chest > Neck > Head.
  - Each side, `.L` and `.R`: Shoulder > UpperArm > LowerArm > Hand (Shoulder parented to Chest), and UpperLeg > LowerLeg > Foot > **Toe** (UpperLeg parented to Hips).
  - Toe exists. Any brief that lists 20 bones without Toe is wrong.
- **Rest pose, in Blender Z-up metres:**
  - Hips (0,0,0.93)→(0,0,1.06)
  - Head (0,0,1.64)→(0,0,1.88)
  - UpperArm.L (0.19,0,1.50)→(0.34,0,1.22). This is an A-pose, about 60° below horizontal.
  - UpperLeg.L (0.10,0,0.93)→(0.10,-0.005,0.50)
  - Foot.L tail at y=-0.11, Toe.L tail at y=-0.18.
  - `.R` bones mirror x.
  - All bones have `use_connect=False` and `roll=0` (`lib.py:265-294`).
- **Facing:** the character faces Blender -Y, which becomes glTF +Z with `export_yup=True`. +X is the character's LEFT (`lib.py:262`, `wear.py:448`).
- **Map to standards instead of reshaping the rig.** Our 21 bones cover the 15 bones VRM 1.0 requires, plus the optional chest, neck, shoulders and toes (https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md).
  - VRM map: Hips→hips, Spine→spine, Chest→chest, Neck→neck, Head→head, Shoulder.L→leftShoulder, UpperArm.L→leftUpperArm, LowerArm.L→leftLowerArm, Hand.L→leftHand, UpperLeg.L→leftUpperLeg, LowerLeg.L→leftLowerLeg, Foot.L→leftFoot, Toe.L→leftToes. `.R` maps the same way.
  - Mixamo map **(med)**: Spine→Spine, Chest→Spine2. Mixamo's Spine1 has no counterpart, so fold its rotation into Spine or Chest. UpperArm→Arm, LowerArm→ForeArm, UpperLeg→UpLeg, LowerLeg→Leg, Toe→ToeBase, all with the `mixamorig:` prefix.
- **Add bones only when a clip needs them (YAGNI).** Fingers, jaw, eyes and upperChest are optional in Unity Humanoid **(med)**, https://blog.unity.com/technology/automatic-setup-of-a-humanoid. Skin-specific secondary bones go through the `extra` dict (Cape1-3, Sash1-2, Halo, Orb), see `lib.py:265-294` and `clips.py:7-32`.
- **Keep the A-pose bind.** Store a T-pose only as a reference constant for retargeting **(med)**. For T-pose sources, apply per-bone offsets (`retargetClip` `localOffsets`, or bake in Blender). Never rebind the mesh (VRM tpose.md).
- **Mirroring:**
  - Use a single separator style, `.L`/`.R`. Blender does not recognise a bare `HandL` as a pair (https://docs.blender.org/manual/en/latest/animation/armatures/bones/editing/naming.html).
  - roll=0 on mirrored bones gives local frames that are not mirror images of each other. That is harmless while rotations are authored in armature space. It breaks any local-space rotation in three.js (IK, look-at, retarget) **(med)**.
  - Test: bend UpperArm.L and UpperArm.R by +30° on the same semantic axis. The two hand positions must mirror (x negated) within 1e-4 m.
- **Sockets and controls:** set `use_deform=False` on sockets (Hand.R_socket, Head_socket) and on IK/pole bones. `export_def_bones=True` also drops leaf sockets **(med)**, so pick one:
  - (a) Bake the IK into the deform bones and export with `def_bones=True` when no sockets are needed.
  - (b) Keep `def_bones=False` and ship the controls as dead joints.

### 1.2 Animal body plans

| Plan | Rig (CC0 Quaternius) | Skin | Notes |
|---|---|---|---|
| Bird | Root > Leg.L/R, Body | rigid | One-bone legs swing from the hip only. There is **no neck or head bone**: the head is skinned to Body. |
| Small quadruped | All > FrontLeg/BackLeg .L/.R, Body > [Neck >] Head; Tail under All | rigid | 13-16 joints including `_end` leaves. One bone per leg, so no knee. |
| Large quadruped (cow) | 42 joints: 2-segment legs, neck ×3, tail ×7, IK controls | smooth | Imported clips are already baked (glTF has no constraints). Set `use_deform=False` on IK*/PoleTarget* before auto weights. Run Limit Total(4) and then Normalize **(med)**. |

**Leg anatomy.** If you bend the wrong joint, every clip looks broken.

- Plantigrade animals (bear, human) put the whole foot down.
- Digitigrade animals (dog, cat) walk on the toes.
- Unguligrade animals (cow, horse) stand on the hoof tip.
- On digitigrade and unguligrade legs, the joint that seems to bend backwards is the **hock, an ankle**. It folds point-backward. The real knee sits high, near the body (https://vanat.ahc.umn.edu/run/plate6.html).
- Birds follow the same rule: the visible backward joint is the ankle, and a 2-segment low-poly bird leg must fold point-backward (https://en.wikipedia.org/wiki/Bird_feet_and_legs).

**Full quadruped leg** **(med)**, for when you build a hero body plan:

- Use about 3 joints per front leg and 4 per hind leg.
- Pre-fold the rest pose: chain length divided by the hip-to-foot distance should be about 1.30, within 1.15-1.50 (https://app.cinevva.com/blog/2026-08-19-auto-rigged-animals-straight-legs).
- Keep the thigh and metatarsus nearly parallel at rest, and counter-rotate the shin (Rigify paw, https://projects.blender.org/blender/blender-addons/src/tag/v4.1.1/rigify/rigs/limbs).
- Add a scapula bone under the chest and drive it at about 0.5× the upper front leg's rotation (https://blenderartists.org/t/quadruped-rigging-examples-for-spine-shoulders/549266).

**Reuse a template or build a new rig.** Reuse one rig per body plan across species (bird for chicken, duck and pigeon; small quadruped for dog, fox and cat; https://docs.godotengine.org/en/4.4/tutorials/assets_pipeline/retargeting_3d_skeletons.html):

- Keep names, hierarchy, parent order and **rest orientation and roll** identical. Change only bone lengths, along the bone's local Y.
- Clips carry rotation tracks only. Translation goes on the root or Hips alone, scaled by the hip-height ratio.
- Build a new rig only when the body plan changes: a different joint count per limb, or a neck or head that the mesh actually needs.

**Proportions.** When leg length changes a lot, rotation-only reuse makes the feet slide. Derive stride from hip height per species, as a Pose parameter or with a foot-lock pass **(med)** (Unreal retargeting docs).

**Bone budget** **(low)**: 10-50 bones per animal, with 1-2 influences per vertex. Do not over-rig a chicken.

**Our own meshes are rigid**, each piece 100% weighted to one bone (`map-src/CampusCove/build_animals.py:69-91`).

- Place bone heads at the piece pivots.
- Bending past about 45-60° opens gaps between pieces. Cap the joints with overlap or limit the amplitude, and check visually (https://cseweb.ucsd.edu/classes/wi19/cse169-a/readings/3-Skin.html).

---

## 2. Authoring clips in code

### 2.1 Core model

- **A clip is a pure function `pose = f(phase, P)`** with phase in [0,1).
- **Sample integer frames 0..N with `ph = fr/N`**, so key N equals key 0. glTF clips load with linear interpolation, which does not wrap (`GLTFLoader.js`, LINEAR → InterpolateLinear): the clip duration is the last key time, and without the closing key the step from the last key back to 0 is a hard jump. Clip duration = N/fps.
- **Seamless loops:** every channel is built from `sin` or `cos(2π·k·phase + c)` with **integer k**:
  - k=1 for lateral sway and leg swing
  - k=2 for vertical bob and head nod in walk and trot
  - Wrap each leg's offset with `mod 1`.
  - A non-integer harmonic, or an ease that does not return to its start value, makes a pop at the seam (https://history.siggraph.org/wp-content/uploads/2022/09/2017-Talks-Bollo_High-Performance-Animation-in-Gears-of-War-4.pdf).
- **Phase convention:**
  - Phase 0 = left touchdown: LH for quadrupeds, L for bird and human.
  - Offsets are always **touchdown** offsets. Mixing touchdown and lift-off shifts every leg by the duty factor DF.
- **Stance and swing per leg:** `s = (phase - offset) mod 1`.
  - Stance while `s < DF`: the foot moves backward linearly at the root speed.
  - Swing otherwise: lift = `H·sin(π·u)`, where u is swing progress from 0 to 1.
  - The swing covers the same arc DF/(1-DF) times faster than stance (2.33× at DF 0.7) (https://bigai-ai.github.io/tongsim/guides/procedural_animation).
- **Foot sliding is a distance problem, not a time problem.**
  - Stride S = v_design × T.
  - For a one-bone leg pivoting at height h, the stance sweep is `θ = 2·atan(DF·S/(2h))`.
  - At runtime, set `timeScale = v_actual/v_design` and keep it within 0.75-1.25. Outside that range, switch clips (https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/AnimDistanceMatchingLibrary).
  - Keep the sweep of an angle-linear one-bone leg under about 30°, or raise the body by `h(1-cosθ)` at the extremes.
- **Walk or run:** use the Froude number `Fr = v²/(g·h)`, with h = hip height.
  - Bipeds and birds switch from walk to run near Fr 0.5. That is about 2.1 m/s for h=0.9 (https://en.wikipedia.org/wiki/Transition_from_walking_to_running).
  - Quadrupeds move to a trot near Fr 1.0 and to a canter or gallop at Fr 2-3 **(med)** (https://en.wikipedia.org/wiki/Froude_number).
  - DF > 0.5 is a walk; DF < 0.5 is a run with an aerial phase.
- **Chains** (cow tail ×7, neck ×3, small tail): the angle of bone i is `A_i·sin(2π(phase − i·k))`. Use a lag of about 0.04-0.08 phase per bone, with amplitude **growing toward the tip** **(med)**. Equal amplitude on every bone compounds into a whip.
- **One-shot easing (minimum jerk):** `x = x0 + (x1−x0)(10u³ − 15u⁴ + 6u⁵)`. Velocity and acceleration are zero at both ends (https://nbviewer.jupyter.org/github/demotu/BMC/blob/master/notebooks/MinimumJerkHypothesis.ipynb).
  - Player-triggered anticipation is 2-4 frames. Spend the remaining frames on follow-through (https://www.gamedeveloper.com/production/the-12-principles-of-animation-in-video-games).
- **Squash and stretch:** scale the stretch axis by s and the other two axes by `1/√s` to keep volume (https://arxiv.org/pdf/2104.04934).
  - Rigid skin squashes the whole piece and all its children. Use it on leaf bones only, or counter-scale the children.
  - Never key non-uniform scale on a bone that has rotated children: glTF TRS cannot store the resulting shear.
- **Variation** **(low)**: idle noise is a sum of integer-harmonic sines, at 1-3° on Spine, Chest and Head. Per-instance variety (a phase offset, timeScale 0.9-1.1) belongs in three.js, not in the clip.

### 2.2 Recipe: human walk

Key poses per step, as phases (https://en.wikipedia.org/wiki/Walk_cycle):

| Phase | Left leg | Frame at N=30 |
|---|---|---|
| 0.000 | contact | 0 |
| 0.125 | down | ~4 |
| 0.250 | passing | ~7-8 |
| 0.375 | up | ~11 |
| 0.500 | right contact, mirrored | 15 |

Starting amplitudes **(med)** (https://www.medicine.missouri.edu/sites/default/files/pm-r/2020_Normal_Gait.pdf):

- **Hip:** about +30° flexion at contact, −10 to −14° extension at push-off.
- **Knee:** about 0° at contact, 15-20° at "down", 60-65° peak in early swing ("passing").
- **Ankle:** about +10° dorsiflexion in swing, −10° plantarflexion at toe-off.
- **Hips bob:** a sinusoid at **2× stride frequency**, lowest at the two "down" poses. About 5 cm peak-to-peak for an adult; scale by hip height (0.93 m here). At 1× frequency it reads as a limp.
- **Pelvic yaw and list:** ≤4-5°.
- **Arms** **(low)**: counter-phase to the same-side leg (phase + 0.5), shoulder about 15-25°. Run raises the LowerArm bend bias more than the shoulder swing (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4549059/).
- **Sign:** "forward" is a **negative** angle about +X for legs that point down (`anim.py:110`).
- **Style:** treat the clinical angles as ratios and exaggerate them for the chibi pastel style.

**Repo now:** the game walks at 5 m/s and sprints at 8.5 m/s, faster than a human walk. `gait_cycle` (`anim.py`)
builds both clips as speed-matched cycles with IK-planted feet: Walk (`JOG`) 21 frames for 5.0 m/s, Run (`SPRINT`)
18 frames for 8.5 m/s, and the runtime sets `timeScale = speed / design speed`. The clinical walk numbers above apply
to a slower walk, if one is ever added.

### 2.3 Recipe: pick an apple overhead (one-shot)

Repo reality: the pick is a hold of `PICK_MS = 3000` ms (`front/src/game/orchard.ts:6`). CampusCove ships one 90-frame
`Pick` clip (3.0 s at 30 fps, `pose_pick` in `front/scripts/skins/clips.py`), built from key poses with minimum-jerk
easing (`key_poses` in `anim.py`):

| Phase | Pose |
|---|---|
| 0.00 | rest |
| 0.05 | anticipation: Hips −2 cm, hips/knees/ankles bend (−14°, +26°, −12°), right arm back +10° |
| 0.22 | reach: `UpperArm.R` −145° (forward then overhead), Chest −8°, Spine −4°, Head −18° (look up), left arm +18° back |
| 0.27 → 0.70 | grab and hold: Hand.R curls; two small tugs (Hand, LowerArm, Chest at 2 cycles) |
| 0.82 | pull down in front: `UpperArm.R` −40°, `LowerArm.R` −70° |
| 0.92 | settle with a small overshoot |
| 1.00 | rest |

Runtime: `playClip` plays every clip as LoopRepeat today (`glbCharacter.ts`). Pick needs its own state path with
`setLoop(LoopOnce, 1)`, `clampWhenFinished = true` and a return to the selector on `finished` or on cancel. A cancel
mid-reach crossfades back to Idle. A three-clip split (reach / hold loop / return) fits a hold of unknown length;
build it only if the pick duration stops being fixed.

At −145° the shoulder pinches on the rigid skin: check the Shoulder/UpperArm seam and a clothed avatar.

### 2.4 Recipe: chicken walk (bird rig, target height 0.45 m)

Numbers from https://pmc.ncbi.nlm.nih.gov/articles/PMC4828670, with U in m/s:

- **Legs:** offsets 0 and 0.5. DF about 0.70-0.80; never below 0.5.
- **Cadence and stride:**
  - Stride frequency f ≈ 1.8-2.0·U^0.53 Hz.
  - Stride length ≈ 0.5-0.58·U^0.44 m.
  - At U = 0.5 m/s: f ≈ 1.3 Hz, stride ≈ 0.38 m, DF ≈ 0.70.
- **Body:** roll toward the stance leg at k=1. Vertical bob at k=2, under 1-2 cm.
- **Head-bob** (chicken and pigeon; ducks and geese do not bob) **(med)**:
  - **One bob per step, two per stride, locked to the leg phase**, never an independent sine.
  - Hold: the head stays fixed in world space, from just after a foot lifts off. It takes about 48-63% of each bob at a slow walk and shrinks with speed.
  - Thrust: the head snaps forward just before touchdown (https://reinhold-necker.de/seite10.html).
  - **The rig has no head bone.** Either fake the bob with Body pitch and translation, or add a Head bone, which changes the rig and the skin, so ask first.
  - The world-fixed hold is only correct at v_design, so apply the same timeScale rule as the feet.
- **Peck** **(low)**: lower 0.25-0.35 s, fixation 0.10-0.20 s, strike 0.06-0.10 s, recover 0.2 s. Pitch Body 35-60° about a pivot near the hips, with the legs planted.

### 2.5 Recipe: quadruped walk and trot

**Walk (lateral sequence)** (https://pmc.ncbi.nlm.nih.gov/articles/PMC5599235/):

- Touchdown offsets: **LH 0, LF L, RH 0.5, RF 0.5+L**.
  - Small quadruped: L = 0.25.
  - Cow: L = 0.29, giving LH 0, LF 0.29, RH 0.5, RF 0.79.
- DF: cow 0.69, horse 0.67, range 0.60-0.75.
- If you change DF, re-derive L **(med)**: `L% = 130·DF − 66`.
- **Two body pivots, not one Hips bob** **(med)**: the hind pair drives the Body or hips bounce, the front pair drives the chest or neck base, and the head is a third bounce offset again.
- **Head and neck** **(med)**:
  - Vertical nod at k=2.
  - Range about 3× the withers' range.
  - Lowest at mid-swing of a forelimb: `φ = tdF + DF + (1−DF)/2`, which is about 0.135 and 0.635 for the cow.
  - Spread 2-4° per bone over Neck1-3 and Head.
- **Lateral** **(med)**: body roll and tail yaw at k=1, toward the side with two feet down (cow window about phase 0.29-0.5). Vertical body bob at k=2 (https://vanat.ahc.umn.edu/gaits/walk.html).

**Trot** (https://vanat.ahc.umn.edu/gaits/trot.html):

- Diagonal pairs: LH+RF at 0, RH+LF at 0.5, with the fore foot about +0.02 behind its hind.
- DF about 0.55 when walking, 0.35-0.45 when running.
- **Rigid trunk, no head nod, no tail or head sway.** Only a vertical body bob at k=2.

**Canter and gallop** **(low, asymmetric)**: keep a lead flag, and move the head once per stride. Do not derive these from the symmetric formula.

---

## 3. Blender 5.2 and glTF export, three.js runtime

### 3.1 Blender 5.2 action API

`action.fcurves`, `groups` and `id_root` are gone. This was probed locally on 5.2 (https://docs.blender.org/api/5.0/change_log.html).

```python
a = bpy.data.actions.new(name); slot = a.slots.new(id_type='OBJECT', name=rig.name)
ad.action = a; ad.action_slot = slot
cb = bpy_extras.anim_utils.action_ensure_channelbag_for_slot(a, slot)
fc = cb.fcurves.new('pose.bones["Hips"].rotation_quaternion', index=0)
```

- Assigning an action does not guarantee a slot, even when the action has slots: Blender auto-picks one only if its identifier matches `animation_data.last_slot_identifier` or the ID name. When `action_slot` is None the exporter silently drops that action. Always set `ad.action_slot` explicitly after `ad.action`.
- `pose_bone.keyframe_insert()` creates the slot, layer, strip and channelbag on its own.
- Fill keys in bulk with `keyframe_points.add(n)` plus `foreach_set('co', ...)` **(med; check signatures with `dir()`)**.
- **Quaternion continuity:** Blender interpolates quaternion components separately, so sign flips matter in Blender only when keys are sparse. Call `q.make_compatible(prev)` when writing sparse keys. With per-frame keys and three.js slerp (which takes the shortest path) a sign flip is harmless.
- **Armature-space to local:** `q_local = rest⁻¹ · R_arm · rest`, with `rest = bone.matrix_local`. A downward leg exports a 180° rest flip about X (local export test). The repo's Pose already does this conversion (`anim.py:7-47`).
- **Bake IK** with `bpy_extras.anim_utils.bake_action(obj, action=None, frames=range(s, e+1), bake_options=BakeOptions(only_selected=False, do_pose=True, do_object=False, do_visual_keying=True, do_constraint_clear=True, do_clean=True, do_location=True, do_rotation=True, do_scale=False, ...))`. It is slot-aware (https://projects.blender.org/blender/blender/raw/branch/main/scripts/modules/bpy_extras/anim_utils.py).
  - If you use `nla.bake` instead, pass every argument. From a script its defaults are 1-250, only_selected=True and visual_keying=False.
  - Better: compute 2-bone analytic IK in Python and key the deform bones directly.
  - An IK constraint added from bpy needs `chain_count=2` (0 means all the way to the root), `use_stretch=False`, and a `pole_angle` found by testing 0/90/−90/180 (https://docs.blender.org/api/5.0/bpy.types.KinematicConstraint.html).
- **Do not apply the armature object's transform on Quaternius rigs.** CampusCove animals keep it (rotation -90° X, scale 100 × height factor; `docs/animation/skeleton-animals.md`) and the imported clips rely on it. Convert metre offsets with `/ arm.matrix_world.to_scale().x`.

### 3.2 Export settings (5.2 exporter, `io_scene_gltf2/__init__.py:704-940`)

- Keep these defaults: `export_force_sampling=True`, `export_reset_pose_bones=True` (stops a previous clip's pose leaking into the next), `export_rest_position_armature=True`, `export_influence_nb=4`, `export_all_influences=False`, `export_leaf_bone=False`, `export_yup=True`.
- **ACTIONS mode** (`export_anim_single_armature=True` by default) adds every action in `bpy.data` that has an OBJECT slot with any `pose.bones` f-curve, when the exported set has one armature. Bone names are not checked against the rig.
  - Actions from other rigs in the same Blender session leak into the GLB (a chicken clip inside the dog). `build_animals.py` refuses to export when a foreign action exists.
  - Set `use_fake_user=True` if the .blend is saved and reloaded between build and export.
  - One finding instead claims only active or NLA-stashed actions export. The local source probe outranks it, but stashing in NLA is safe in both readings.
- **Start keys at frame 0**, or set `export_anim_slide_to_zero=True`. Keys from frame 1 start at t = 1/fps, which adds a held frame to every loop (local test).
- **Every exported clip writes T/R/S for every joint.** Partial overlays must filter their tracks at runtime or be made additive.

### 3.3 three.js runtime

- **Names are sanitized:** whitespace becomes `_`, and `[ ] . : /` are stripped. `UpperArm.L` loads as `UpperArmL`. A name collision adds `_1`, `_2`… to whichever node is parsed later, and mesh names share the pool with node names: do not hardcode `Body_1`, find bones with `skeleton.getBoneByName(sanitized)`, and give pieces names distinct from bones.
  - Look bones up as `${bone}${side}` (`front/src/game/remotePunch.ts:108`, `racePint.ts:51-53`).
  - A track or lookup that does not match does nothing and raises no error.
- **Instances:** clone with `SkeletonUtils.clone`, one mixer per instance. `Object3D.clone` shares bones, so every copy moves in lockstep.
- **Bounds:** set `frustumCulled=false` on animals, or recompute bounds, because bind-pose bounds clip animated limbs.
- **One-shot:**
  - Call `setLoop(LoopOnce,1); clampWhenFinished=true; reset().play()`.
  - Listen with `mixer.addEventListener('finished', e => e.action===a && …)`.
  - Without clamp, the action disables itself and its weight falls back to the binding's original state (usually the rest pose) until another action takes the weight. With clamp it holds the last frame. Either way, `reset()` is needed before it plays again (`AnimationAction.js`, `PropertyMixer.js` apply).
- **Crossfade:** the project uses `crossFadeTo(next, 0.22, false)` (`glbCharacter.ts:121-157`). Use `warp=true` or `syncWith` between cycles whose foot phases match.
- **Additive:** `AnimationUtils.makeClipAdditive(clip.clone(), 0, ref, 30)`. Always clone, because it mutates the clip in place.
- **Retargeting** with `SkeletonUtils.retargetClip`:
  - `names` maps target to source in sanitized form.
  - `hip` is the **source** bone name (the value side of `names`): `names: {Hips: 'mixamorigHips'}` needs `hip: 'mixamorigHips'`. If it does not match, no hip position track is written.
  - Pass `fps:30`.
  - It does no rest correction, so it only fits rigs of the same family. Run it offline, not at load time.
  - For rigs with different rolls, use the delta formula `trg = inv(restTrgParentW)·restSrcParentW·src·inv(restSrcW)·restTrgW` (https://github.com/upf-gti/retargeting-threejs/blob/main/docs/Algorithm.md).
  - Do not retarget across families (bird, quadruped, humanoid). Author each family with phase functions instead.
- **Clothes and pieces:** rebind by bone name with the piece's own boneInverses (`modularCharacter.ts:35-50`), and throw if a bone is missing.
- **Optimize step** **(med)**:
  - `gltf-transform optimize --compress draco` is unpinned (`optimize-assets.mjs:36-42`).
  - Draco does not compress animation. Resample removes every key that linear or slerp interpolation reproduces within 1e-4, keeping the first and last keys (the loop seam is safe).
  - `join` skips skinned meshes, so merge rigid pieces that share a material in Blender before export.
  - `optimize` runs `--palette` by default and merges untextured materials; pass `--palette false` for assets the runtime tints by material name. Textured materials (ours) are kept.

---

## 4. CampusCove contracts (repo-grounded)

- **Pose API** (`front/scripts/skins/anim.py:7-47`):
  - `P.rx/ry/rz(bone, deg)` **add** to a per-bone accumulator. On commit it is converted as Euler XYZ in armature rest space, then `rest⁻¹·R·rest`. The order of calls does not matter, and the parents still carry the children (FK).
  - `P.move()` adds an armature-space offset. Hips location is **always** keyed, at zero when unset.
  - Every bone gets a quaternion key on every frame.
- **`sample_actions(arm, clips, fps=30)`** (`anim.py:50-79`):
  - `clips` is a dict `{name: (nframes, fn(ph, P))}`.
  - Keys go at Blender frame fr+1 for fr in 0..nframes. Check that glTF time starts at 0 (§5).
  - Each clip is pushed to an NLA track of the same name.
  - It **deletes every NLA track first**, so always pass the full dict.
- **`make_clips(extras)`** (`clips.py:45-51`): Idle 60, Walk 30, Run 20, Sit 60. It feeds the wear base body (`run_wear.py:26`) and the 3 premium skins (`run.py:37`, `produce.py:20`). A clip added there ships in four GLBs.
  - New human clips must call `extras(ph, P, energy, speed)`. Existing values: idle (0,1), walk (0.55·amp,2), run (1,3), sit (0,1) (`anim.py:82-142`).
  - Do not use the older `make_animations` in `lib.py:357-387`. Nothing calls it.
- **Running the human scripts:**
  - The scripts are exec'd into shared globals and cannot be imported (`run_wear.py:14-18`).
  - Run headless with `blender --background --python front/scripts/skins/run_wear.py`.
  - Export uses `export_animation_mode='NLA_TRACKS'` with Draco level 6 (`wear.py:441-453`, `anim.py:163-176`).
- **Avatar playback** (`front/src/avatar/glbCharacter.ts:114-176`, `avatarAnimationLogic.ts:8-63`):
  - Every clip plays as LoopRepeat.
  - The selector type is `'Idle'|'Walk'|'Run'`. Walk enters at 0.5 and exits at 0.25 m/s; Run enters at 5 and exits at 3.5 m/s; minimum hold 0.18 s.
  - Walk `timeScale = clamp(speed/2.5, 0.6, 1.4)`; Run is 1. Players move at about 8 m/s.
  - The selector overrides the clip every frame. Pattern for a state clip like Pick: copy `setAvatarSeated` (additive flag, returns false when the clip is missing, `glbCharacter.ts:122,143-148,164-173`).
  - First-person one-shot reference: `firstPersonArms.ts:5-9,74-95,128-131`.
  - Remote players only see Pick if the socket broadcasts the state, as `useRemoteAvatars.applySeat` does for seats.
- **Gates:**
  - `npm run wear:check` (`check-wear.mjs:17-69`): base has ≥ Idle, Walk, Run; base under 8000 tris; feet at |minY| ≤ 0.05; pieces have **zero animations** and only joints from the base.
  - `npm run skins:check` (`check-skins.mjs:11-52`): ≤ 5 MB, ≤ 30000 tris, height 1.7-2.1 m.
- **Animals** (`map-src/CampusCove/build_animals.py`):
  - `import_rig` takes the CC0 glTF from `docs/quaternius/` and renames actions to lowercase (`idle`, `idle_peck`, `run`…).
  - `skinned_piece` makes rigid one-bone pieces.
  - `export_animal` needs an `idle` action, asserts the lowest bound is within 0-0.03 m, and exports in **ACTIONS** mode via `lib_common.export_glb`. The whole `build_animals.py` run needs a window (`new_build_scene`, `export_glb` and `snapshot` use `bpy.context.window`, `lib_common.py:39,262,399-403`), so run it through the Blender MCP or GUI, not `--background`.
  - Animals also face Blender -Y (`build_animals.py:133-134`).

---

## 5. Verification checklist before calling a clip done

1. **Clip names:** run `gltf-transform inspect` on the **optimized** GLB. Every expected clip is present with the exact case: PascalCase for humans, lowercase for animals. No stale actions.
2. **Loop seam:**
   - The first and last key are equal on every channel.
   - Input accessor min = 0 and max = N/fps (human clips key from frame 0 in `sample_actions`; animals export with `export_anim_slide_to_zero=True`).
   - Integer harmonics only.
3. **No jumps:** between consecutive frames no bone rotates more than 90° (angle = 2·acos(|dot|)). Do not gate on dot ≥ 0 in the exported GLB: the exporter decomposes matrices and can flip signs harmlessly.
4. **Ground contact:**
   - Lowest bound within 0-0.03 m for animals, and |minY| ≤ 0.05 for humans at rest.
   - Sample the planted foot during stance: its height stays constant within about 1 cm.
5. **Foot sliding:** measure the foot's root-space travel during stance against v_design × DF × T, at timeScale 1 and at the clamp limits (0.6, 1.4).
6. **Mirror test:** the L/R symmetric pose hand and foot positions mirror within 1e-4 m. The second half of the cycle equals the first with the legs swapped.
7. **Gait frequencies:** bob and head nod at k=2 (walk, trot), lateral sway at k=1, no head nod in trot. The duty factor matches the recipe.
8. **Rigid gaps and visuals:** render a frame strip of about 8 frames per clip (Blender MCP `look`), plus one in the game via the playtest-game skill. Check joint gaps and wear pieces on the avatar.
9. **Runtime:** the clip binds (no silently ignored tracks). One-shots fire `finished` and return to locomotion. Instances move independently.
10. **Gates and size:** `npm run wear:check`, `npm run skins:check` (skins ≤ 5 MB), and confirm no wear piece carries animations.
11. **Scope:** state in the report what was checked and what was skipped.

---

## 6. Pitfalls, most likely first

1. **Pre-5.0 API:** using `action.fcurves` raises an error; assigning an action without setting `action_slot` exports nothing for it, silently.
2. **Blender names in three.js:** `UpperArm.L` instead of `UpperArmL`, or a hardcoded `_1` suffix. Lookups and tracks silently match nothing.
3. **Foot sliding** from a stride that does not match the controller speed, or a fixed clip under varying speed. The current Walk and Run are designed for 5 and 8.5 m/s (`gait_cycle`).
4. **Wrong integer harmonic:** bob at 1× instead of 2×, head nod in the trot, or lateral sway at 2×.
5. **Loop seam hitch** from keys at frame 1, an off-by-one end frame, or a non-integer harmonic.
6. **Quaternion sign flips** on sparse Blender keys cause a spin in Blender; per-frame exports are safe in three.js.
7. **Local axes vs armature axes:** raw local rotation on bones that are flipped 180° or have roll 0. Mirrored sides then swing the wrong way.
8. **Bending the hock or bird ankle forward like a knee.**
9. **Stale or extra actions** leaking into ACTIONS-mode exports, and `sample_actions` deleting all NLA tracks when given a partial dict.
10. **Applying the armature transform** of an imported Quaternius rig, or forgetting it when converting metres to armature units.
11. **Full-body T/R/S tracks on an overlay clip** freeze the legs. Filter the tracks or make the clip additive (clone first).
12. **LoopOnce without clamp** snaps to bind pose. Replaying without `reset()` does nothing.
13. **Unbaked IK on the cow** looks right in Blender and freezes in glTF. A bake from `nla.bake` defaults keys the wrong things.
14. **Smooth cow skin with more than 4 influences**, which three.js drops, so the mesh shrinks or pops.
15. **Rigid pieces bent past about 45-60°** open gaps. Overhead reach and deep pecks are the cases at risk.
16. **`export_def_bones=True`** strips sockets and IK targets along with the controls.
17. **Head-bob from an independent sine,** or keyed on a bird rig that has no head bone.
18. **A single Hips bob for a quadruped** instead of offset hind and front pivots.
19. **Squash scale on a parent bone** squashes all its children.
20. **Instances made with `Object3D.clone`** share bones and move in lockstep.