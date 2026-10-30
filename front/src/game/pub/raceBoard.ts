import { RACE_SPILL_PENALTY_MS } from '../gameRoomConstants.ts'
import { standsOnFloor } from './npcAim.ts'

/** Drink Fast: what the race screen, the spectators' board and the solo best time show (no Vue, no Three). */

export const BEST_TIME_KEY = 'cc.drinkFast.best'
/** Players this close (m, XZ) to the bar counter, on the bar floor and not racing, see the scoreboard. */
const SPECTATOR_RANGE = 10
/** The final order stays on the spectators' board this long after the end. */
export const RESULT_LINGER_MS = 6000

type Point = { x: number; y: number; z: number }

/** '8.4 s' (one decimal). */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)} s`
}

/** '+4 s' for two spills, '' without any. */
export function spillPenaltyLabel(spills: number): string {
  if (spills <= 0) return ''
  const seconds = (spills * RACE_SPILL_PENALTY_MS) / 1000
  return `+${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} s`
}

export function ordinal(place: number): string {
  return place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`
}

export interface RaceResultRow {
  sessionId: string
  place: number
  ms: number
  spills: number
  time: string
  penalty: string
  me: boolean
}

/** The server ranking (already sorted, `ms` with the spill penalty) as rows for the end screens. */
export function raceResults(ranking: ReadonlyArray<{ sessionId: string; ms: number; spills: number }>, me: string): RaceResultRow[] {
  return ranking.map((entry, index) => ({
    sessionId: entry.sessionId,
    place: index + 1,
    ms: entry.ms,
    spills: entry.spills,
    time: formatSeconds(entry.ms),
    penalty: spillPenaltyLabel(entry.spills),
    me: entry.sessionId === me,
  }))
}

/** Session ids whose spill count went up between two `pub_race_state`s (a racer seen for the first time counts too). */
export function spillIncreases(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>): string[] {
  return Object.keys(after).filter((sessionId) => (after[sessionId] ?? 0) > (before[sessionId] ?? 0))
}

type BestStorage = Pick<Storage, 'getItem' | 'setItem'>

function storage(): BestStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The solo personal best (ms) kept in this browser, or null (none yet, or storage blocked). */
export function readBestTime(store: BestStorage | null = storage()): number | null {
  try {
    const value = Number(store?.getItem(BEST_TIME_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** Keeps `ms` when it beats the stored best; `isNew` is true for a first time or a better one. */
export function recordBestTime(ms: number, store: BestStorage | null = storage()): { best: number; isNew: boolean } {
  const previous = readBestTime(store)
  if (previous !== null && previous <= ms) return { best: previous, isNew: false }
  try {
    store?.setItem(BEST_TIME_KEY, String(Math.round(ms)))
  } catch {
    // private mode / blocked storage: the best lasts for this screen only
  }
  return { best: ms, isNew: true }
}

/** A player not in the race, standing (or sitting) on the bar floor within SPECTATOR_RANGE of the counter. */
export function canSpectate(eye: Point, counter: readonly [number, number, number], racing: boolean): boolean {
  if (racing || !standsOnFloor(eye.y, counter[1])) return false
  return Math.hypot(counter[0] - eye.x, counter[2] - eye.z) <= SPECTATOR_RANGE
}

export interface PintPose {
  /** 0 = glass at rest on the lap / bar, 1 = raised to the mouth. */
  lift: number
  /** Glass tilt towards the face (radians). */
  tilt: number
}

const PINT_RAISE_S = 0.5
const PINT_SIP_PERIOD_S = 1.6
const PINT_TILT_MIN = 0.55
const PINT_TILT_MAX = 1.35

/**
 * Pose of a racer's pint in the 3D pub, `elapsedS` after the race started: it is raised in half a second, then
 * tilts back and forth in sips; the emptier the glass (`progress`), the further it is tipped.
 */
export function racePintPose(elapsedS: number, progress: number): PintPose {
  const lift = Math.min(1, Math.max(0, elapsedS / PINT_RAISE_S))
  const sip = 0.5 - 0.5 * Math.cos((Math.max(0, elapsedS) / PINT_SIP_PERIOD_S) * Math.PI * 2)
  const base = PINT_TILT_MIN + (PINT_TILT_MAX - PINT_TILT_MIN) * Math.min(1, Math.max(0, progress))
  return { lift, tilt: lift * (base + 0.2 * sip) }
}
