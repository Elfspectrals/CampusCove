import * as THREE from 'three'
import { createGltfLoader } from '../game/gltfLoaderFactory'
import {
  BoxingAnimState,
  FULL_BODY_ONE_SHOTS,
  UPPER_CHARGE_CLIPS,
  UPPER_SHOT_CLIPS,
  footwork,
  type BoxerPose,
  type FullBody,
  type UpperCharge,
  type UpperClip,
  type UpperShot,
} from './boxingAnimLogic'
import { BOXING_CLIP_PREFIX } from './animBlend'
import { avatarBlender, setAvatarAnimationOverride } from './glbCharacter'

export const BOXING_CLIPS_URL = '/assets/animations/boxing/clips.glb'
export const BOXING_FP_CLIPS_URL = '/assets/animations/boxing/fp_clips.glb'
const FP_CLIPS = ['FpGuard', 'FpBlock', 'FpJab', 'FpCross', 'FpHook', 'FpUppercut', 'FpHookCharge', 'FpUppercutCharge', 'FpHit'] as const
const LOWER_CLIPS = ['BoxIdle', 'BoxStep'] as const
const UPPER_CLIPS: readonly UpperClip[] = ['Guard', 'Block', ...UPPER_SHOT_CLIPS, ...UPPER_CHARGE_CLIPS]
const FULL_CLIPS: readonly FullBody[] = ['Knockdown', 'Down', 'GetUp', 'KO', 'Win']
const FOOTWORK_FADE_S = 0.15
const SHOTS_WITH_LEGS: readonly UpperShot[] = ['Uppercut']
const SHOT_START_S: Partial<Record<UpperShot, number>> = { Hook: 5 / 30, Uppercut: 4 / 30 }
const CANCEL_START_S: Partial<Record<UpperShot, number>> = { Jab: 1 / 30, Cross: 2 / 30, Hook: 5 / 30, Uppercut: 4 / 30 }
export const FP_CHARGE_EXIT_S = { FpHook: 5 / 30, FpUppercut: 4 / 30 } as const

let clips: Promise<THREE.AnimationClip[]> | null = null

function boxingClip(name: string): string {
  return BOXING_CLIP_PREFIX + name
}

export function loadBoxingClips(): Promise<THREE.AnimationClip[]> {
  clips ??= createGltfLoader()
    .loadAsync(BOXING_CLIPS_URL)
    .then((gltf) => {
      const names: readonly string[] = [...LOWER_CLIPS, ...UPPER_CLIPS, ...FULL_CLIPS]
      const missing = names.filter((name) => !gltf.animations.some((clip) => clip.name === name))
      if (missing.length > 0) throw new Error(`${BOXING_CLIPS_URL} has no ${missing.join(', ')} clip`)
      return gltf.animations
        .filter((clip) => names.includes(clip.name))
        .map((clip) => {
          const named = clip.clone()
          named.name = boxingClip(clip.name)
          return named
        })
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
  shot: (clip: UpperShot, cancel?: boolean) => void
  charge: (clip: UpperCharge, on: boolean) => void
  pose: (pose: BoxerPose) => void
  dispose: () => void
}

export function createBoxingAnimator(root: THREE.Object3D, boxingClips: THREE.AnimationClip[]): BoxingAnimator | null {
  const blender = avatarBlender(root)
  if (!blender) return null
  blender.add(boxingClips)
  const state = new BoxingAnimState()
  let legsShot: UpperShot | null = null

  function setUpper(clip: UpperClip, cancel = false) {
    if (!UPPER_SHOT_CLIPS.includes(clip as UpperShot)) {
      blender!.play('upper', boxingClip(clip))
      return
    }
    const shot = clip as UpperShot
    const fromS = (cancel ? CANCEL_START_S : SHOT_START_S)[shot] ?? 0
    blender!.play('upper', boxingClip(shot), {
      once: true,
      fromS,
      onDone: () => {
        const loop = state.shotFinished(shot, state.upper === 'Block')
        if (loop) setUpper(loop)
      },
    })
    if (!SHOTS_WITH_LEGS.includes(shot) || state.full !== null) return
    legsShot = shot
    blender!.play('lower', boxingClip(shot), {
      once: true,
      fromS,
      onDone: () => {
        if (legsShot === shot) legsShot = null
      },
    })
  }

  function playFull(clip: FullBody) {
    legsShot = null
    const once = FULL_BODY_ONE_SHOTS.includes(clip)
    const onDone = () => {
      const next = state.fullFinished(clip)
      if (next === null) setUpper(state.upper)
      else if (next !== clip) playFull(next)
    }
    blender!.play('lower', boxingClip(clip), { once })
    blender!.play('upper', boxingClip(clip), once ? { once, onDone } : {})
  }

  function update(_dt: number, speed: number) {
    if (state.full !== null || legsShot !== null) return
    const feet = footwork(speed)
    blender!.setTimeScale(boxingClip('BoxStep'), feet.stepTimeScale)
    blender!.mix('lower', { [boxingClip('BoxIdle')]: feet.idle, [boxingClip('BoxStep')]: feet.step }, FOOTWORK_FADE_S)
  }
  setUpper(state.upper)
  setAvatarAnimationOverride(root, update)

  return {
    shot: (clip, cancel = false) => {
      if (state.shot(clip)) setUpper(clip, cancel)
    },
    charge: (clip, on) => {
      const next = state.charge(clip, on)
      if (next) setUpper(next)
    },
    pose: (pose) => {
      const { upper, full } = state.pose(pose)
      if (upper) setUpper(upper)
      if (full !== 'none' && full) playFull(full)
    },
    dispose: () => {
      setAvatarAnimationOverride(root, null)
      blender.release(boxingClips.map((clip) => clip.name))
    },
  }
}
