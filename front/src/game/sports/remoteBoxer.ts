import type * as THREE from 'three'
import type { BoxerPose, UpperCharge, UpperShot } from '../../avatar/boxingAnimLogic'
import { type BoxingAnimator, createBoxingAnimator, loadBoxingClips } from '../../avatar/boxingAnimator'
import { wearGlovesOn } from './boxingGloves'

export interface RemoteBoxer {
  shot: (clip: UpperShot, cancel?: boolean) => void
  charge: (clip: UpperCharge, on: boolean) => void
  pose: (pose: BoxerPose) => void
  dispose: () => void
}

export function dressBoxer(avatar: THREE.Object3D): RemoteBoxer {
  const gloves = wearGlovesOn(avatar)
  let animator: BoxingAnimator | null = null
  let disposed = false
  let lastPose: BoxerPose | null = null
  loadBoxingClips()
    .then((boxingClips) => {
      if (disposed) return
      animator = createBoxingAnimator(avatar, boxingClips)
      if (animator && lastPose) animator.pose(lastPose)
    })
    .catch((error: unknown) => console.error('[boxing] clips not loaded', error))
  return {
    shot: (clip, cancel) => animator?.shot(clip, cancel),
    charge: (clip, on) => animator?.charge(clip, on),
    pose: (pose) => {
      lastPose = pose
      animator?.pose(pose)
    },
    dispose: () => {
      disposed = true
      gloves.dispose()
      animator?.dispose()
    },
  }
}
