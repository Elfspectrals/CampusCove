import * as THREE from 'three'
import type { ParticleLevel } from './gameSettings'

export type RoomEffectKind = 'city' | 'apartment'

export interface RoomEffectsOptions {
  kind: RoomEffectKind
  level: ParticleLevel
  reducedMotion?: boolean
}

export interface RoomEffectsHandle {
  readonly group: THREE.Group
  readonly particleCount: number
  tick(dt: number, camera?: THREE.Camera): void
  dispose(): void
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function particleCount(kind: RoomEffectKind, level: ParticleLevel): number {
  if (level === 'off') return 0
  if (kind === 'city') return level === 'high' ? 256 : 96
  return level === 'high' ? 144 : 56
}

function spreadForRoom(kind: RoomEffectKind): THREE.Vector3 {
  return kind === 'city'
    ? new THREE.Vector3(30, 10, 30)
    : new THREE.Vector3(18, 5, 14)
}

/**
 * Lightweight local ambience. Positions are mutated in one reusable buffer and never
 * participate in collision or multiplayer state.
 */
export function createRoomEffects(options: RoomEffectsOptions): RoomEffectsHandle {
  const group = new THREE.Group()
  group.name = `RoomEffects:${options.kind}`
  group.userData.isRoomEffect = true

  const reduceMotion = options.reducedMotion ?? prefersReducedMotion()
  const count = reduceMotion ? 0 : particleCount(options.kind, options.level)
  if (count === 0) {
    return {
      group,
      particleCount: 0,
      tick: () => undefined,
      dispose: () => {
        group.removeFromParent()
      },
    }
  }

  const spread = spreadForRoom(options.kind)
  const positions = new Float32Array(count * 3)
  const verticalSpeeds = new Float32Array(count)
  const driftPhases = new Float32Array(count)

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3
    positions[offset] = (Math.random() - 0.5) * spread.x
    positions[offset + 1] = (Math.random() - 0.5) * spread.y
    positions[offset + 2] = (Math.random() - 0.5) * spread.z
    verticalSpeeds[index] =
      options.kind === 'city'
        ? 0.08 + Math.random() * 0.12
        : 0.025 + Math.random() * 0.045
    driftPhases[index] = Math.random() * Math.PI * 2
  }

  const geometry = new THREE.BufferGeometry()
  const positionAttribute = new THREE.BufferAttribute(positions, 3)
  positionAttribute.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', positionAttribute)

  const material = new THREE.PointsMaterial({
    color: options.kind === 'city' ? 0xe7f3ff : 0xffedcf,
    size: options.kind === 'city' ? 0.055 : 0.035,
    transparent: true,
    opacity: options.level === 'high' ? 0.48 : 0.34,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  group.add(points)

  let elapsed = 0
  let disposed = false

  function tick(dt: number, camera?: THREE.Camera): void {
    if (disposed) return
    const safeDt = Math.min(0.1, Math.max(0, dt))
    elapsed += safeDt
    if (options.kind === 'city' && camera) {
      group.position.x = camera.position.x
      group.position.y = camera.position.y
      group.position.z = camera.position.z
    }
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3
      positions[offset] =
        positions[offset]! +
        Math.sin(elapsed * 0.45 + driftPhases[index]!) * safeDt * 0.025
      positions[offset + 1] = positions[offset + 1]! + verticalSpeeds[index]! * safeDt
      if (positions[offset + 1]! > spread.y * 0.5) {
        positions[offset + 1] = -spread.y * 0.5
      }
    }
    positionAttribute.needsUpdate = true
  }

  function dispose(): void {
    if (disposed) return
    disposed = true
    group.removeFromParent()
    geometry.dispose()
    material.dispose()
    group.clear()
  }

  return { group, particleCount: count, tick, dispose }
}
