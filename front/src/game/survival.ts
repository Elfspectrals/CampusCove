/**
 * Hunger, thirst and health as the player sees them. The realtime server owns the values (socket/src/
 * survivalStats.ts); this file only turns them into visuals: watch colours, screen effects, walking speed.
 */

export interface SurvivalStats {
  health: number
  hunger: number
  thirst: number
}

export const FULL_STATS: SurvivalStats = { health: 100, hunger: 100, thirst: 100 }

/** Below this a gauge is "low": the watch blinks it and the screen starts to show it. */
const LOW_GAUGE = 25
/** Below this a gauge is critical: stronger effects, slower walk. */
const CRITICAL_GAUGE = 10

const SLOW_WALK_FACTOR = 0.8
/** Same as SPEED_BOOST_FACTOR in socket/src/survivalStats.ts (the server allows it while the boost lasts). */
export const SPEED_BOOST_FACTOR = 1.3

export type GaugeKey = keyof SurvivalStats

export const GAUGE_COLORS: Record<GaugeKey, string> = {
  health: '#e24b4a',
  hunger: '#ef9f27',
  thirst: '#378add',
}

/** 0 above `from`, rising to 1 at 0. */
function lowness(value: number, from: number): number {
  return value >= from ? 0 : Math.min(1, (from - value) / from)
}

export interface ScreenEffects {
  /** Orange edge vignette (hunger). */
  hungerVignette: number
  /** Image desaturation, 0..1 (thirst). */
  desaturation: number
  /** Blurred edges (critical thirst). */
  edgeBlur: number
  /** Red pulsing vignette (health), and its pulse period in seconds. */
  healthVignette: number
  heartbeatPeriod: number
}

/** `reduced` (accessibility setting) keeps the hints but drops the strongest effects. */
export function screenEffects(stats: SurvivalStats, reduced = false): ScreenEffects {
  const health = lowness(stats.health, 40)
  const scale = reduced ? 0.4 : 1
  return {
    hungerVignette: lowness(stats.hunger, LOW_GAUGE) * 0.55 * scale,
    desaturation: lowness(stats.thirst, LOW_GAUGE) * 0.5 * scale,
    edgeBlur: reduced ? 0 : lowness(stats.thirst, CRITICAL_GAUGE),
    healthVignette: health * 0.75 * scale,
    // 1.2 s at 40 health down to 0.45 s near 0
    heartbeatPeriod: 1.2 - health * 0.75,
  }
}

/** Walking speed multiplier: slower when starving or parched, faster with a coffee. */
export function walkSpeedFactor(stats: SurvivalStats, boosted: boolean): number {
  if (boosted) return SPEED_BOOST_FACTOR
  return stats.hunger < CRITICAL_GAUGE || stats.thirst < CRITICAL_GAUGE ? SLOW_WALK_FACTOR : 1
}

export function isLow(value: number): boolean {
  return value < LOW_GAUGE
}

/** The most urgent low gauge among `keys`, for the watch buzz; null when all are fine. */
export function mostUrgentGauge(stats: SurvivalStats, keys: readonly GaugeKey[] = ['health', 'thirst', 'hunger']): GaugeKey | null {
  const low = keys.filter((k) => isLow(stats[k]))
  if (low.length === 0) return null
  return low.reduce((a, b) => (stats[b] < stats[a] ? b : a))
}

/** Segments of the 4/4 bar under a food slot: `filled` of `total` portions left. */
export function portionSegments(portions: number | null | undefined, portionsLeft: number | null | undefined): { total: number; filled: number } | null {
  if (!portions || portions <= 1 || portionsLeft === null || portionsLeft === undefined) return null
  return { total: portions, filled: Math.max(0, Math.min(portions, portionsLeft)) }
}
