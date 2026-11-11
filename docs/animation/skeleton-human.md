# Skeleton: human

The one humanoid rig of CampusCove. The player base body (`wear/base`), every wear piece and the three premium
skins share it. Source: `front/scripts/skins/lib.py` (`BONES`, `SIDE`, `build_armature`).

## Bones (21)

Blender Z-up, metres, feet at z = 0. The character faces Blender -Y (glTF +Z). +X is the character's left.
Every bone has `use_connect=False` and `roll=0`. Rest pose is an A-pose (arms about 60° below horizontal).

| Bone | Head | Tail | Parent |
|---|---|---|---|
| Hips | (0, 0, 0.93) | (0, 0, 1.06) | none |
| Spine | (0, 0, 1.06) | (0, 0, 1.28) | Hips |
| Chest | (0, 0, 1.28) | (0, 0, 1.52) | Spine |
| Neck | (0, 0, 1.52) | (0, 0, 1.64) | Chest |
| Head | (0, 0, 1.64) | (0, 0, 1.88) | Neck |
| Shoulder.L | (0.05, 0, 1.49) | (0.19, 0, 1.50) | Chest |
| UpperArm.L | (0.19, 0, 1.50) | (0.34, 0, 1.22) | Shoulder.L |
| LowerArm.L | (0.34, 0, 1.22) | (0.43, 0, 0.97) | UpperArm.L |
| Hand.L | (0.43, 0, 0.97) | (0.47, 0, 0.84) | LowerArm.L |
| UpperLeg.L | (0.10, 0, 0.93) | (0.10, -0.005, 0.50) | Hips |
| LowerLeg.L | (0.10, -0.005, 0.50) | (0.10, 0.01, 0.09) | UpperLeg.L |
| Foot.L | (0.10, 0.01, 0.09) | (0.10, -0.11, 0.035) | LowerLeg.L |
| Toe.L | (0.10, -0.11, 0.035) | (0.10, -0.18, 0.02) | Foot.L |

`.R` bones mirror x. Premium skins add secondary bones through `build_armature(extra=...)` (cape, sash, halo, orbs),
animated by their `*_extras` in `clips.py`.

In three.js the dots are stripped: `UpperArm.L` loads as `UpperArmL`. A lookup by the Blender name silently finds
nothing.

## Posing in code

Clips are phase functions `f(ph, P)` sampled by `sample_actions(arm, clips, fps=30)` (`anim.py`):

- `P.rx/ry/rz(bone, deg)` add a rotation about the **armature** X, Y or Z axis (not the bone's local axis);
  `P.move(bone, x, y, z)` adds an armature-space offset in metres. Parents carry children (FK).
- Signs measured on this rig (headless renders, 2026-11-10). A negative `rx` swings any downward-pointing limb
  forward (toward -Y):
  - `UpperLeg` −26° forward; `LowerLeg` +34° bends the knee (shin back) (`gait_walk`, `anim.py`).
  - `UpperArm` negative forward, positive backward; −145° raises the arm overhead in front (`pose_pick`).
  - `LowerArm` negative bends the elbow (forearm forward).
  - `Head` negative looks up; `Chest` negative leans the torso back.
  - `ry` positive on `UpperArm.L` (and `LowerArm.L`) tucks the arm toward the body; mirrored on `.R`, where `ry`
    positive raises the right arm sideways.
  - `Hips` `ry` positive lowers the left hip.
  - `Hand` `rx` negative bends the hand toward the face, like a negative `LowerArm` `rx`.
  Any other sign is checked on a render before it is trusted.
- `sample_actions` deletes every NLA track first: always pass the full clip dict.

## Clips and who receives them

| Clip | Frames at 30 fps | Seconds | Loop | Built by |
|---|---|---|---|---|
| Idle | 120 | 4.0 | yes | `gait_idle` (feet pinned by `leg_ik`) |
| Walk | 21 | 0.7 | yes | `gait_cycle(JOG)`, designed for 5.0 m/s, stride 3.5 m |
| Run | 18 | 0.6 | yes | `gait_cycle(SPRINT)`, designed for 8.5 m/s, stride 5.1 m |
| Sit | 120 | 4.0 | yes | `pose_sit` (Hips at −0.45 m, `SIT_HIP_HEIGHT`) |
| Eat | 30 | 1.0 | one-shot | `pose_eat`, hand at the mouth from 0.33 s, two bites, chew (upper body only) |
| Drink | 30 | 1.0 | one-shot | `pose_drink`, hand at the mouth from 0.33 s, head back 22° (upper body only) |
| Pick | 90 | 3.0 | one-shot | `pose_pick`, base body only (`run_wear.py`) |

Every clip is keyed from frame 0 (glTF time starts at 0). Gaits plant the feet with `leg_ik` (analytic two-bone IK,
knee forward): the stance foot moves back at exactly the design speed, so there is no slide at timeScale 1.

`make_clips` (`clips.py`) ships its clips in four GLBs: `wear/base` and the three skins. A clip meant for the base
body only is added in `run_wear.py`, not in `make_clips`.

Runtime (`front/src/avatar/glbCharacter.ts`, `avatarAnimationLogic.ts`): the selector picks Idle, Walk or Run from
speed every frame (player speeds: walk 5 m/s, sprint 8.5 m/s, `gameRoomConstants.ts`). Walk enters at 0.5 m/s, Run
enters at 6.7 and exits under 5.8 m/s. `timeScale` is speed over design speed: Walk `clamp(v / 5, 0.6, 1.3)`, Run
`clamp(v / 8.5, 0.8, 1.3)` (`WALK_DESIGN_SPEED`, `RUN_DESIGN_SPEED`). Sit goes through `setAvatarSeated`, Pick
through `setAvatarPicking`, Eat and Drink through `setAvatarEating` (one one-shot at a time, LoopOnce + clamp, back
to the selector on `finished` or cancel; Sit wins; Eat and Drink only play while the selector is on Idle, because
the clips carry rest-pose leg tracks). Remote players see Pick through `user_picking { sessionId, picking }`
(`docs/ORCHARD.md`) and Eat/Drink through the existing `user_action { sessionId, action: 'eat' | 'drink', code }`,
sent by the socket once it accepted the consume or the fountain sip.

First-person arms (`map-src/CampusCove/build_fp_arms.py`, `front/src/game/firstPersonArms.ts`) are separate
object-level clips per wear top: Idle 3.2 s, Walk 0.8 s (designed for 5 m/s, `timeScale = clamp(v / 5, 0.8, 1.3)`),
one-shots Equip, UseDoor, UseKey, PunchL (left jab, 0.4 s) and Punch (right cross, 0.53 s), both with contact at frame
5 = `PUNCH_IMPACT_S`, Pick (3.0 s), Eat and Drink (1.0 s, hand at the mouth at frame 10; they replace the old
procedural eat pose). Punch poses are solved by `fist_at` (fist centre on screen, forearm direction, back of the hand
up for the corkscrew); the arm that does not punch rises to a guard with a loose fist.

Each first-person hand is built in code (`build_hand`), not cut from the body: an armature `HandRig_{R,L}` under
`Hand_{R,L}` with 16 bones, `Wrist_{side}` plus `Index1-3`, `Middle1-3`, `Ring1-3`, `Pinky1-3`, `Thumb1-3` (suffix
`_{side}`), skinning the `HandMesh_{side}` mesh. The wrist ring is sampled from the forearm's own section, so there is
no step. The rest pose is the relaxed hand, and a clip that leaves a bone unkeyed shows it relaxed (the exporter drops
constant bone channels). Finger poses are local rotations (`digit_rotation`), measured on renders: positive flex about
the bone's local X curls a finger towards the palm on both sides, and positive spread opens the finger towards the
thumb (local Z, sign -1 on R and +1 on L). For the thumb, `Thumb1` flex crosses the palm towards the pinky and
`ThumbS` lifts it away from the palm. Clips: Idle, Walk and Equip relaxed; the punching hand is a fist by frame 4 and opens
on recovery; Eat and Drink grip a 3 cm handle (frames 4-26); Pick opens (16-20), grabs (26-74); UseKey pinches the key
(8-20); UseDoor hooks the handle (7-10).

## Gates

- `cd front && npm run wear:check`: base has Idle, Walk, Run, under 8000 tris, feet within 5 cm of y = 0; wear
  pieces carry no animation and only base joints.
- `cd front && npm run skins:check`: skins ≤ 5 MB, ≤ 30000 tris, 1.7-2.1 m tall.

## Rebuild

```bash
blender --background --factory-startup --python front/scripts/skins/run_wear.py
```

It rewrites `front/public/assets/wear/**`. Pieces carry no clip, so only `wear/base/model.glb` should change when a
clip is added. List what changed (`git status --short front/public/assets/wear`); a piece whose glTF structure is
unchanged and has no animation differs only by float noise. Tell the user before restoring it with `git checkout`.

Rendering a human pose: `studio()` switches the window to its own scene and `run_wear.py` exports every wear GLB
unless `WEAR_ARGS = ["build"]`. Prefer a headless Blender run with `{"__file__": p, "WEAR_ARGS": ["build"]}`, then
`show_pose(arm, fn, ph)` and a Workbench render, over the user's live Blender.
