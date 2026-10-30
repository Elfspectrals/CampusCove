import { DRUNK_AT, INTOXICATION_MAX, TIPSY_AT } from '../gameRoomConstants.ts'

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

/**
 * Aim model (the server adds the hand scatter and the power drop, see socket/src/darts.ts):
 * - the crosshair drifts on seeded fractal noise, never a loop you can learn;
 * - the drift grows the longer one dart is aimed (arm fatigue) and with every pint;
 * - holding the breath (Shift) calms it for a short while, running out of air makes it worse;
 * - the throw itself is a hold-and-release power meter whose speed changes every dart.
 */
const SWAY_SOBER_CM = 2.4
const SWAY_TIPSY_CM = 6
const SWAY_DRUNK_CM = 12
/** Fast hand tremor on top of the slow drift (cm), multiplied when drunk. */
const TREMOR_CM = 0.25
const TREMOR_DRUNK_FACTOR = 4
/** Fatigue: the drift grows by this fraction after FATIGUE_FULL_S of aiming the same dart. */
const FATIGUE_GAIN = 0.9
const FATIGUE_FULL_S = 6
/** Drift octaves: frequency (Hz) and weight. Incommensurate so the pattern never repeats. */
const DRIFT_OCTAVES: ReadonlyArray<readonly [number, number]> = [
  [0.37, 0.62],
  [0.93, 0.28],
  [2.11, 0.1],
]
const TREMOR_HZ = 7.3

export const BREATH_HOLD_S = 1.8
const BREATH_REFILL_S = 2.6
const BREATH_GASP_S = 1.4
const BREATH_STEADY_SOBER = 0.3
const BREATH_STEADY_DRUNK = 0.65
const BREATH_GASP_FACTOR = 1.8

const METER_PERIOD_MIN_S = 1.4
const METER_PERIOD_MAX_S = 1.8
/** At full drunkenness the meter runs this many times faster. */
const METER_DRUNK_SPEEDUP = 0.6

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

function drunkenness(intoxication: number): number {
  return Math.max(0, Math.min(1, intoxication / INTOXICATION_MAX))
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Seeded 1D value noise in [-1, 1], smooth (C1) and non-periodic over any playable time. */
function hashUnit(seed: number, i: number): number {
  let h = Math.imul((seed ^ Math.imul(i, 0x27d4eb2d)) >>> 0, 0x9e3779b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return ((h >>> 0) / 4294967296) * 2 - 1
}

export function valueNoise(seed: number, t: number): number {
  const i = Math.floor(t)
  const f = smoothstep(t - i)
  const a = hashUnit(seed, i)
  const b = hashUnit(seed, i + 1)
  return a + (b - a) * f
}

function fractalNoise(seed: number, t: number): number {
  let sum = 0
  DRIFT_OCTAVES.forEach(([hz, weight], octave) => {
    sum += weight * valueNoise(seed + octave * 7919, t * hz)
  })
  return sum
}

export interface DriftInput {
  /** Seconds since the dart game opened (drives the noise). */
  t: number
  /** Seconds this dart has been aimed (fatigue). */
  aimedS: number
  intoxication: number
  seed: number
  /** Multiplier from the breath (1 normal, < 1 holding, > 1 gasping). */
  breathFactor: number
}

export function fatigueFactor(aimedS: number): number {
  return 1 + FATIGUE_GAIN * Math.min(1, Math.max(0, aimedS) / FATIGUE_FULL_S)
}

/** Offset (cm) added to the player's own aim: slow drift plus a fast tremor. */
export function aimDrift({ t, aimedS, intoxication, seed, breathFactor }: DriftInput): DartPoint {
  const amplitude = swayAmplitudeCm(intoxication) * fatigueFactor(aimedS) * breathFactor
  const tremor = TREMOR_CM * (1 + drunkenness(intoxication) * (TREMOR_DRUNK_FACTOR - 1)) * Math.max(1, breathFactor)
  return {
    x: amplitude * fractalNoise(seed, t) + tremor * valueNoise(seed + 101, t * TREMOR_HZ),
    y: amplitude * fractalNoise(seed + 50_021, t) + tremor * valueNoise(seed + 202, t * TREMOR_HZ),
  }
}

export interface BreathState {
  /** Air left, 0..1 (1 = a full breath, lasts BREATH_HOLD_S). */
  air: number
  /** Seconds of gasping left after running out of air (no holding meanwhile). */
  gasp: number
}

export const FULL_BREATH: BreathState = { air: 1, gasp: 0 }

/** Advances the breath by dt; `factor` multiplies the drift (steadier while holding, worse while gasping). */
export function breathStep(state: BreathState, holding: boolean, dt: number, intoxication: number): BreathState & { factor: number } {
  if (state.gasp > 0) {
    const gasp = Math.max(0, state.gasp - dt)
    return { air: Math.min(1, state.air + dt / BREATH_REFILL_S), gasp, factor: BREATH_GASP_FACTOR }
  }
  if (holding && state.air > 0) {
    const air = Math.max(0, state.air - dt / BREATH_HOLD_S)
    const steady = BREATH_STEADY_SOBER + drunkenness(intoxication) * (BREATH_STEADY_DRUNK - BREATH_STEADY_SOBER)
    if (air === 0) return { air, gasp: BREATH_GASP_S, factor: BREATH_GASP_FACTOR }
    return { air, gasp: 0, factor: steady }
  }
  return { air: Math.min(1, state.air + dt / BREATH_REFILL_S), gasp: 0, factor: 1 }
}

/** A new meter period for each dart (s), shorter when drunk, so the release cannot be learnt by rhythm. */
export function meterPeriodS(random: () => number, intoxication: number): number {
  const base = METER_PERIOD_MIN_S + random() * (METER_PERIOD_MAX_S - METER_PERIOD_MIN_S)
  return base / (1 + drunkenness(intoxication) * METER_DRUNK_SPEEDUP)
}

/** Power 0..1..0 while the throw is held: slow at the ends, fastest through the middle. */
export function meterPower(heldS: number, periodS: number): number {
  return (1 - Math.cos((Math.PI * 2 * Math.max(0, heldS)) / periodS)) / 2
}
