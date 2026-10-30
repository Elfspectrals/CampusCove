import { DRUNK_AT, INTOXICATION_MAX, TIPSY_AT } from '../gameRoomConstants.ts'

export type IntoxicationStage = 'sober' | 'tipsy' | 'drunk'

const TIPSY_ROLL = 0.012
const DRUNK_ROLL = 0.03
/** One full sway (roll left and right) takes about this long. */
export const SWAY_PERIOD_S = 3
/** The lateral swing of the camera, in metres per radian of roll. */
const LATERAL_PER_ROLL = 4
const DRUNK_WALK_FACTOR = 0.75

/** 0 below `from`, 1 at `to`, linear in between. */
function ramp(value: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (value - from) / (to - from)))
}

export function intoxicationStage(value: number): IntoxicationStage {
  if (value >= DRUNK_AT) return 'drunk'
  if (value >= TIPSY_AT) return 'tipsy'
  return 'sober'
}

/** Camera roll amplitude (radians): none sober, 0.012 at 60, 0.03 at 100. Nothing when camera motion is reduced. */
export function swayAmplitude(value: number, reduceCameraMotion = false): number {
  if (reduceCameraMotion || value <= TIPSY_AT) return 0
  if (value < DRUNK_AT) return TIPSY_ROLL * ramp(value, TIPSY_AT, DRUNK_AT)
  return TIPSY_ROLL + (DRUNK_ROLL - TIPSY_ROLL) * ramp(value, DRUNK_AT, INTOXICATION_MAX)
}

/** Roll (radians) and sideways camera offset (metres) at time `t` for a sway of `amplitude`. */
export function cameraSway(amplitude: number, t: number): { roll: number; lateral: number } {
  const phase = (2 * Math.PI * t) / SWAY_PERIOD_S
  return { roll: amplitude * Math.sin(phase), lateral: amplitude * LATERAL_PER_ROLL * Math.sin(phase * 0.5 + 1) }
}

export interface DrunkScreenEffects {
  /** Radial blur of the edges, 0..1. */
  blur: number
  /** Faint second image, 0..1. */
  doubleVision: number
  /** Warm vignette, 0..1. */
  warmth: number
}

/** `reduced` (accessibility setting) keeps the warm tint only. */
export function drunkScreenEffects(value: number, reduced = false): DrunkScreenEffects {
  const drunk = ramp(value, DRUNK_AT, INTOXICATION_MAX)
  return {
    blur: reduced ? 0 : drunk,
    doubleVision: reduced ? 0 : drunk,
    warmth: ramp(value, TIPSY_AT, INTOXICATION_MAX) * (reduced ? 0.5 : 1),
  }
}

/** Walking speed multiplier: 1 until drunk, down to 0.75 at the black-out. */
export function drunkWalkFactor(value: number): number {
  return 1 - (1 - DRUNK_WALK_FACTOR) * ramp(value, DRUNK_AT, INTOXICATION_MAX)
}
