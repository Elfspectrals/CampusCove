// Job rules without Colyseus, so they can be unit-tested (jobs.test.ts). The room glue is in jobs.ts; the API
// pays (backend JobService) and docs/JOBS.md explains the whole loop.
import type { JobShift, Player } from './types.ts'
import { type BuildingArea, type JobStation, insideBuilding } from './world.ts'

export const JOB_TICK_MS = 1000
/** Two ticks further apart than this mean the server stalled (laptop asleep, debugger, overload): not worked time. */
export const JOB_STALL_MS = 5000
/** Completed periods kept owed while payments fail; older ones are given up so an outage never pays hours at once. */
export const MAX_BACKLOG_PERIODS = 5
/** Payment attempts for a shift that is over (its last completed periods) before giving up. */
export const MAX_SETTLE_ATTEMPTS = 5
const RETRY_DELAYS_MS = [2000, 5000, 10_000, 20_000, 30_000]

/** Must match JOB_STATION_REACH in front/src/game/gameRoomConstants.ts (plus a little lag margin). */
export const STATION_REACH = 2.2
/** Feet vs the station's floor: anything more is another floor of the building. */
export const STATION_FLOOR_TOLERANCE = 1
/** A move further than this from the seat while working means the player left the station. */
export const STATION_LEAVE_TOLERANCE = 0.3
/** The seated eye sits this high above the seat top (same as the pub seats). */
export const SEATED_EYE_ABOVE_SEAT = 0.88
const EYE_HEIGHT = 1.6

export type StationRejection = 'not_in_building' | 'station_too_far' | 'wrong_floor'

/** Where `player` stands compared to `station`, or null when they can take it. */
export function stationRejection(player: Pick<Player, 'x' | 'y' | 'z'>, station: JobStation, area: BuildingArea): StationRejection | null {
  if (!insideBuilding(area, player.x, player.z)) return 'not_in_building'
  if (Math.hypot(player.x - station.seat.x, player.z - station.seat.z) > STATION_REACH) return 'station_too_far'
  const floorY = station.seat.y - station.seatHeight
  if (Math.abs(player.y - EYE_HEIGHT - floorY) > STATION_FLOOR_TOLERANCE) return 'wrong_floor'
  return null
}

/** Eye position of a worker sitting at `station`. */
export function seatedEye(station: JobStation): { x: number, y: number, z: number } {
  return { x: station.seat.x, y: station.seat.y + SEATED_EYE_ABOVE_SEAT, z: station.seat.z }
}

export function newShift(player: Pick<Player, 'sessionId' | 'accountId' | 'token'>, station: JobStation, now: number): JobShift {
  return {
    sessionId: player.sessionId,
    accountId: player.accountId,
    token: player.token ?? '',
    job: station.job,
    building: station.building,
    stationId: station.id,
    shiftId: null,
    salaryCoins: 0,
    periodMs: 60_000,
    survivalFactor: 1,
    startedAt: now,
    pausedMs: 0,
    lastTickAt: now,
    nextPeriod: 1,
    paying: false,
    failures: 0,
    retryAt: 0,
    earned: 0,
    forfeitedPeriods: 0,
    endedAt: null,
    endReason: null
  }
}

/** The rules the API answered for a new shift (POST /jobs/shifts), checked. */
export function applyShiftRules(shift: JobShift, data: { shift_id?: unknown, salary_coins?: unknown, period_seconds?: unknown, survival_drain_factor?: unknown } | null, now: number): boolean {
  const shiftId = Number(data?.shift_id)
  const salary = Number(data?.salary_coins)
  const periodSeconds = Number(data?.period_seconds)
  const factor = Number(data?.survival_drain_factor)
  if (!Number.isInteger(shiftId) || shiftId <= 0 || !Number.isFinite(salary) || !(periodSeconds > 0)) return false
  shift.shiftId = shiftId
  shift.salaryCoins = Math.max(0, Math.floor(salary))
  shift.periodMs = periodSeconds * 1000
  shift.survivalFactor = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 1
  shift.startedAt = now
  shift.lastTickAt = now
  return true
}

/** One tick of a running shift: a gap much longer than a tick is a server stall and does not count as work. */
export function noteTick(shift: JobShift, now: number, tickMs = JOB_TICK_MS): void {
  if (shift.endedAt !== null) return
  const gap = now - shift.lastTickAt
  if (gap > JOB_STALL_MS) shift.pausedMs += gap - tickMs
  shift.lastTickAt = now
}

/** Time worked so far (until the end of the shift once it is over), stalls excluded. */
export function workedMs(shift: JobShift, now: number): number {
  const until = shift.endedAt ?? now
  return Math.max(0, until - shift.startedAt - shift.pausedMs)
}

/** How many full periods the shift has worked. */
export function completedPeriods(shift: JobShift, now: number): number {
  return Math.floor(workedMs(shift, now) / shift.periodMs)
}

/** Time left before the next period completes. */
export function nextPaymentInMs(shift: JobShift, now: number): number {
  return shift.periodMs - (workedMs(shift, now) % shift.periodMs)
}

/** Whether a completed period is still waiting to be paid. */
export function hasOwedPeriod(shift: JobShift, now: number): boolean {
  return completedPeriods(shift, now) >= shift.nextPeriod
}

/**
 * The period to ask the API for now, or null (nothing owed, a payment in flight, waiting to retry). Periods older
 * than MAX_BACKLOG_PERIODS behind the last completed one are given up first (counted in forfeitedPeriods).
 */
export function periodToPay(shift: JobShift, now: number): number | null {
  if (shift.shiftId === null || shift.paying || now < shift.retryAt) return null
  const completed = completedPeriods(shift, now)
  if (completed < shift.nextPeriod) return null
  const oldestKept = completed - MAX_BACKLOG_PERIODS + 1
  if (shift.nextPeriod < oldestKept) {
    shift.forfeitedPeriods += oldestKept - shift.nextPeriod
    shift.nextPeriod = oldestKept
  }
  return shift.nextPeriod
}

export function retryDelayMs(failures: number): number {
  return RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1] ?? RETRY_DELAYS_MS[0]
}

/** The station a player visibly works at (the shift is open on the API side), else null. */
export function workingStationId(player: Pick<Player, 'job'>): string | null {
  return player.job && player.job.shiftId !== null ? player.job.stationId : null
}

/** Hunger / thirst speed for `player`: the job's factor while a confirmed shift runs, else normal. */
export function survivalDrainFactor(player: Pick<Player, 'job'>): number {
  const job = player.job
  return job && job.shiftId !== null && job.endedAt === null ? job.survivalFactor : 1
}

/** API answers after which the shift can never be paid again (shift closed, account banned / token revoked). */
export function isTerminalPaymentError(error: unknown): boolean {
  const { code, status } = (error ?? {}) as { code?: unknown, status?: unknown }
  return status === 401 || status === 403 || code === 'shift_ended' || code === 'shift_not_found'
}
