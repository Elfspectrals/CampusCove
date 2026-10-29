// Hunger / thirst / health rules, without Colyseus so they can be unit-tested (survivalStats.test.ts).
// Values go from 0 to 100. Front mirror (for display only): front/src/game/survival.ts.
import type { ClinicBedOccupant, HealOverTime, Stats } from './types.ts'

export const MAX_STAT = 100

// Time for a full gauge to empty while the player is online (no decay offline, everywhere in the world).
// DarkRP's hunger mod empties in ~10 min; a social RP session wants a meal and a drink every half hour or so.
const HUNGER_EMPTY_S = 40 * 60
const THIRST_EMPTY_S = 30 * 60
// An empty gauge hurts: 10 minutes from full health with one empty gauge, 5 with both.
const STARVATION_DAMAGE_PER_S = MAX_STAT / 600
// Both gauges at or above REGEN_THRESHOLD heal back to full in 15 minutes.
const REGEN_THRESHOLD = 80
const REGEN_PER_S = MAX_STAT / 900

const FALL_SAFE_HEIGHT = 3
const FALL_DAMAGE_PER_METRE = 12
const WALKING_DESCENT_SLOPE = 1

export const RESPAWN_HEALTH = 50
export const RESPAWN_MIN_GAUGE = 30
export const FOOD_POISONING_DAMAGE = 8

export const SPEED_BOOST_MS = 60_000
export const SPEED_BOOST_FACTOR = 1.3

export const HEAL_OVER_TIME_MS = 30_000

/** One portion of a food item, from the API's `consumed` payload. */
export interface Portion {
  health?: number
  hunger?: number
  thirst?: number
  effect?: string | null
}

export interface FountainState {
  sips: number
  readyAt: number
}

export function fullStats(): Stats {
  return { health: MAX_STAT, hunger: MAX_STAT, thirst: MAX_STAT }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(MAX_STAT, value))
}

export function normalizeStats(raw: { health?: unknown, hunger?: unknown, thirst?: unknown } | null | undefined): Stats {
  const read = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : MAX_STAT)
  return { health: read(raw?.health), hunger: read(raw?.hunger), thirst: read(raw?.thirst) }
}

/**
 * Advances the gauges by `dtSeconds`. `timeScale` > 1 only speeds up hunger and thirst (playtests).
 * Returns the new stats and the health lost to starvation / dehydration (0 when none).
 */
export function tickStats(stats: Stats, dtSeconds: number, timeScale = 1): { stats: Stats, damage: number } {
  const hunger = clamp(stats.hunger - (MAX_STAT / HUNGER_EMPTY_S) * dtSeconds * timeScale)
  const thirst = clamp(stats.thirst - (MAX_STAT / THIRST_EMPTY_S) * dtSeconds * timeScale)
  const emptyGauges = (hunger === 0 ? 1 : 0) + (thirst === 0 ? 1 : 0)
  let health = stats.health
  let damage = 0
  if (emptyGauges > 0) {
    damage = Math.min(health, STARVATION_DAMAGE_PER_S * emptyGauges * dtSeconds)
    health -= damage
  } else if (hunger >= REGEN_THRESHOLD && thirst >= REGEN_THRESHOLD) {
    health = clamp(health + REGEN_PER_S * dtSeconds)
  }
  return { stats: { health, hunger, thirst }, damage }
}

/** Effects of one portion (from the API's `consumed` payload) applied to the stats. */
export function applyPortion(stats: Stats, portion: Portion): Stats {
  const poisoned = portion.effect === 'food_poisoning'
  const instantHealth = portion.effect === 'heal_over_time' ? 0 : (portion.health ?? 0)
  return {
    health: clamp(stats.health + instantHealth - (poisoned ? FOOD_POISONING_DAMAGE : 0)),
    hunger: clamp(stats.hunger + (portion.hunger ?? 0)),
    thirst: clamp(stats.thirst + (portion.thirst ?? 0))
  }
}

export function startHealOverTime(now: number, amount: number): HealOverTime {
  return { until: now + HEAL_OVER_TIME_MS, perMs: amount / HEAL_OVER_TIME_MS, healedUntil: now }
}

export function tickHealOverTime(stats: Stats, healOverTime: HealOverTime | null, now: number): { stats: Stats, healOverTime: HealOverTime | null } {
  if (!healOverTime) return { stats, healOverTime: null }
  const healedUntil = Math.min(now, healOverTime.until)
  const health = clamp(stats.health + healOverTime.perMs * Math.max(0, healedUntil - healOverTime.healedUntil))
  return {
    stats: { ...stats, health },
    healOverTime: now >= healOverTime.until ? null : { ...healOverTime, healedUntil }
  }
}

export function pickBed<B extends { id: string }>(beds: B[], occupants: Map<string, ClinicBedOccupant>): B {
  const usedAt = (bed: B) => occupants.get(bed.id)?.usedAt ?? 0
  const free = beds.filter((bed) => !occupants.get(bed.id)?.sessionId)
  const candidates = free.length > 0 ? free : beds
  return candidates.reduce((best, bed) => (usedAt(bed) < usedAt(best) ? bed : best))
}

/** Damage when landing after falling from `peakY` down to `y` (client-reported heights). */
export function fallDamage(peakY: number, y: number): number {
  const drop = peakY - y
  return drop > FALL_SAFE_HEIGHT ? (drop - FALL_SAFE_HEIGHT) * FALL_DAMAGE_PER_METRE : 0
}

export function isWalkingDescent(drop: number, distXZ: number): boolean {
  return drop > 0 && drop <= distXZ * WALKING_DESCENT_SLOPE
}

/** Gauges after passing out: back on their feet with half health and a little food in the belly. */
export function respawnStats(stats: Stats): Stats {
  return {
    health: RESPAWN_HEALTH,
    hunger: Math.max(stats.hunger, RESPAWN_MIN_GAUGE),
    thirst: Math.max(stats.thirst, RESPAWN_MIN_GAUGE)
  }
}

// The town fountains are a free top-up, not a way to skip buying drinks: one drink, then every fountain is dry
// for that player for FOUNTAIN_COOLDOWN_MS (thirst empties in 30 min, so drinks still have to be bought).
export const FOUNTAIN_SIPS_PER_USE = 1
export const FOUNTAIN_COOLDOWN_MS = 30 * 60_000

/**
 * One fountain sip against the player's budget `state` ({ sips, readyAt } or null).
 * Returns { allowed, state, readyAt }: readyAt > now while the fountains are dry for this player.
 */
export function fountainSip(
  state: FountainState | null | undefined,
  now: number,
  cooldownMs = FOUNTAIN_COOLDOWN_MS
): { allowed: boolean, state: FountainState, readyAt: number } {
  const current = state && state.readyAt > 0 && now >= state.readyAt ? null : state
  if (current && current.readyAt > now) return { allowed: false, state: current, readyAt: current.readyAt }
  const sips = (current?.sips ?? 0) + 1
  const next = sips >= FOUNTAIN_SIPS_PER_USE ? { sips: 0, readyAt: now + cooldownMs } : { sips, readyAt: 0 }
  return { allowed: true, state: next, readyAt: next.readyAt }
}
