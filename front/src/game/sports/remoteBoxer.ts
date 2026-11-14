import type * as THREE from 'three'
import type { BoxerPose, UpperShot } from '../../avatar/boxingAnimLogic'
import { type BoxingAnimator, createBoxingAnimator, loadBoxingClips } from '../../avatar/boxingAnimator'
import { wearGlovesOn } from './boxingGloves'

export interface RemoteBoxer {
  shot: (clip: UpperShot) => void
  pose: (pose: BoxerPose) => void
  dispose: () => void
}

export function dressBoxer(avatar: THREE.Object3D): RemoteBoxer {
  const gloves = wearGlovesOn(avatar)
  let animator: BoxingAnimator | null = null
  let disposed = false
  let lastPose: BoxerPose | null = null
  loadBoxingClips()
    .then((layered) => {
      if (disposed) return
      animator = createBoxingAnimator(avatar, layered)
      if (animator && lastPose) animator.pose(lastPose)
    })
    .catch((error: unknown) => console.error('[boxing] clips not loaded', error))
  return {
    shot: (clip) => animator?.shot(clip),
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
