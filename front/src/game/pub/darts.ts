import { DARTS_MAX_OFFSET_CM, DRUNK_AT, TIPSY_AT } from '../gameRoomConstants.ts'
import { seededRandom } from './drinkFast.ts'

export const DARTBOARD_CM = {
  bull: 0.635,
  outerBull: 1.59,
  tripleInner: 9.9,
  tripleOuter: 10.7,
  doubleInner: 16.2,
  doubleOuter: 17.0,
} as const

export const DARTBOARD_SECTORS: readonly number[] = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
export const SECTOR_DEG = 360 / DARTBOARD_SECTORS.length

const SWAY_SOBER_CM = 1.5
const SWAY_TIPSY_CM = 6
const SWAY_DRUNK_CM = 12
const THROW_SIGMA_SOBER_CM = 0.4
const THROW_SIGMA_DRUNK_CM = 2

export interface DartPoint {
  x: number
  y: number
}

export function sectorAt(x: number, y: number): number {
  const clockwiseDeg = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360
  const index = Math.floor(((clockwiseDeg + SECTOR_DEG / 2) % 360) / SECTOR_DEG)
  return DARTBOARD_SECTORS[index]!
}

type DartRing = 'bull' | 'outerBull' | 'single' | 'triple' | 'double' | 'miss'

function ringAt(x: number, y: number): DartRing {
  const r = Math.hypot(x, y)
  if (r <= DARTBOARD_CM.bull) return 'bull'
  if (r <= DARTBOARD_CM.outerBull) return 'outerBull'
  if (r > DARTBOARD_CM.doubleOuter) return 'miss'
  if (r >= DARTBOARD_CM.tripleInner && r <= DARTBOARD_CM.tripleOuter) return 'triple'
  if (r >= DARTBOARD_CM.doubleInner) return 'double'
  return 'single'
}

export function dartsScore(x: number, y: number): number {
  const ring = ringAt(x, y)
  if (ring === 'bull') return 50
  if (ring === 'outerBull') return 25
  if (ring === 'miss') return 0
  const sector = sectorAt(x, y)
  if (ring === 'triple') return sector * 3
  if (ring === 'double') return sector * 2
  return sector
}

export function dartLabel(x: number, y: number): string {
  const ring = ringAt(x, y)
  if (ring === 'bull') return 'Bull'
  if (ring === 'outerBull') return '25'
  if (ring === 'miss') return 'Miss'
  const sector = sectorAt(x, y)
  if (ring === 'triple') return `T${sector}`
  if (ring === 'double') return `D${sector}`
  return `${sector}`
}

export function swayAmplitudeCm(intoxication: number): number {
  if (intoxication < TIPSY_AT) return SWAY_SOBER_CM
  if (intoxication >= DRUNK_AT) return SWAY_DRUNK_CM
  return SWAY_TIPSY_CM + ((intoxication - TIPSY_AT) / (DRUNK_AT - TIPSY_AT)) * (SWAY_DRUNK_CM - SWAY_TIPSY_CM)
}

export function aimSway(t: number, intoxication: number, seed: number): DartPoint {
  const random = seededRandom(seed)
  const fx = 0.18 + random() * 0.1
  const fy = 0.25 + random() * 0.15
  const px = random() * Math.PI * 2
  const py = random() * Math.PI * 2
  const amplitude = swayAmplitudeCm(intoxication)
  return {
    x: amplitude * Math.sin(Math.PI * 2 * fx * t + px),
    y: amplitude * Math.sin(Math.PI * 2 * fy * t + py),
  }
}

function gaussian(random: () => number): number {
  const u = 1 - random()
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

function clampOffset(value: number): number {
  return Math.max(-DARTS_MAX_OFFSET_CM, Math.min(DARTS_MAX_OFFSET_CM, value))
}

export function throwOffset(aim: DartPoint, intoxication: number, random: () => number = Math.random): DartPoint {
  const drunkenness = Math.max(0, Math.min(1, intoxication / 100))
  const sigma = THROW_SIGMA_SOBER_CM + drunkenness * (THROW_SIGMA_DRUNK_CM - THROW_SIGMA_SOBER_CM)
  return {
    x: clampOffset(aim.x + gaussian(random) * sigma),
    y: clampOffset(aim.y + gaussian(random) * sigma),
  }
}
