import { DARTS_MAX_OFFSET_CM, DARTS_POWER_DEAD_ZONE, DARTS_POWER_IDEAL, INTOXICATION_MAX } from './pubConstants.ts'

const BULL_CM = 0.635
const OUTER_BULL_CM = 1.59
const TRIPLE_MIN_CM = 9.9
const TRIPLE_MAX_CM = 10.7
const DOUBLE_MIN_CM = 16.2
const BOARD_CM = 17.0
const SECTOR_DEG = 18
const SECTORS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

/** Hand scatter added by the server to every dart (cm, per axis): the client never decides where a dart lands. */
export const DARTS_SCATTER_SOBER_CM = 0.7
export const DARTS_SCATTER_DRUNK_CM = 3
/** Extra scatter per unit of power error (a rushed or limp release also wobbles). */
const SCATTER_PER_POWER_ERROR_CM = 4
/** Vertical drop (too soft) or rise (too hard) per unit of power error beyond the dead zone. */
export const DARTS_POWER_SLOPE_CM = 25

export function dartsScore(x: number, y: number): number {
  const r = Math.hypot(x, y)
  if (r <= BULL_CM) return 50
  if (r <= OUTER_BULL_CM) return 25
  if (r > BOARD_CM) return 0
  const clockwiseFromTop = (Math.atan2(x, y) * 180) / Math.PI
  const sectorIndex = Math.floor(((clockwiseFromTop + 360 + SECTOR_DEG / 2) % 360) / SECTOR_DEG)
  const sector = SECTORS[sectorIndex]
  if (r >= TRIPLE_MIN_CM && r <= TRIPLE_MAX_CM) return sector * 3
  if (r >= DOUBLE_MIN_CM) return sector * 2
  return sector
}

function gaussian(random: () => number): number {
  const u = 1 - random()
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

function clampOffset(value: number): number {
  return Math.max(-DARTS_MAX_OFFSET_CM, Math.min(DARTS_MAX_OFFSET_CM, value))
}

/** Signed height error of a release: negative = too soft (the dart drops), positive = too hard (it rises). */
export function powerDropCm(power: number): number {
  const error = power - DARTS_POWER_IDEAL
  const beyond = Math.max(0, Math.abs(error) - DARTS_POWER_DEAD_ZONE)
  return beyond === 0 ? 0 : Math.sign(error) * beyond * DARTS_POWER_SLOPE_CM
}

export function scatterSigmaCm(intoxication: number, power: number): number {
  const drunkenness = Math.max(0, Math.min(1, intoxication / INTOXICATION_MAX))
  const powerError = Math.abs(power - DARTS_POWER_IDEAL)
  return DARTS_SCATTER_SOBER_CM + drunkenness * (DARTS_SCATTER_DRUNK_CM - DARTS_SCATTER_SOBER_CM) + powerError * SCATTER_PER_POWER_ERROR_CM
}

/**
 * Where a dart lands, decided server-side: the client only reports where its crosshair was (aim, drift included)
 * and how hard it threw (power 0..1 from the meter); the server adds the drop of a bad release and a random hand
 * scatter that grows with the player's server-side intoxication.
 */
export function dartLanding(aimX: number, aimY: number, power: number, intoxication: number, random: () => number = Math.random): { x: number, y: number } {
  const sigma = scatterSigmaCm(intoxication, power)
  return {
    x: clampOffset(aimX + gaussian(random) * sigma),
    y: clampOffset(aimY + powerDropCm(power) + gaussian(random) * sigma)
  }
}
