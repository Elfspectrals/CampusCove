import * as THREE from 'three'
import { createGltfLoader } from '../game/gltfLoaderFactory'
import {
  BoxingAnimState,
  FULL_BODY_ONE_SHOTS,
  LOWER_BODY_BONES,
  UPPER_BODY_BONES,
  UPPER_CHARGE_CLIPS,
  UPPER_SHOT_CLIPS,
  footwork,
  keepsTrack,
  type BoxerPose,
  type FullBody,
  type UpperCharge,
  type UpperClip,
  type UpperShot,
} from './boxingAnimLogic'
import { avatarMixer, setAvatarAnimationOverride } from './glbCharacter'

export const BOXING_CLIPS_URL = '/assets/animations/boxing/clips.glb'
export const BOXING_FP_CLIPS_URL = '/assets/animations/boxing/fp_clips.glb'
const FP_CLIPS = ['FpGuard', 'FpBlock', 'FpJab', 'FpCross', 'FpHook', 'FpUppercut', 'FpHookCharge', 'FpUppercutCharge', 'FpHit'] as const
const LOWER_CLIPS = ['BoxIdle', 'BoxStep'] as const
const UPPER_CLIPS: readonly UpperClip[] = ['Guard', 'Block', ...UPPER_SHOT_CLIPS, ...UPPER_CHARGE_CLIPS]
const FULL_CLIPS: readonly FullBody[] = ['Knockdown', 'Down', 'GetUp', 'KO', 'Win']
const FADE_RATE = 14
const TWIN_SUFFIX = '#twin'
const CHARGE_EXIT_S: Partial<Record<UpperShot, number>> = { Hook: 5 / 30, Uppercut: 4 / 30 }
export const FP_CHARGE_EXIT_S = { FpHook: 5 / 30, FpUppercut: 4 / 30 } as const

function layerClip(clip: THREE.AnimationClip, bones: readonly string[]): THREE.AnimationClip {
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter((track) => keepsTrack(track.name, bones)))
}

let clips: Promise<Map<string, THREE.AnimationClip>> | null = null

export function loadBoxingClips(): Promise<Map<string, THREE.AnimationClip>> {
  clips ??= createGltfLoader()
    .loadAsync(BOXING_CLIPS_URL)
    .then((gltf) => {
      const byName = new Map(gltf.animations.map((clip) => [clip.name, clip]))
      const missing = [...LOWER_CLIPS, ...UPPER_CLIPS, ...FULL_CLIPS].filter((name) => !byName.has(name))
      if (missing.length > 0) throw new Error(`${BOXING_CLIPS_URL} has no ${missing.join(', ')} clip`)
      const layered = new Map<string, THREE.AnimationClip>()
      for (const name of LOWER_CLIPS) layered.set(name, layerClip(byName.get(name)!, LOWER_BODY_BONES))
      for (const name of UPPER_CLIPS) layered.set(name, layerClip(byName.get(name)!, UPPER_BODY_BONES))
      for (const name of UPPER_SHOT_CLIPS) {
        const twin = layered.get(name)!.clone()
        twin.name = name + TWIN_SUFFIX
        layered.set(twin.name, twin)
      }
      for (const name of FULL_CLIPS) layered.set(name, byName.get(name)!)
      return layered
    })
  return clips
}

let fpClips: Promise<THREE.AnimationClip[]> | null = null

export function loadBoxingFpClips(): Promise<THREE.AnimationClip[]> {
  fpClips ??= createGltfLoader()
    .loadAsync(BOXING_FP_CLIPS_URL)
    .then((gltf) => {
      const missing = FP_CLIPS.filter((name) => !gltf.animations.some((clip) => clip.name === name))
      if (missing.length > 0) throw new Error(`${BOXING_FP_CLIPS_URL} has no ${missing.join(', ')} clip`)
      return gltf.animations.filter((clip) => (FP_CLIPS as readonly string[]).includes(clip.name))
    })
  return fpClips
}

export interface BoxingAnimator {
  shot: (clip: UpperShot) => void
  charge: (clip: UpperCharge, on: boolean) => void
  pose: (pose: BoxerPose) => void
  dispose: () => void
}

export function createBoxingAnimator(root: THREE.Object3D, layered: Map<string, THREE.AnimationClip>): BoxingAnimator | null {
  const mixer = avatarMixer(root)
  if (!mixer) return null
  const state = new BoxingAnimState()
  const actions = new Map<string, THREE.AnimationAction>()
  const weights = new Map<string, number>()
  const targets = new Map<string, number>()
  const clipOf = (name: string) => name.replace(TWIN_SUFFIX, '')
  let upperInstance: string = state.upper
  for (const [name, clip] of layered) {
    const action = mixer.clipAction(clip, root)
    const oneShot = UPPER_SHOT_CLIPS.includes(clipOf(name) as UpperShot) || FULL_BODY_ONE_SHOTS.includes(name as FullBody)
    if (oneShot) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    action.setEffectiveWeight(0)
    action.play()
    actions.set(name, action)
    weights.set(name, 0)
    targets.set(name, 0)
  }

  function restart(name: string, fromS = 0) {
    const action = actions.get(name)
    if (!action) return
    action.reset()
    action.time = fromS
    action.play()
  }

  function setUpper(clip: UpperClip) {
    const twin = clip + TWIN_SUFFIX
    upperInstance = upperInstance === clip && actions.has(twin) ? twin : clip
    restart(upperInstance, CHARGE_EXIT_S[clip as UpperShot] ?? 0)
  }

  function onFinished(e: { action: THREE.AnimationAction }) {
    const instance = e.action.getClip().name
    const name = clipOf(instance)
    if (UPPER_SHOT_CLIPS.includes(name as UpperShot) && instance === upperInstance) {
      const loop = state.shotFinished(name as UpperShot, state.upper === 'Block')
      if (loop) setUpper(loop)
    }
    if (FULL_BODY_ONE_SHOTS.includes(name as FullBody)) {
      const next = state.fullFinished(name as FullBody)
      if (next) restart(next)
    }
  }
  mixer.addEventListener('finished', onFinished)

  function update(dt: number, speed: number) {
    const body = state.full === null ? 1 : 0
    const feet = footwork(speed)
    targets.set('BoxIdle', feet.idle * body)
    targets.set('BoxStep', feet.step * body)
    const step = actions.get('BoxStep')
    if (step) step.timeScale = feet.stepTimeScale
    for (const name of layered.keys()) if (UPPER_CLIPS.includes(clipOf(name) as UpperClip)) targets.set(name, name === upperInstance ? body : 0)
    for (const name of FULL_CLIPS) targets.set(name, name === state.full ? 1 : 0)
    const k = Math.min(1, dt * FADE_RATE)
    for (const [name, action] of actions) {
      const w = weights.get(name)! + (targets.get(name)! - weights.get(name)!) * k
      weights.set(name, w)
      action.setEffectiveWeight(w)
    }
  }
  setAvatarAnimationOverride(root, update)

  return {
    shot: (clip) => {
      if (state.shot(clip)) setUpper(clip)
    },
    charge: (clip, on) => {
      const next = state.charge(clip, on)
      if (next) setUpper(next)
    },
    pose: (pose) => {
      const { upper, full } = state.pose(pose)
      if (upper) setUpper(upper)
      if (full !== 'none' && full) restart(full)
    },
    dispose: () => {
      setAvatarAnimationOverride(root, null)
      mixer.removeEventListener('finished', onFinished)
      for (const action of actions.values()) action.stop()
      for (const clip of layered.values()) mixer.uncacheAction(clip, root)
    },
  }
}
