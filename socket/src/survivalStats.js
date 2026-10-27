// Hunger / thirst / health rules, without Colyseus so they can be unit-tested (survivalStats.test.js).
// Values go from 0 to 100. Front mirror (for display only): front/src/game/survival.ts.

export const MAX_STAT = 100

// Time for a full gauge to empty while the player is online (no decay offline, everywhere in the world).
const HUNGER_EMPTY_S = 24 * 3600
const THIRST_EMPTY_S = 16 * 3600
// An empty gauge hurts: 10 minutes from full health with one empty gauge, 5 with both.
const STARVATION_DAMAGE_PER_S = MAX_STAT / 600
// Both gauges at or above REGEN_THRESHOLD heal back to full in 15 minutes.
const REGEN_THRESHOLD = 80
const REGEN_PER_S = MAX_STAT / 900

const FALL_SAFE_HEIGHT = 3
const FALL_DAMAGE_PER_METRE = 12

export const RESPAWN_HEALTH = 50
export const RESPAWN_MIN_GAUGE = 30
export const FOOD_POISONING_DAMAGE = 8

export const SPEED_BOOST_MS = 60_000
export const SPEED_BOOST_FACTOR = 1.3

export function fullStats() {
  return { health: MAX_STAT, hunger: MAX_STAT, thirst: MAX_STAT }
}

function clamp(value) {
  return Math.max(0, Math.min(MAX_STAT, value))
}

export function normalizeStats(raw) {
  const read = (v) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v) : MAX_STAT)
  return { health: read(raw?.health), hunger: read(raw?.hunger), thirst: read(raw?.thirst) }
}

/**
 * Advances the gauges by `dtSeconds`. `timeScale` > 1 only speeds up hunger and thirst (playtests).
 * Returns the new stats and the health lost to starvation / dehydration (0 when none).
 */
export function tickStats(stats, dtSeconds, timeScale = 1) {
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
export function applyPortion(stats, portion) {
  const poisoned = portion.effect === 'food_poisoning'
  return {
    health: clamp(stats.health + (portion.health ?? 0) - (poisoned ? FOOD_POISONING_DAMAGE : 0)),
    hunger: clamp(stats.hunger + (portion.hunger ?? 0)),
    thirst: clamp(stats.thirst + (portion.thirst ?? 0))
  }
}

/** Damage when landing after falling from `peakY` down to `y` (client-reported heights). */
export function fallDamage(peakY, y) {
  const drop = peakY - y
  return drop > FALL_SAFE_HEIGHT ? (drop - FALL_SAFE_HEIGHT) * FALL_DAMAGE_PER_METRE : 0
}

/** Gauges after passing out: back on their feet with half health and a little food in the belly. */
export function respawnStats(stats) {
  return {
    health: RESPAWN_HEALTH,
    hunger: Math.max(stats.hunger, RESPAWN_MIN_GAUGE),
    thirst: Math.max(stats.thirst, RESPAWN_MIN_GAUGE)
  }
}
