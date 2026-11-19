import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { AvatarClipSelector, clampDt, startsDanceOneShot } from './avatarAnimationLogic.ts'
import { type AnimBlender, HUMAN_TORSO, createAnimBlender, humanBodyLayers } from './animBlender.ts'

/** Animation clips per loaded / cloned root (kept out of userData, which three JSON-clones). */
const clipsByRoot = new WeakMap<THREE.Object3D, THREE.AnimationClip[]>()
const animStateByRoot = new WeakMap<THREE.Object3D, AvatarAnimState>()

export function normalizeCharacterScale(root: THREE.Object3D): void {
  const targetH = 1.75
  root.updateMatrixWorld(true)

  let preBox = computeMeshBounds(root)
  if (!preBox) return
  const preSize = preBox.getSize(new THREE.Vector3())
  if (preSize.y < preSize.z * 0.6) {
    root.rotation.x = -Math.PI / 2
    root.updateMatrixWorld(true)
    preBox = computeMeshBounds(root)
    if (!preBox) return
  }

  const size = preBox.getSize(new THREE.Vector3())
  const measuredHeight = Math.max(size.y, size.z, 0.001)
  const scale = targetH / measuredHeight
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)

  const centeredBox = computeMeshBounds(root)
  if (!centeredBox) return
  const center = centeredBox.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= centeredBox.min.y
  root.updateMatrixWorld(true)

  const regrounded = computeMeshBounds(root)
  if (!regrounded) return
  root.position.y -= regrounded.min.y
}

function computeMeshBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  let hasMesh = false

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const geometry = obj.geometry
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox()
    }
    const localBounds = geometry.boundingBox
    if (!localBounds) return
    const worldBounds = localBounds.clone().applyMatrix4(obj.matrixWorld)
    if (!hasMesh) {
      box.copy(worldBounds)
      hasMesh = true
      return
    }
    box.union(worldBounds)
  })

  if (hasMesh) return box
  const fallback = new THREE.Box3().setFromObject(root)
  if (fallback.isEmpty()) return null
  return fallback
}

/** True for rigged (skinned) models such as the premium skins. */
export function hasSkinnedMesh(root: THREE.Object3D): boolean {
  let found = false
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) found = true
  })
  return found
}

/** Remember the animation clips of a loaded model so its clones can animate (see attachAvatarAnimations). */
export function setCharacterClips(root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  clipsByRoot.set(root, clips)
}

/**
 * Clone for one avatar instance.
 * - Static skins: deep clone with unique materials so each instance can be tinted independently.
 * - Rigged skins: own skeleton per instance (otherwise every clone shares and fights over one pose), but geometry and
 *   materials stay shared with the cached template (they are never tinted) and are flagged so `disposeObject3D`
 *   does not free what other instances still use. Skinned meshes are never frustum-culled: their bounds are the
 *   bind pose, which the cape / halo / orbiting crystals leave.
 */
export function cloneCharacterWithUniqueMaterials(source: THREE.Object3D): THREE.Group {
  const rigged = hasSkinnedMesh(source)
  const c = (rigged ? cloneSkinned(source) : source.clone(true)) as THREE.Group
  clipsByRoot.set(c, clipsByRoot.get(source) ?? [])
  c.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return
    obj.userData.sharedGeometry = true // clones always share the template's geometry
    if (rigged) {
      obj.userData.sharedMaterials = true
      obj.frustumCulled = false
      return
    }
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone())
    } else {
      obj.material = obj.material.clone()
    }
  })
  return c
}

interface AvatarAnimState {
  mixer: THREE.AnimationMixer
  blender: AnimBlender
  selector: AvatarClipSelector
  seated: boolean
  dribbling: boolean
  tennis: boolean
  dancing: { clip: string; timeScale: number } | null
  crouching: boolean
  swimming: boolean
  oneShot: OneShotClip | null
  racePose: RacePoseClip | null
  climbPose: AvatarClimbPose
  climbMove: string | null
  override?: ((dt: number, speed: number) => void) | null
  skating: boolean
  skatePushedAt: number
  skateMove: string | null
}

const SIT_CLIP = 'Sit'
const CROUCH_CLIP = 'PetanqueCrouch'
const PICK_CLIP = 'Pick'
const SPORTS_MOVE_CLIPS = ['Kick', 'Shot', 'Tackle', 'Celebrate', 'JumpShot', 'Dunk', 'Block', 'Steal'] as const
export type SportsMoveClip = (typeof SPORTS_MOVE_CLIPS)[number]
const DRIBBLE_CLIP = 'Dribble'
const LEAN_CLIP = 'RunLean'
const TENNIS_READY_CLIP = 'TennisReady'
const TENNIS_STROKE_CLIPS = { serve: 'TennisServe', forehand: 'TennisForehand', backhand: 'TennisBackhand', lob: 'TennisLob', celebrate: 'TennisCelebrate' } as const
export type TennisStroke = keyof typeof TENNIS_STROKE_CLIPS
const STUMBLE_CLIP = 'Stumble'
const DANCE_MOVE_CLIPS = ['DanceMoveLeft', 'DanceMoveDown', 'DanceMoveUp', 'DanceMoveRight'] as const
const POOL_CLIPS = ['Dive', 'Somersault', 'Twist', 'Cannonball'] as const
export type PoolClip = (typeof POOL_CLIPS)[number]
const SWIM_CLIP = 'Swim'
const TREAD_CLIP = 'Tread'
const SWIM_MIN_SPEED = 0.3
const ONE_SHOT_CLIPS = [PICK_CLIP, 'Eat', 'Drink', ...POOL_CLIPS, LEAN_CLIP, ...SPORTS_MOVE_CLIPS, ...Object.values(TENNIS_STROKE_CLIPS), STUMBLE_CLIP, ...DANCE_MOVE_CLIPS, 'PetanquePoint', 'PetanqueShoot', 'PetanqueCelebrate'] as const
const DANCE_ONE_SHOTS: readonly OneShotClip[] = [STUMBLE_CLIP, ...DANCE_MOVE_CLIPS]
type OneShotClip = (typeof ONE_SHOT_CLIPS)[number]
const UPPER_ONE_SHOTS: ReadonlySet<OneShotClip> = new Set<OneShotClip>([PICK_CLIP, 'Eat', 'Drink'])
const MOVING_ONE_SHOTS: ReadonlySet<OneShotClip> = new Set<OneShotClip>([...POOL_CLIPS, LEAN_CLIP, ...SPORTS_MOVE_CLIPS, ...Object.values(TENNIS_STROKE_CLIPS)])
type RacePoseClip = 'RunSet' | 'Breathless'
export type RacePose = 'set' | 'lean' | 'breathless'

export type AvatarClimbPose = 'hang' | 'lower' | null
export type AvatarClimbMove = 'reachL' | 'reachR' | 'top' | 'fall'
const CLIMB_POSE_CLIPS = { hang: 'ClimbHang', lower: 'ClimbLower' } as const
const CLIMB_MOVE_CLIPS: Record<AvatarClimbMove, string> = { reachL: 'ClimbReachL', reachR: 'ClimbReachR', top: 'ClimbTop', fall: 'ClimbFall' }
export type AvatarSkateMove = 'fall' | 'stumble' | 'brake'
const SKATE_MOVE_CLIPS: Record<AvatarSkateMove, string> = { fall: 'SkateFall', stumble: 'SkateStumble', brake: 'SkateBrake' }
const SKATE_GLIDE_CLIP = 'SkateGlide'
const SKATE_PUSH_CLIP = 'SkatePush'
const SKATE_PUSH_SHOWN_MS = 900

/**
 * Premium skins ship rigged with "Idle" / "Walk" / "Run" clips. Starts a mixer on the instance (no-op for
 * the legacy static skins, which have no clips).
 */
export function attachAvatarAnimations(root: THREE.Object3D): void {
  const clips = clipsByRoot.get(root) ?? []
  if (clips.length === 0) return
  const mixer = new THREE.AnimationMixer(root)
  const blender = createAnimBlender(mixer, root, humanBodyLayers(), HUMAN_TORSO)
  blender.add(clips)
  const state: AvatarAnimState = { mixer, blender, selector: new AvatarClipSelector(), seated: false, swimming: false, crouching: false, dribbling: false, tennis: false, dancing: null, oneShot: null, racePose: null, climbPose: null, climbMove: null, skating: false, skatePushedAt: -Infinity, skateMove: null }
  animStateByRoot.set(root, state)
  playClip(state, 'Idle', 1)
}

/**
 * Sit the avatar down (pub seats) or stand it up. Returns true when the skin has a `Sit` clip and plays it;
 * static or older skins keep Idle and the caller lowers them instead.
 */
export function setAvatarSeated(root: THREE.Object3D, seated: boolean): boolean {
  const state = animStateByRoot.get(root)
  if (!state) return false
  state.seated = seated && state.blender.has(SIT_CLIP)
  return state.seated
}

export function setAvatarDancing(root: THREE.Object3D, dance: { clip: string; timeScale: number } | null): void {
  const state = animStateByRoot.get(root)
  if (!state || (dance && !state.blender.has(dance.clip))) return
  state.dancing = dance
  if (dance === null && state.oneShot !== null && DANCE_ONE_SHOTS.includes(state.oneShot)) state.oneShot = null
}

export function setAvatarStumbling(root: THREE.Object3D): void {
  const state = animStateByRoot.get(root)
  if (state?.dancing != null && startsDanceOneShot(state.oneShot, STUMBLE_CLIP)) playOneShot(state, STUMBLE_CLIP)
}

export function setAvatarDanceMove(root: THREE.Object3D, lane: number): void {
  const state = animStateByRoot.get(root)
  const clip = DANCE_MOVE_CLIPS[lane]
  if (state?.dancing != null && clip && startsDanceOneShot(state.oneShot, clip)) playOneShot(state, clip)
}

export function setAvatarClimbPose(root: THREE.Object3D, pose: AvatarClimbPose): void {
  const state = animStateByRoot.get(root)
  if (state) state.climbPose = pose
}

export function playAvatarClimbMove(root: THREE.Object3D, move: AvatarClimbMove): void {
  const state = animStateByRoot.get(root)
  const name = CLIMB_MOVE_CLIPS[move]
  if (!state?.blender.has(name)) return
  state.climbMove = name
  state.oneShot = null
  playOnce(state, name, true, () => {
    if (state.climbMove === name) state.climbMove = null
  })
}

export function setAvatarSkating(root: THREE.Object3D, skating: boolean): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  state.skating = skating && state.blender.has(SKATE_GLIDE_CLIP)
  if (!state.skating) state.skateMove = null
}

export function markAvatarSkatePush(root: THREE.Object3D, now: number): void {
  const state = animStateByRoot.get(root)
  if (state?.skating) state.skatePushedAt = now
}

export function playAvatarSkateMove(root: THREE.Object3D, move: AvatarSkateMove): void {
  const state = animStateByRoot.get(root)
  const name = SKATE_MOVE_CLIPS[move]
  if (!state?.skating || !state.blender.has(name)) return
  state.skateMove = name
  state.oneShot = null
  playOnce(state, name, true, () => {
    if (state.skateMove === name) state.skateMove = null
  })
}

export function setAvatarCrouching(root: THREE.Object3D, crouching: boolean): void {
  const state = animStateByRoot.get(root)
  if (state) state.crouching = crouching && state.blender.has(CROUCH_CLIP)
}

function playOnce(state: AvatarAnimState, name: string, fullBody: boolean, onDone: () => void): void {
  if (fullBody) state.blender.play('lower', name, { once: true })
  state.blender.play('upper', name, { once: true, onDone })
}

function playOneShot(state: AvatarAnimState, name: OneShotClip): void {
  if (!state.blender.has(name)) return
  state.oneShot = name
  const fullBody = !UPPER_ONE_SHOTS.has(name) || state.selector.clip === 'Idle'
  playOnce(state, name, fullBody, () => {
    if (state.oneShot === name) state.oneShot = null
  })
}

export function setAvatarPicking(root: THREE.Object3D, picking: boolean): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  if (picking) playOneShot(state, PICK_CLIP)
  else if (state.oneShot === PICK_CLIP) state.oneShot = null
}

export function setAvatarSwimming(root: THREE.Object3D, swimming: boolean): void {
  const state = animStateByRoot.get(root)
  if (state) state.swimming = swimming && state.blender.has(SWIM_CLIP) && state.blender.has(TREAD_CLIP)
}

export function playAvatarPoolClip(root: THREE.Object3D, clip: PoolClip): void {
  const state = animStateByRoot.get(root)
  if (state && !state.seated) playOneShot(state, clip)
}

export function setAvatarEating(root: THREE.Object3D, kind: 'eat' | 'drink'): void {
  const state = animStateByRoot.get(root)
  if (!state || state.seated || state.oneShot === PICK_CLIP) return
  playOneShot(state, kind === 'eat' ? 'Eat' : 'Drink')
}

export function playAvatarSportsMove(root: THREE.Object3D, clip: SportsMoveClip): void {
  const state = animStateByRoot.get(root)
  if (!state || state.seated) return
  playOneShot(state, clip)
}

export function setAvatarDribbling(root: THREE.Object3D, dribbling: boolean): void {
  const state = animStateByRoot.get(root)
  if (state) state.dribbling = dribbling && state.blender.has(DRIBBLE_CLIP)
}

export function setAvatarRacePose(root: THREE.Object3D, pose: RacePose | null): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  if (pose === 'lean') {
    playOneShot(state, LEAN_CLIP)
    return
  }
  state.racePose = pose === 'set' ? 'RunSet' : pose === 'breathless' ? 'Breathless' : null
}

function racePoseClip(state: AvatarAnimState, clip: string): RacePoseClip | null {
  const pose = state.racePose
  if (!pose || !state.blender.has(pose)) return null
  if (pose === 'Breathless' && clip !== 'Idle') {
    state.racePose = null
    return null
  }
  return pose
}

export function setAvatarTennis(root: THREE.Object3D, on: boolean): void {
  const state = animStateByRoot.get(root)
  if (state) state.tennis = on && state.blender.has(TENNIS_READY_CLIP)
}

export function playAvatarTennisStroke(root: THREE.Object3D, stroke: TennisStroke): void {
  const state = animStateByRoot.get(root)
  if (!state || state.seated) return
  playOneShot(state, TENNIS_STROKE_CLIPS[stroke])
}

export type PetanqueClip = 'PetanquePoint' | 'PetanqueShoot' | 'PetanqueCelebrate'

export function setAvatarPetanque(root: THREE.Object3D, clip: PetanqueClip): void {
  const state = animStateByRoot.get(root)
  if (!state || state.seated || state.oneShot === PICK_CLIP || state.selector.clip !== 'Idle') return
  playOneShot(state, clip)
}

function playLower(state: AvatarAnimState, name: string, timeScale: number): void {
  state.blender.play('lower', name, { timeScale })
}

function playClip(state: AvatarAnimState, name: string, timeScale: number): void {
  if (state.oneShot !== null && state.oneShot !== name) state.oneShot = null
  playLower(state, name, timeScale)
  state.blender.play('upper', name, { timeScale })
}

/**
 * Advance the avatar's clips; `speed` is its horizontal speed in m/s (picks Idle / Walk / Run, smoothed with
 * hysteresis). `dt` is clamped so a background tab can't fast-forward the animation.
 */
export function updateAvatarAnimation(root: THREE.Object3D, dt: number, speed: number): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  if (state.skateMove) {
    playClip(state, state.skateMove, 1)
  } else if (state.skating) {
    playClip(state, Date.now() - state.skatePushedAt < SKATE_PUSH_SHOWN_MS ? SKATE_PUSH_CLIP : SKATE_GLIDE_CLIP, 1)
  } else if (state.override) {
    state.oneShot = null
    state.override(clampDt(dt), speed)
  } else if (state.climbMove) {
    playClip(state, state.climbMove, 1)
  } else if (state.climbPose && state.blender.has(CLIMB_POSE_CLIPS[state.climbPose])) {
    playClip(state, CLIMB_POSE_CLIPS[state.climbPose], 1)
  } else if (state.seated) {
    playClip(state, SIT_CLIP, 1)
  } else if (state.dancing !== null) {
    if (state.oneShot === null || !DANCE_ONE_SHOTS.includes(state.oneShot)) playClip(state, state.dancing.clip, state.dancing.timeScale)
  } else if (state.swimming) {
    if (state.oneShot === null) playClip(state, speed > SWIM_MIN_SPEED ? SWIM_CLIP : TREAD_CLIP, 1)
  } else {
    const { clip, timeScale } = state.selector.update(dt, speed)
    if (state.oneShot !== null && !MOVING_ONE_SHOTS.has(state.oneShot) && !UPPER_ONE_SHOTS.has(state.oneShot) && clip !== 'Idle') state.oneShot = null
    const pose = racePoseClip(state, clip)
    const base = pose ?? (state.dribbling && clip !== 'Idle' ? DRIBBLE_CLIP : state.tennis && clip === 'Idle' ? TENNIS_READY_CLIP : state.crouching && clip === 'Idle' ? CROUCH_CLIP : clip)
    const baseScale = pose ? 1 : timeScale
    if (state.oneShot === null) playClip(state, base, baseScale)
    else if (UPPER_ONE_SHOTS.has(state.oneShot) && (clip !== 'Idle' || state.blender.lead('lower') !== state.oneShot)) playLower(state, base, baseScale)
  }
  state.blender.update(clampDt(dt))
  state.mixer.update(clampDt(dt))
  state.blender.correctTorso()
}

export function avatarBlender(root: THREE.Object3D): AnimBlender | null {
  return animStateByRoot.get(root)?.blender ?? null
}

export function setAvatarAnimationOverride(root: THREE.Object3D, override: ((dt: number, speed: number) => void) | null): void {
  const state = animStateByRoot.get(root)
  if (state) state.override = override
}

/** Stop and forget an instance's mixer (call before disposing the avatar). */
export function disposeAvatarAnimations(root: THREE.Object3D): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  state.blender.dispose()
  state.mixer.stopAllAction()
  state.mixer.uncacheRoot(root)
  animStateByRoot.delete(root)
}
