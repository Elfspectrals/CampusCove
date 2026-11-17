import type { Bounds } from '../types.ts'
import type { PoolRules, WaterRect } from './swimRace.ts'

export interface SwimRules {
  speedMps: number
  fastSpeedMps: number
  verticalMps: number
  floatEyeAboveWaterM: number
  swimEyeMaxAboveWaterM: number
  underwaterEyeBelowWaterM: number
  minEyeAboveFloorM: number
}

export interface BreathRules {
  maxMs: number
  refillPerMs: number
  rescueDamage: number
}

export interface SwimPool {
  water: readonly WaterRect[]
  exits: readonly Bounds[]
  waterY: number
  deckY: number
  swim: SwimRules
  breath: BreathRules
}

export interface Breath {
  ms: number
  at: number
  underwater: boolean
}

export type SwimRejection = 'swim_too_fast' | 'below_pool_floor'

const SPEED_MARGIN = 1.25
const MOVE_MARGIN_M = 1.5
const FLOOR_TOLERANCE_M = 0.05
const RESCUE_DECK_OFFSET_M = 1.2
const RESCUE_EDGE_INSET_M = 0.5
const EYE_HEIGHT = 1.6

type Json = Record<string, unknown>

function num(raw: unknown, what: string, min = 0): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min) throw new Error(`swimming rules: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

export function parseSwimPool(raw: unknown, pool: PoolRules): SwimPool {
  const rules = raw as Json | null
  const swim = rules?.swim as Json | undefined
  const breath = rules?.breath as Json | undefined
  if (!swim || !breath) throw new Error('swimming rules: missing swim or breath block')
  const parsed: SwimRules = {
    speedMps: num(swim.speedMps, 'swim.speedMps', 0.1),
    fastSpeedMps: num(swim.fastSpeedMps, 'swim.fastSpeedMps', 0.1),
    verticalMps: num(swim.verticalMps, 'swim.verticalMps', 0.1),
    floatEyeAboveWaterM: num(swim.floatEyeAboveWaterM, 'swim.floatEyeAboveWaterM'),
    swimEyeMaxAboveWaterM: num(swim.swimEyeMaxAboveWaterM, 'swim.swimEyeMaxAboveWaterM'),
    underwaterEyeBelowWaterM: num(swim.underwaterEyeBelowWaterM, 'swim.underwaterEyeBelowWaterM'),
    minEyeAboveFloorM: num(swim.minEyeAboveFloorM, 'swim.minEyeAboveFloorM'),
  }
  if (parsed.fastSpeedMps < parsed.speedMps) throw new Error('swimming rules: swim.fastSpeedMps is below swim.speedMps')
  if (parsed.swimEyeMaxAboveWaterM < parsed.floatEyeAboveWaterM) throw new Error('swimming rules: a floating swimmer would not count as swimming')
  return {
    water: pool.water,
    exits: pool.exits,
    waterY: pool.waterY,
    deckY: pool.deckY,
    swim: parsed,
    breath: {
      maxMs: num(breath.maxMs, 'breath.maxMs', 1000),
      refillPerMs: num(breath.refillPerMs, 'breath.refillPerMs', 0.1),
      rescueDamage: num(breath.rescueDamage, 'breath.rescueDamage'),
    },
  }
}

function inside(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

export function swimWaterAt(pool: SwimPool, x: number, z: number): WaterRect | null {
  if (pool.exits.some((e) => inside(e, x, z))) return null
  return pool.water.find((w) => inside(w, x, z)) ?? null
}

export function isSwimming(pool: SwimPool, x: number, eyeY: number, z: number): boolean {
  return swimWaterAt(pool, x, z) !== null && eyeY <= pool.waterY + pool.swim.swimEyeMaxAboveWaterM
}

export function isUnderwater(pool: SwimPool, x: number, eyeY: number, z: number): boolean {
  return swimWaterAt(pool, x, z) !== null && eyeY < pool.waterY - pool.swim.underwaterEyeBelowWaterM
}

export function swimRejection(pool: SwimPool, from: { x: number, y: number, z: number }, to: { x: number, y: number, z: number }, elapsedS: number, speedScale = 1): SwimRejection | null {
  const water = swimWaterAt(pool, to.x, to.z)
  if (water && to.y < water.floorY + pool.swim.minEyeAboveFloorM - FLOOR_TOLERANCE_M) return 'below_pool_floor'
  if (!water || !isSwimming(pool, from.x, from.y, from.z)) return null
  const limit = pool.swim.fastSpeedMps * speedScale * SPEED_MARGIN * elapsedS + MOVE_MARGIN_M
  return Math.hypot(to.x - from.x, to.z - from.z) > limit ? 'swim_too_fast' : null
}

export function newBreath(pool: SwimPool, now: number): Breath {
  return { ms: pool.breath.maxMs, at: now, underwater: false }
}

export function stepBreath(pool: SwimPool, breath: Breath, underwater: boolean, now: number): void {
  const dt = Math.max(0, now - breath.at)
  breath.ms = breath.underwater ? Math.max(0, breath.ms - dt) : Math.min(pool.breath.maxMs, breath.ms + dt * pool.breath.refillPerMs)
  breath.at = now
  breath.underwater = underwater
}

export function rescuePoint(pool: SwimPool, x: number, z: number): { x: number, y: number, z: number } | null {
  const water = pool.water.find((w) => inside(w, x, z))
  if (!water) return null
  const clampedX = Math.min(water.maxX - RESCUE_EDGE_INSET_M, Math.max(water.minX + RESCUE_EDGE_INSET_M, x))
  return { x: clampedX, y: pool.deckY + EYE_HEIGHT, z: water.minZ - RESCUE_DECK_OFFSET_M }
}

export function rescueDamage(pool: SwimPool, health: number): number {
  return Math.max(0, Math.min(pool.breath.rescueDamage, health - 1))
}
