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
  - Measured 2026-11-14 for the sports clips: `Hips` `rx` negative tilts the whole body back (legs forward);
    `Spine` `rx` positive leans the torso forward; `Chest` `rz` positive turns the shoulders to the left; `Foot` `rx`
    positive points the toes down; `UpperLeg` `rz` after a forward swing swings the leg across the body (+ toward +X
    on `.R`), so a twist of the leg about its own axis is composed in rest space (`("UpperLeg.R", "t")` in
    `sport_clip`, negative turns the right toes out); with the arm overhead, `UpperArm.R` `ry` negative and
    `UpperArm.L` `ry` positive spread the arms into a V; `Shoulder.R` `ry` positive and `Shoulder.L` `ry` negative
    raise the shoulders, which hides the shoulder pinch of an overhead arm.
  - `Hips`, `Spine` and `Chest` `rz` positive turn the torso to the character's left (tennis renders, 2026-11-14).
  - `UpperArm.R` `rz` positive and `UpperArm.L` `rz` negative swing the arm forward across the body.
  - `ry` negative on `UpperArm.L` raises the left arm sideways (render of `Stumble`, 2026-11-14). Raising an arm
    that is already swung forward (`rx` −50) by `ry` brings the hand to the face: bring `rx` back toward 0 first.
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
| Dance | 60 | 2.0 | yes | `pose_dance`: 4 beats at 120 bpm (one beat = 15 frames), knee bounce on each beat, step-touch to the character's right and back (18 cm, feet planted by `leg_ik`), alternating arm pumps |
| Stumble | 18 | 0.6 | one-shot | `pose_stumble`: knees buckle, arms flail, feet planted; starts and ends on the `Dance` frame-0 pose |
| Pick | 90 | 3.0 | one-shot | `pose_pick`, base body only (`run_wear.py`) |
| Kick | 14 | 0.467 | one-shot | `pose_kick`, right side-foot pass, contact at frame 6 (0.20 s), left foot planted |
| Shot | 21 | 0.7 | one-shot | `pose_shot`, wind-up at frame 8, right instep strike at frame 11 (0.367 s) |
| Tackle | 36 | 1.2 | one-shot | `pose_tackle`, on the left hip from frame 10 (0.333 s) to 20 (0.667 s), Hips at −0.67 m, then gets up |
| Celebrate | 36 | 1.2 | one-shot | `pose_celebrate`, hop with arms up in a V (top at frame 9, Hips +0.16 m), two fist pumps |
| JumpShot | 24 | 0.8 | one-shot | `pose_jump_shot`, release at the top, frame 11 (0.367 s), Hips +0.18 m |
| Dunk | 27 | 0.9 | one-shot | `pose_dunk`, right arm high, peak at frame 12 (Hips +0.45 m), slam at frame 15 (0.5 s) |
| Block | 18 | 0.6 | one-shot | `pose_block`, both arms straight up, top at frame 9 (0.3 s), Hips +0.22 m |
| Steal | 14 | 0.467 | one-shot | `pose_steal`, low right-hand swipe, contact at frame 6 (0.20 s), feet planted |
| Dribble | 30 | 1.0 | yes | `gait_dribble`: two Walk-style strides (`DRIBBLE`, 0.5 s each, designed for 5 m/s), right hand lowest at 0.08 and 0.58 s, ball on the floor at 0.25 and 0.75 s, back in the hand at 0.42 and 0.92 s |
| RunSet | 45 | 1.5 | loop | `pose_run_set`, standing start crouch, left foot forward, base body only |
| RunLean | 24 | 0.8 | one-shot | `pose_run_lean`, finish dip over the Run legs, base body only |
| Breathless | 60 | 2.0 | loop | `pose_breathless`, hands on knees, base body only |
| TennisReady | 36 | 1.2 | yes | `pose_tennis_ready`, split-step stance, base body only (`tennis_clips`) |
| TennisForehand | 18 | 0.6 | one-shot | `pose_tennis_forehand`, contact at 0.3 s, starts and ends on TennisReady frame 0 |
| TennisBackhand | 18 | 0.6 | one-shot | `pose_tennis_backhand`, one-handed, contact at 0.3 s, starts and ends on TennisReady |
| TennisLob | 21 | 0.7 | one-shot | `pose_tennis_lob`, contact at 0.35 s, finishes high, starts and ends on TennisReady |
| TennisServe | 30 | 1.0 | one-shot | `pose_tennis_serve`, from the rest pose, toss 0.32 s, contact 0.55 s, ends on TennisReady |
| TennisCelebrate | 45 | 1.5 | one-shot | `pose_tennis_celebrate`, from TennisReady, fist pumps then both arms up, ends on the rest pose |

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
5 = `PUNCH_IMPACT_S`, Pick (3.0 s), and the Eat and Drink loops (1.0 s, `LoopRepeat` while the click is held,
hand already at the mouth on frame 0, one bite or sip peaking at frame 10; the left arm stays slightly lowered), and the Hold loop (3.2 s, base clip instead of Idle / Walk while a job tool is in hand, `setHolding`: right hand low on the right in the grip, tool tilted forward and out so the crosshair stays clear, left arm as in Idle), and the tennis one-shots, all starting and ending on Hold frame 0: TennisForehand and TennisBackhand (14 frames, 0.467 s, contact at frame 6 = 0.2 s), TennisLob (15 frames, 0.5 s, contact at 7.5 = 0.25 s, finish high) and TennisServe (27 frames, 0.9 s, left toss open at frame 10, trophy 8, racket drop 11, contact at frame 15 = 0.5 s). Racket poses are solved by `hold_at` (grip point, racket axis, forearm): measured on renders, the forearm runs along the forearm hint projected off the racket axis, the racket face normal stays within about 20° of the forearm, and the elbow stays out of the 62° viewmodel frustum only when it sits below or beside the hand (the cut elbow end shows otherwise). Punch poses are solved by `fist_at` (fist centre on screen, forearm direction, back of the hand
up for the corkscrew); the arm that does not punch rises to a guard with a loose fist.

Each first-person hand is built in code (`build_hand`), not cut from the body: an armature `HandRig_{R,L}` under
`Hand_{R,L}` with 16 bones, `Wrist_{side}` plus `Index1-3`, `Middle1-3`, `Ring1-3`, `Pinky1-3`, `Thumb1-3` (suffix
`_{side}`), skinning the `HandMesh_{side}` mesh. The wrist ring is sampled from the forearm's own section, so there is
no step. The rest pose is the relaxed hand, and a clip that leaves a bone unkeyed shows it relaxed (the exporter drops
constant bone channels). Finger poses are local rotations (`digit_rotation`), measured on renders: positive flex about
the bone's local X curls a finger towards the palm on both sides, and positive spread opens the finger towards the
thumb (local Z, sign -1 on R and +1 on L). For the thumb, `Thumb1` flex crosses the palm towards the pinky and
`ThumbS` lifts it away from the palm. Clips: Idle, Walk and Equip relaxed; the punching hand is a fist by frame 4 and opens
on recovery; Eat and Drink hold the grip on a 3 cm handle for the whole loop; Pick opens (16-20), grabs (26-74); UseKey pinches the key
(8-20); UseDoor hooks the handle (7-10); Hold keeps the grip and closes it 5 % towards the fist on each breath, so its finger channels are not constant and survive the export. The tennis clips keep the grip and squeeze it 30 % towards the fist at contact; the serve's left hand holds the ball (GRAB) and opens at the toss.

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
