import type { PoolRules, WaterRect } from './poolRace'

export interface SwimInput {
  forward: number
  right: number
  up: boolean
  down: boolean
  fast: boolean
  speedFactor: number
}

export interface SwimStep {
  dx: number
  dz: number
  y: number
  vy: number
}

const GRAVITY = 22
const WATER_DRAG_PER_S = 4
const RISE_MPS = 1
const DIVE_PITCH = -0.35

function inside(r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ
}

export function swimWaterAt(rules: PoolRules, x: number, z: number): WaterRect | null {
  if (rules.exits.some((e) => inside(e, x, z))) return null
  return rules.water.find((w) => inside(w, x, z)) ?? null
}

export function floatEyeY(rules: PoolRules): number {
  return rules.waterY + rules.swim.floatEyeAboveWaterM
}

export function isUnderwater(rules: PoolRules, x: number, eyeY: number, z: number): boolean {
  return swimWaterAt(rules, x, z) !== null && eyeY < rules.waterY - rules.swim.underwaterEyeBelowWaterM
}

export function swimStep(rules: PoolRules, water: WaterRect, eyeY: number, vy: number, input: SwimInput, yaw: number, pitch: number, dt: number): SwimStep {
  const top = floatEyeY(rules)
  const bottom = water.floorY + rules.swim.minEyeAboveFloorM
  const speed = (input.fast ? rules.swim.fastSpeedMps : rules.swim.speedMps) * input.speedFactor
  const submerged = eyeY < rules.waterY - rules.swim.underwaterEyeBelowWaterM
  const followLook = input.forward !== 0 && (submerged || pitch < DIVE_PITCH)
  const flat = followLook ? Math.cos(pitch) : 1
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  const dx = (fx * input.forward * flat + -fz * input.right) * speed * dt
  const dz = (fz * input.forward * flat + fx * input.right) * speed * dt
  if (eyeY > top + 1e-3) {
    const nextVy = vy - GRAVITY * dt
    return { dx, dz, y: Math.max(bottom, eyeY + nextVy * dt), vy: nextVy }
  }
  const lookVy = followLook ? Math.sin(pitch) * input.forward * speed : 0
  const keyVy = ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * rules.swim.verticalMps * input.speedFactor
  const wantsVertical = lookVy !== 0 || keyVy !== 0
  const target = wantsVertical ? lookVy + keyVy : eyeY < top ? RISE_MPS : 0
  let nextVy = vy + (target - vy) * (1 - Math.exp(-WATER_DRAG_PER_S * dt))
  let y = eyeY + nextVy * dt
  if (y >= top) {
    y = top
    nextVy = Math.min(0, nextVy)
  }
  if (y <= bottom) {
    y = bottom
    nextVy = Math.max(0, nextVy)
  }
  return { dx, dz, y, vy: nextVy }
}
