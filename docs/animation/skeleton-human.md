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
  - `Hips` as a whole-body root (skating clips, `_skate_apply`, 2026-11-14): `Rx` positive leans the body forward,
    negative back; `rz` positive turns the body to its left (front toward +X); `move` y positive pushes the pelvis back.
  - `LowerArm.R` `rz` −90° turns the right palm up when the arm swings forward, +90° turns it down (`PALM_DOWN`, `clips.py`, the pétanque release); first-person wrist twist −110° is palm down (`BOULE_PALM_DOWN`, `build_fp_arms.py`).
  - `Hips` `rx` positive tilts the pelvis and the torso forward; `leg_ik` keeps the feet planted (pétanque clips).
  - `Hips` `rx` positive pitches the whole body forward (head toward -Y); `rz` positive turns it counter-clockwise
    seen from above. Whole-body turns go through `_turn_hips(P, matrix, pivot)` (`clips.py`), which sets the Hips
    rotation from a matrix and offsets its location so the body turns about `pivot` (relative to the Hips head).
  - Once `rx` has swung a limb forward, `ry` no longer abducts it: on an overhead `UpperArm.L` (`rx` −172) `ry`
    negative brings the arm in, and on a forearm bent forward (`LowerArm` `rx` −100) `rz` −sgn crosses it over the
    chest. On a thigh raised forward, `UpperLeg.L` `rz` positive spreads it out (renders, 2026-11-14).
  - On `UpperArm.L` with `ry` −45, `LowerArm.L` `ry` −100 points the forearm up (goalpost, `DanceRobot`); `ry` −125
    on `UpperArm.L` points the arm up and out; `rx` −165 with `ry` −20 throws both arms overhead in a V
    (`DanceMoveUp`). Mirrored on `.R` (renders of 2026-11-15).
  - Side raises past about 60° (`UpperArm` `ry` ±60 and more) pull the chest skin into a visible flap on the base
    body: keep held poses at or under that.
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
| DanceSway | 60 | 2.0 | yes | `pose_dance_sway`: hips sway 7 cm side to side once every 2 beats with a hip roll, soft knee bounce on each beat, arms low and loose waving sideways with elbow and wrist lag; feet planted |
| DanceRobot | 60 | 2.0 | yes | `pose_dance_robot`: four held hits, each reached in 4 frames before the beat (`_beat_hits`): both forearms forward, both goalposts, left goalpost and right forearm forward, then the mirror; head ticks 20°, knee dip on each hit; feet planted |
| DanceShuffle | 60 | 2.0 | yes | `pose_dance_shuffle`: one foot per beat (right on beats 1 and 3) taps the heel 15 cm forward (toes up 30°) then the ball 15 cm back (heel up 30°, ankle raised by `_on_ball`), weight shifts to the other foot, bounce on every half beat, forearms pumping low |
| DanceSpin | 60 | 2.0 | yes | `pose_dance_spin`: Hips `rz` 0 to 360° (turns to the character's left), eight steps of 90° (left foot on the first half of each beat, right on the second) placed by `leg_ik(..., yaw=)` so a planted foot never turns; arms open from the `Dance` pose to straight out and close again at the seam |
| DanceDisco | 60 | 2.0 | yes | `pose_dance_disco`: left hand across to the right hip, right arm points up and out, right hand across to the left hip, left arm points up; the free forearm stays forward at the waist; hips pushed toward the pointing side's opposite; feet planted |
| DanceTwist | 60 | 2.0 | yes | `pose_dance_twist`: hips −0.14 m (knees bent), Hips `rz` ±28° once per beat, Spine and Chest −50° the other way, so the shoulders turn against the hips; elbows bent 95° at the sides; feet planted |
| DanceMoveLeft | 15 | 0.5 | one-shot | `pose_dance_move_side('.L')`: anticipation dip, left foot steps 14 cm out to the character's left while the right foot taps up on the ball, left arm points out, torso leans left; starts and ends on the `Dance` frame-0 pose |
| DanceMoveRight | 15 | 0.5 | one-shot | mirror of `DanceMoveLeft` |
| DanceMoveUp | 15 | 0.5 | one-shot | `pose_dance_move_up`: dip, then both arms thrown up in a V and a rise on the balls (22°), head up; starts and ends on the `Dance` frame-0 pose |
| DanceMoveDown | 15 | 0.5 | one-shot | `pose_dance_move_down`: small rise, then a squat (hips −0.2 m, torso forward), hands down to the knees; starts and ends on the `Dance` frame-0 pose |
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
| ClimbReachL, ClimbReachR | 18 | 0.6 | one-shot | `pose_climb_reach`: from the hang pose, dip, feet push the hips up 15 cm while one hand reaches 0.4 m above and 0.3 m to its side, back to the hang pose |
| ClimbHang | 60 | 2.0 | yes | `pose_climb_hang`: hands on the wall 1.95 m up, toes on the wall, breathing sway (hands and feet pinned by IK) |
| ClimbFall | 24 | 0.8 | one-shot | `pose_climb_fall`: hang pose 0.45 m above the root, hands open, gravity drop to the mat at 0.32 s, crouch, ends on the rest pose |
| ClimbLower | 30 | 1.0 | yes | `pose_climb_lower`: seated in the harness, soles on the wall, hands on the rope at chest height, 2 cm bounce |
| ClimbTop | 36 | 1.2 | one-shot | `pose_climb_top`: right hand reaches up, left fist pump, back to the hang pose |

Climbing clips assume the wall plane at y = -0.58 m in front of the root and the root 1.6 m under the eye
(`eyeHeightM`, `standoffM` and `reachBelowM` in `front/public/assets/sports/rules/climbing.json`): the hang hands sit
0.08 m under the last hold. Hands are placed with `arm_ik` (`anim.py`, two-bone IK from the shoulder through the
Hips > Spine > Chest > Shoulder chain, elbow towards the hint), feet with `leg_ik`. Measured on renders: a negative
`leg_ik` pitch turns the toes up (-75° puts the sole flat on the wall), a positive pitch points them down.
| SkatePush | 39 | 1.3 | yes | `skate_push`, left stroke 0-0.5 then right stroke (650 ms each, `docs/sports/skating.md`), glide foot under the body, push foot out 0.41 m and back 0.2 m |
| SkateGlide | 60 | 2.0 | yes | `skate_glide`, both feet on the ice, knees bent, 18° lean, slow sway |
| SkateBrake | 15 | 0.5 | one-shot | `skate_brake`, hockey stop to the left (hips turned 80°), ends on the held stop pose |
| SkateFall | 45 | 1.5 | one-shot | `skate_fall`, slip, seated on the ice at 0.27-0.45, back up, ends on the SkateGlide start pose |
| SkateStumble | 12 | 0.4 | one-shot | `skate_stumble`, left foot slips, arms out, ends on the SkateGlide start pose |
| PetanquePoint | 48 | 1.6 | one-shot | `pose_petanque_point`: crouch (Hips −0.14 m), right arm back then low forward, release at hip height at 0.77 s |
| PetanqueShoot | 48 | 1.6 | one-shot | `pose_petanque_shoot`: left foot 0.30 m forward, arm high behind, release at shoulder height at 0.8 s |
| PetanqueCrouch | 120 | 4.0 | yes | `pose_petanque_crouch`: deep squat (Hips −0.46 m), hands on the knees, head scanning |
| PetanqueCelebrate | 45 | 1.5 | one-shot | `pose_petanque_celebrate`: right fist pump, twice |
| Swim | 30 | 1.0 | yes | `pose_swim`, front crawl, base body only: Hips pitched 78° (`SWIM_PITCH`), +0.05 m, head at 1.15 m, one stroke per arm on a wrist path solved by two-bone IK (`SWIM_PATH`: entry in front of the shoulder, high-elbow catch, pull under the centre line, push past the hip, high-elbow recovery), body roll 40° toward the pulling arm (`SWIM_ROLL`), six-beat kick |
| Tread | 48 | 1.6 | yes | `pose_tread`, base body only: Hips at −0.33 m (`TREAD_DROP`), head at 1.29-1.33 m, sculling arms, egg-beater legs |
| Dive | 24 | 0.8 | one-shot, ends held | `pose_dive`, base body only: crouch, toes planted by `leg_ik` until 0.56, ends straight, arms ahead, pitched 25° nose down |
| Somersault | 30 | 1.0 | one-shot | `pose_somersault`, base body only: tucked 360° forward turn of Hips about the tuck centre, ends at rest |
| Twist | 30 | 1.0 | one-shot | `pose_twist`, base body only: 360° turn of Hips about the vertical, arms crossed on the chest, ends at rest |
| Cannonball | 30 | 1.0 | one-shot, ends held | `pose_cannonball`, base body only: tuck by 0.26, held |

Every clip is keyed from frame 0 (glTF time starts at 0). Every clip keys translation, rotation and scale on all 21
bones (plus the skin's extra bones), so a crossfade never lets a bone fall back to the rest pose. The one-shots
`Stumble` and `DanceMove*` start and end exactly on the `Dance` frame-0 pose; the dance loops start within 15-66°
of it per bone (`DanceSpin` 15°, `DanceTwist` 43°, `DanceShuffle` 46°, `DanceRobot` 47°, `DanceSway` 51°,
`DanceDisco` 66°, measured 2026-11-15), never on the rest pose. `leg_ik(..., yaw=deg)` turns a foot and its knee
to a world heading (default: the foot faces -Y and the knee follows the hips). Gaits plant the feet with `leg_ik` (analytic two-bone IK,
knee forward): the stance foot moves back at exactly the design speed, so there is no slide at timeScale 1.

`make_clips` (`clips.py`) ships its clips in four GLBs: `wear/base` and the three skins. A clip meant for the base
body only is added in `run_wear.py`, not in `make_clips`.

Runtime (`front/src/avatar/glbCharacter.ts`, `avatarAnimationLogic.ts`): the selector picks Idle, Walk or Run from
speed every frame (player speeds: walk 5 m/s, sprint 8.5 m/s, `gameRoomConstants.ts`). Walk enters at 0.5 m/s, Run
enters at 6.7 and exits under 5.8 m/s. `timeScale` is speed over design speed: Walk `clamp(v / 5, 0.6, 1.3)`, Run
`clamp(v / 8.5, 0.8, 1.3)` (`WALK_DESIGN_SPEED`, `RUN_DESIGN_SPEED`). Sit goes through `setAvatarSeated`, Pick
through `setAvatarPicking`, Eat and Drink through `setAvatarEating` (one one-shot at a time, LoopOnce + clamp, back
to the selector on `finished` or cancel; Sit wins; Eat and Drink only play while the selector is on Idle, because
the clips carry rest-pose leg tracks). The pétanque one-shots go through `setAvatarPetanque` with the same gates, and
`PetanqueCrouch` through `setAvatarCrouching`, a state flag that replaces Idle while it is set (Sit still wins); the
front sets it on match players standing within 2 m of the jack and plays the throws and the celebration from
`petanque_throw` and `petanque_state` (`docs/sports/petanque.md`). Remote players see Pick through `user_picking { sessionId, picking }`
(`docs/ORCHARD.md`) and Eat/Drink through the existing `user_action { sessionId, action: 'eat' | 'drink', code }`,
sent by the socket once it accepted the consume or the fountain sip.

First-person arms (`map-src/CampusCove/build_fp_arms.py`, `front/src/game/firstPersonArms.ts`) are separate
object-level clips per wear top: Idle 3.2 s, Walk 0.8 s (designed for 5 m/s, `timeScale = clamp(v / 5, 0.8, 1.3)`),
one-shots Equip, UseDoor, UseKey, PunchL (left jab, 0.4 s) and Punch (right cross, 0.53 s), both with contact at frame
5 = `PUNCH_IMPACT_S`, Pick (3.0 s), and the Eat and Drink loops (1.0 s, `LoopRepeat` while the click is held,
hand already at the mouth on frame 0, one bite or sip peaking at frame 10; the left arm stays slightly lowered), and the Hold loop (3.2 s, base clip instead of Idle / Walk while a job tool is in hand, `setHolding`: right hand low on the right in the grip, tool tilted forward and out so the crosshair stays clear, left arm as in Idle), and the tennis one-shots, all starting and ending on Hold frame 0: TennisForehand and TennisBackhand (14 frames, 0.467 s, contact at frame 6 = 0.2 s), TennisLob (15 frames, 0.5 s, contact at 7.5 = 0.25 s, finish high) and TennisServe (27 frames, 0.9 s, left toss open at frame 10, trophy 8, racket drop 11, contact at frame 15 = 0.5 s). Racket poses are solved by `hold_at` (grip point, racket axis, forearm): measured on renders, the forearm runs along the forearm hint projected off the racket axis, the racket face normal stays within about 20° of the forearm, and the elbow stays out of the 62° viewmodel frustum only when it sits below or beside the hand (the cut elbow end shows otherwise). Punch poses are solved by `fist_at` (fist centre on screen, forearm direction, back of the hand
hand already at the mouth on frame 0, one bite or sip peaking at frame 10; the left arm stays slightly lowered), the pétanque one-shots PetanquePoint and PetanqueShoot (1.6 s: the arm leaves the view, comes back holding the boule and opens the hand at about 0.77 s and 0.7 s, `throwBoule`), and the Hold loop (3.2 s, base clip instead of Idle / Walk while a job tool is in hand, `setHolding`: right hand low on the right in the grip, tool tilted forward and out so the crosshair stays clear, left arm as in Idle). Climbing (`FpClimb*`, played by the climbing composable, camera-space poses solved by `fist_at` against the contract wall of `docs/sports/climbing.md`, holds 0.44 m in front of the eye): FpClimbReachL / FpClimbReachR (0.47 s one-shot: dip, the hand opens and arcs off the wall to a hold 0.4 m above the eye at frame 8, grips, then slides down to the hang pose as the body rises; the other hand braces), FpClimbHang (2.0 s loop: both hands gripping holds 0.13 m above the eye, small sway), FpClimbFall (0.6 s one-shot: hands open and drop out of view), FpClimbLower (1.0 s loop: both hands on the rope in front, 0.05 and 0.15 m under the eye so they stay in the 62 deg viewmodel, small bounce), FpClimbTop (0.9 s one-shot: reach the top hold, pull, fist pump, back to the hang pose). Reach and Top start and end on the hang pose and grip. Every arm and finger channel moves in each of them (a brace dip, a squeeze towards the fist), since a constant channel is dropped at export. Punch poses are solved by `fist_at` (fist centre on screen, forearm direction, back of the hand
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

## Boxing clips

Shipped apart from `wear/base` in two clips-only GLBs (no mesh, no Draco), loaded onto the existing rigs by bone name:

- `front/public/assets/animations/boxing/clips.glb`: the 21-bone rig (`Armature_boxing`), built by
  `front/scripts/skins/boxing.py` through `blender -b --factory-startup --python front/scripts/skins/run_boxing.py`.
- `front/public/assets/animations/boxing/fp_clips.glb`: the first-person arms nodes `Arm_{R,L}`, `Hand_{R,L}`,
  `HandRig_{R,L}` and the 16 hand bones per side, built by `map-src/CampusCove/build_fp_boxing_clips.py` (it runs the
  helpers of `build_fp_arms.py` on the bare arms, keeps nothing but the animated nodes, fists closed on every frame).

Two layers at runtime: the lower layer keeps the Hips, UpperLeg, LowerLeg, Foot and Toe tracks of BoxIdle / BoxStep
(weight blend by speed), the upper layer keeps Spine, Chest, Neck, Head, Shoulder, UpperArm, LowerArm and Hand of the
upper clips. Every clip is authored full body on the same orthodox stance (left foot forward, Hips −10 cm, yawed −15°,
pitched 3°), so a layer read alone still looks right. Hands are placed by a two-bone arm IK (`arm_ik`), targets in
the chest frame for guard poses and in armature space for punch contacts.

| Clip | Frames | Seconds | Loop | Notes |
|---|---|---|---|---|
| BoxIdle | 30 | 1.0 | yes | bounce at 2 Hz, lowest at frame 0, heels lift 7° at the top |
| BoxStep | 30 | 1.0 | yes | forward skip-shuffle, 2 steps per cycle, design speed 2.5 m/s, stance feet move back at exactly 2.5 m/s (`_foot_track`), lowest at frame 0 like BoxIdle; feet leave the canvas up to 8 cm |
| Guard | 30 | 1.0 | yes | fists at the chin, elbows in, same bounce phase as BoxIdle |
| Block | 30 | 1.0 | yes | forearms in front of the face |
| Jab | 13 | 0.433 | one-shot | left, impact frame 5 (0.167 s), torso turned and leaning into the punch, fist travels in a straight line in armature space |
| Cross | 24 | 0.8 | one-shot | right with torso turn, impact frame 8 (0.267 s) |
| Hook | 33 | 1.1 | one-shot | left, horizontal forearm, impact frame 11 (0.367 s), charge exit frame 5 (0.167 s) |
| Uppercut | 28 | 0.933 | one-shot | right, knees dip 4.5 cm at frame 4 then drive up, rear heel lifts 12-14°, torso turns left, impact frame 9 (0.3 s), charge exit frame 4 (0.133 s) |
| HookCharge | 30 | 1.0 | yes | Hook frame 5 held, Guard bounce, left fist tremble at 6 and 7 Hz |
| UppercutCharge | 30 | 1.0 | yes | Uppercut frame 4 held (knees dipped), Guard bounce, right fist tremble at 6 and 7 Hz |
| DodgeL / DodgeR | 12 | 0.4 | one-shot | torso slip to the character's left / right, held frames 4-7 |
| HitReact | 12 | 0.4 | one-shot | head snaps back at frame 3 |
| Knockdown | 30 | 1.0 | one-shot | buckle, sit, lie on the back; last frame = Down frame 0 |
| Down | 60 | 2.0 | yes | lying, breathing |
| GetUp | 36 | 1.2 | one-shot | sit, crouch, rise; last frame = BoxIdle frame 0 |
| KO | 42 | 1.4 | one-shot | falls straight back, small bounce at frame 37, ends lying (clamp) |
| Win | 60 | 2.0 | yes | arms overhead, pumps and heel bounce at 2 Hz |
| FpGuard | 30 | 1.0 | yes | fists up either side of the view |
| FpBlock | 30 | 1.0 | yes | fists in front of the face |
| FpJab | 13 | 0.433 | one-shot | left, contact frame 5 |
| FpCross | 24 | 0.8 | one-shot | right, contact frame 8 |
| FpHook | 33 | 1.1 | one-shot | left, contact frame 11, charge exit frame 5 (0.167 s) |
| FpUppercut | 28 | 0.933 | one-shot | right, fist drops to the bottom edge then rises into view, contact frame 9 (0.3 s), charge exit frame 4 (0.133 s) |
| FpHookCharge | 30 | 1.0 | yes | FpHook frame 5 held, FpGuard breathing, left fist tremble |
| FpUppercutCharge | 30 | 1.0 | yes | FpUppercut frame 4 held, FpGuard breathing, right fist tremble |
| FpHit | 9 | 0.3 | one-shot | both arms shaken |

Every upper one-shot starts and ends on Guard frame 0 and every Fp one-shot on FpGuard frame 0 (within 0.05°).
Charge exit: frame 0 of a charge loop equals its punch at the charge exit time (0.000°), and that frame is a key pose
(zero velocity), so on release the front starts the punch at that time with no crossfade needed. Every punch ends
with one eased segment from its last extended key straight to the guard (no intermediate stop), so a 0.1 s crossfade
from anywhere in that retraction into frame 0 of another punch reads as one move; crossfades of every punch pair were
checked for a hand passing through the head or the other arm (third person: no blend closer than the clips
themselves; first person: fist centres stay 10.7 cm apart or more, the closest being FpHook into the next punch).
First person keeps the sleeve end (elbow) out of a 62° vertical view at 4:3 and wider on every frame of every clip:
the forearm rises steeply from below at contact, the fist contact points are unchanged.
First-person keys interpolate the fist target, forearm and back-of-hand directions and solve `fist_at` on each
frame, instead of interpolating Euler offsets, which spun the arm between distant poses.

Signs measured on the boxing renders (2026-11-14): `Hips` `rz` negative turns the character to its right; `Hips`
`rx` −88° lays the body on its back with the legs forward; `Spine` `ry` positive leans the torso to the character's
left. Derived from the axes, not rendered alone: `Shoulder.L` `rz` negative brings the left shoulder forward and `ry`
negative raises it (mirrored on `.R`). Arm IK: the elbow
goes towards the pole vector, the hinge is `dn × pole` so the arm keeps its natural twist. The left hook raised a
skin stretch at the left armpit when the elbow sat level with the shoulder. Fixed by delivering the hook with the
torso (spine −24°, chest −32° at impact, a 14° lean to the character's right) and raising `Shoulder.L` (`up` 20°,
`pro` 16°) so the upper arm stays lateral to the chest; the fist sits at 1.48 m with the forearm within 7 cm of level.
The cocked load (`HOOK_LOAD`, also HookCharge) lowers the elbow (pole z −0.6, `up` 14°). Measured on the base body:
mean stretch of the left torso edges 1.25 to 1.20 at impact (worst edge 4.1 to 2.6 times its rest length), 1.13 to
1.09 on the load (worst edge 2.8 to 2.1). The Jab got the same fix: at impact spine (5, −20, −32) and chest (7, 0, −28),
a 20° lean to the character's right that lifts the left shoulder, neck and head turned back to keep the eyes on the
target, pole (1, 0, 0) and `up` 10°; same fist contact point (within 2 mm). Every Jab key is converted to an
armature-space target (`_arm_in_world`), since blending the chest-frame guard into the world contact under a 60°
torso turn swung the fist 19 cm sideways. Measured on the base body: mean 1.27 to 1.20 at impact (worst edge 4.3 to
2.6), worst edge over the whole clip 4.3 to 3.3 (frames 7-10 of the retraction). Guard frame 0 itself has a worst
edge of 2.5 (a front armpit edge weighted 0.36 to `UpperArm.L`), so 2.5 is the floor without reweighting the body.

## Gates

- `cd front && npm run wear:check`: base has Idle, Walk, Run, under 8000 tris, feet within 5 cm of y = 0; wear
  pieces carry no animation and only base joints.
- `cd front && npm run skins:check`: skins ≤ 5 MB, ≤ 30000 tris, 1.7-2.1 m tall.

## Rebuild

```bash
blender --background --factory-startup --python front/scripts/skins/run_wear.py
```

It rewrites `front/public/assets/wear/**`; `-- only=base` exports only the six base GLBs, `-- only=slot/key,...` only
those pieces. Pieces carry no clip, so only `wear/base/model.glb` should change when a
clip is added. List what changed (`git status --short front/public/assets/wear`); a piece whose glTF structure is
unchanged and has no animation differs only by float noise. Tell the user before restoring it with `git checkout`.

Rendering a human pose: `studio()` switches the window to its own scene and `run_wear.py` exports every wear GLB
unless `WEAR_ARGS = ["build"]`. Prefer a headless Blender run with `{"__file__": p, "WEAR_ARGS": ["build"]}`, then
`show_pose(arm, fn, ph)` and a Workbench render, over the user's live Blender.
