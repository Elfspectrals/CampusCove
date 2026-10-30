import { RACE_MAX_PROGRESS_PER_S } from '../gameRoomConstants.ts'

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type DrinkFastZone = 'sweet' | 'fair' | 'poor' | 'slippery'

interface DrinkFastBand {
  zone: Exclude<DrinkFastZone, 'slippery'>
  from: number
  to: number
  ratePerS: number
}

export const DRINK_FAST_BANDS: readonly DrinkFastBand[] = [
  { zone: 'sweet', from: 0.42, to: 0.58, ratePerS: RACE_MAX_PROGRESS_PER_S },
  { zone: 'fair', from: 0.28, to: 0.72, ratePerS: 0.07 },
  { zone: 'poor', from: 0.12, to: 0.88, ratePerS: 0.03 },
]

export const SLIPPERY_S = 0.6
/** Above the top band the glass is tipped too far: one spill each time the cursor crosses this line. */
export const SPILL_ABOVE = Math.max(...DRINK_FAST_BANDS.map((band) => band.to))
const SLIPPERY_CONTROL = 0.35

const GRAVITY = 0.8
const HOLD_PUSH = 1.75
const MAX_SPEED = 1.0
const PERTURBATION_BASE = 0.25
const PERTURBATION_GROWTH_PER_S = 0.04
const PERTURBATION_MAX = 0.8
const GUST_SLOT_S = 0.7

export function drinkFastBand(y: number): DrinkFastBand | null {
  return DRINK_FAST_BANDS.find((band) => y >= band.from && y <= band.to) ?? null
}

export interface DrinkFastState {
  y: number
  progress: number
  zone: DrinkFastZone
  spills: number
}

export function createDrinkFastSim(seed: number) {
  const random = seededRandom(seed)
  const slowFrequency = 0.25 + random() * 0.25
  const slowPhase = random() * Math.PI * 2
  const fastFrequency = 0.7 + random() * 0.6
  const fastPhase = random() * Math.PI * 2
  const gustSeed = Math.floor(random() * 0x7fffffff)

  let y = 0.5
  let speed = 0
  let time = 0
  let progress = 0
  let slipperyLeft = 0
  let spills = 0
  let spilling = false

  function gust(): number {
    const slot = Math.floor(time / GUST_SLOT_S)
    return seededRandom(gustSeed + slot)() * 2 - 1
  }

  function perturbation(): number {
    const amplitude = Math.min(PERTURBATION_MAX, PERTURBATION_BASE + time * PERTURBATION_GROWTH_PER_S)
    const wave = 0.6 * Math.sin(Math.PI * 2 * slowFrequency * time + slowPhase) + 0.4 * Math.sin(Math.PI * 2 * fastFrequency * time + fastPhase)
    return amplitude * (wave + 0.8 * gust())
  }

  return {
    step(dt: number, holding: boolean): DrinkFastState {
      const control = slipperyLeft > 0 ? SLIPPERY_CONTROL : 1
      const push = holding ? HOLD_PUSH * control : 0
      speed += (push - GRAVITY + perturbation()) * dt
      speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed))
      y += speed * dt
      if (y <= 0 || y >= 1) {
        y = Math.max(0, Math.min(1, y))
        speed = 0
      }
      time += dt

      const band = drinkFastBand(y)
      if (y > SPILL_ABOVE && !spilling) spills++
      if (y > SPILL_ABOVE) spilling = true
      else if (band) spilling = false
      if (!band) slipperyLeft = SLIPPERY_S
      else slipperyLeft = Math.max(0, slipperyLeft - dt)

      const slippery = !band || slipperyLeft > 0
      if (!slippery && progress < 1) progress = Math.min(1, progress + band.ratePerS * dt)

      return { y, progress, zone: slippery ? 'slippery' : band.zone, spills }
    },
  }
}
