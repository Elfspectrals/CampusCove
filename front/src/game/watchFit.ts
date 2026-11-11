import * as THREE from 'three'

const WATCH_FROM_WRIST = 0.045
const BAND_HALF_LENGTH = 0.015
const STRAP_SLACK = 0.004
const MAX_STRAPPED_HALF = 0.047
const WRIST_BACK = new THREE.Vector3(0, 1, 0)

export interface WatchFit {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: number
}

export function fitWatchToForearm(forearm: readonly THREE.Vector3[], wrist: THREE.Vector3, strapInnerHalf: number): WatchFit {
  if (!(strapInnerHalf > 0)) throw new Error(`[watchFit] invalid strap opening ${strapInnerHalf}`)
  const length = wrist.length()
  const along = wrist.clone().normalize()
  const up = WRIST_BACK.clone().projectOnPlane(along).normalize()
  const side = up.clone().cross(along.clone().negate())
  const at = length - WATCH_FROM_WRIST
  const band = forearm.filter((v) => Math.abs(v.dot(along) - at) <= BAND_HALF_LENGTH)
  if (band.length === 0) throw new Error('[watchFit] no forearm vertex where the watch goes')
  const ups = band.map((v) => v.dot(up))
  const sides = band.map((v) => v.dot(side))
  const halfUp = (Math.max(...ups) - Math.min(...ups)) / 2
  const halfSide = (Math.max(...sides) - Math.min(...sides)) / 2
  const position = along
    .clone()
    .multiplyScalar(at)
    .addScaledVector(up, (Math.max(...ups) + Math.min(...ups)) / 2)
    .addScaledVector(side, (Math.max(...sides) + Math.min(...sides)) / 2)
  const basis = new THREE.Matrix4().makeBasis(side, up, along.clone().negate())
  return {
    position,
    quaternion: new THREE.Quaternion().setFromRotationMatrix(basis),
    scale: (Math.min(Math.max(halfUp, halfSide), MAX_STRAPPED_HALF) + STRAP_SLACK) / strapInnerHalf,
  }
}
