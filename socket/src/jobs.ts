// Paid jobs: taking a station, the salary of every full period, leaving (docs/JOBS.md). This server owns who works
// where and the clock; the API opens / ends the shifts and pays each period once (callRealtimeBackend).
import { callRealtimeBackend, errorPayload } from './backend.ts'
import {
  applyShiftRules,
  hasOwedPeriod,
  isTerminalPaymentError,
  MAX_SETTLE_ATTEMPTS,
  newShift,
  nextPaymentInMs,
  noteTick,
  periodToPay,
  retryDelayMs,
  seatedEye,
  STATION_LEAVE_TOLERANCE,
  stationRejection,
  workedMs
} from './jobRules.ts'
import type { ClientPayload, GameClient, GameRoom, JobShift, Player } from './types.ts'
import { buildingArea, jobStation } from './world.ts'

const STATION_ID = /^[a-z0-9_]{1,64}$/

/** Why a shift ended, as sent to the client (job_ended) and stored by the API (job_shifts.end_reason). */
export type JobEndReason =
  | 'stopped'
  | 'left_station'
  | 'disconnected'
  | 'replaced'
  | 'knocked_out'
  | 'teleported'
  | 'shift_closed'
  | 'account_inactive'

const START_REJECTIONS: Record<string, string> = {
  not_in_building: 'Go inside the building to work there.',
  station_too_far: 'Get closer to the desk.',
  wrong_floor: 'This desk is on another floor.'
}

function warn(context: string, error: unknown): void {
  console.warn(`[jobs] ${context}:`, error instanceof Error ? error.message : error)
}

function sendJobError(client: GameClient, message: string, code: string, extra: Record<string, unknown> = {}): void {
  client.send('job_error', { message, code, ...extra })
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

/** The player's own client, while this player is still the one connected for that session. */
function liveClient(room: GameRoom, shift: JobShift): GameClient | undefined {
  const player = room.players.get(shift.sessionId)
  return player?.job === shift ? clientOf(room, shift.sessionId) : undefined
}

/** Sent to the whole room, like user_seated: clients pin a working avatar to its chair until this says otherwise. */
function broadcastWorking(room: GameRoom, sessionId: string, stationId: string | null): void {
  const payload = { sessionId, stationId }
  room.forEachClient((c) => c.send('user_working', payload))
}

/** Something else the player is doing that a shift cannot run alongside, or null. */
function busyWith(room: GameRoom, player: Player, now: number): string | null {
  if (now < player.knockedOutUntil || player.clinicBedId) return 'You need to recover first.'
  if (player.seatId) return 'Stand up first.'
  const inPubGame = player.pubShots !== null ||
    room.pub.race?.racers.has(player.sessionId) === true ||
    room.pub.darts?.players.some((p) => p.sessionId === player.sessionId) === true
  return inPubGame ? 'Finish your game first.' : null
}

/** 'job_start' { stationId }: sit at a free station of a job and start a shift. */
export async function onJobStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || !player.stats) return
  const stationId = typeof payload?.stationId === 'string' && STATION_ID.test(payload.stationId) ? payload.stationId : null
  const station = stationId ? jobStation(stationId) : null
  const area = station ? buildingArea(station.building) : null
  if (!station || !area) {
    sendJobError(client, 'There is no such desk.', 'station_unknown')
    return
  }
  if (player.job) {
    sendJobError(client, 'You are already working.', 'already_working')
    return
  }
  const busy = busyWith(room, player, now)
  if (busy) {
    sendJobError(client, busy, 'busy')
    return
  }
  const rejection = stationRejection(player, station, area)
  if (rejection) {
    sendJobError(client, START_REJECTIONS[rejection], rejection)
    return
  }
  const occupantId = room.jobStations.get(station.id)
  if (occupantId && occupantId !== player.sessionId) {
    sendJobError(client, 'Someone already works at this desk.', 'station_taken', { occupant: room.players.get(occupantId)?.pseudo ?? null })
    return
  }

  // Reserved before the first await: a second job_start for this desk, even in the same tick, sees it taken.
  const shift = newShift(player, station, now)
  player.job = shift
  room.jobStations.set(station.id, player.sessionId)
  room.jobShifts.add(shift)

  let data: { shift_id?: unknown } | null = null
  try {
    data = await callRealtimeBackend(player.token, '/jobs/shifts', 'POST', { job: station.job, building: station.building, station: station.id })
  } catch (error) {
    warn('start failed', error)
    room.jobShifts.delete(shift)
    if (player.job === shift) {
      player.job = null
      releaseStation(room, shift)
      client.send('job_error', errorPayload(error, 'You could not start working.', 'job_start_failed'))
    }
    return
  }

  const confirmedAt = Date.now()
  const valid = applyShiftRules(shift, data, confirmedAt)
  if (player.job !== shift || room.players.get(player.sessionId) !== player || !valid) {
    // the player left, was moved or knocked out while the API answered: close that shift at once
    room.jobShifts.delete(shift)
    if (valid) endShiftOnApi(shift, (shift.endReason as JobEndReason | null) ?? 'left_station')
    if (player.job === shift) {
      player.job = null
      releaseStation(room, shift)
      sendJobError(client, 'You could not start working.', 'job_start_failed')
    }
    return
  }

  const eye = seatedEye(station)
  Object.assign(player, { ...eye, ry: station.yaw, fallPeakY: eye.y, lastMoveAt: confirmedAt })
  room.broadcastMove(client, player)
  broadcastWorking(room, player.sessionId, station.id)
  client.send('job_started', {
    stationId: station.id,
    job: shift.job,
    salaryCoins: shift.salaryCoins,
    periodMs: shift.periodMs,
    workedMs: 0,
    x: eye.x,
    y: eye.y,
    z: eye.z,
    yaw: station.yaw
  })
}

/** 'job_stop': the player leaves the station on purpose. */
export function onJobStop(room: GameRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  if (player) endJob(room, player, 'stopped')
}

function releaseStation(room: GameRoom, shift: JobShift): void {
  if (room.jobStations.get(shift.stationId) === shift.sessionId) room.jobStations.delete(shift.stationId)
}

function endShiftOnApi(shift: JobShift, reason: JobEndReason): void {
  if (shift.shiftId === null) return
  callRealtimeBackend(shift.token, `/jobs/shifts/${shift.shiftId}/end`, 'POST', { reason })
    .catch((error) => warn(`end of shift ${shift.shiftId} failed`, error))
}

/**
 * Ends the player's shift, if any (idempotent): frees the station at once, tells everyone, and closes the shift
 * on the API. Periods completed before now are still paid (settled by tickJobs, first try right away); the one
 * in progress is not.
 */
export function endJob(room: GameRoom, player: Player, reason: JobEndReason, now = Date.now()): void {
  const shift = player.job
  if (!shift) return
  player.job = null
  releaseStation(room, shift)
  shift.endedAt = now
  shift.endReason = reason
  const client = clientOf(room, player.sessionId)
  client?.send('job_ended', { reason, stationId: shift.stationId, earned: shift.earned })
  if (shift.shiftId === null) {
    // still opening on the API: onJobStart closes it when the answer comes
    return
  }
  broadcastWorking(room, player.sessionId, null)
  endShiftOnApi(shift, reason)
  if (hasOwedPeriod(shift, now)) payNextPeriod(room, shift, now)
  else room.jobShifts.delete(shift)
}

/** A move while working: a step away from the chair ends the shift; a move that stays on the chair is ignored. */
export function onWorkerMove(room: GameRoom, player: Player, x: number, z: number): 'left' | 'stays' {
  const station = player.job ? jobStation(player.job.stationId) : null
  if (station && Math.hypot(x - station.seat.x, z - station.seat.z) <= STATION_LEAVE_TOLERANCE) return 'stays'
  endJob(room, player, 'left_station')
  return 'left'
}

/** Every JOB_TICK_MS: counts worked time and pays every completed period, for each shift of the room. */
export function tickJobs(room: GameRoom, now = Date.now()): void {
  for (const shift of room.jobShifts) {
    if (shift.shiftId === null) continue
    noteTick(shift, now)
    if (shift.endedAt !== null && (!hasOwedPeriod(shift, now) || shift.failures >= MAX_SETTLE_ATTEMPTS)) {
      if (!shift.paying) settleDone(room, shift)
      continue
    }
    payNextPeriod(room, shift, now)
  }
}

function settleDone(room: GameRoom, shift: JobShift): void {
  room.jobShifts.delete(shift)
  if (hasOwedPeriod(shift, shift.endedAt ?? Date.now())) {
    warn(`shift ${shift.shiftId}`, `gave up its last period after ${shift.failures} failed payments`)
  }
}

function payNextPeriod(room: GameRoom, shift: JobShift, now: number): void {
  const period = periodToPay(shift, now)
  if (period === null || shift.shiftId === null) return
  shift.paying = true
  // `now` (the tick that asked) dates the answer too: retries are counted from the attempt
  callRealtimeBackend(shift.token, `/jobs/shifts/${shift.shiftId}/salary`, 'POST', { period })
    .then((data) => onPaid(room, shift, period, data, now))
    .catch((error) => onPaymentFailed(room, shift, period, error, now))
}

function onPaid(room: GameRoom, shift: JobShift, period: number, data: { coins?: unknown, balance_after?: unknown } | null, now: number): void {
  shift.paying = false
  shift.failures = 0
  shift.retryAt = 0
  if (shift.nextPeriod === period) shift.nextPeriod = period + 1
  const coins = Math.max(0, Number(data?.coins) || 0)
  shift.earned += coins
  liveClient(room, shift)?.send('job_paid', {
    period,
    coins,
    earned: shift.earned,
    balanceAfter: typeof data?.balance_after === 'number' ? data.balance_after : null,
    workedMs: workedMs(shift, now),
    nextPaymentInMs: nextPaymentInMs(shift, now)
  })
  if (shift.endedAt !== null && !hasOwedPeriod(shift, now)) room.jobShifts.delete(shift)
}

function onPaymentFailed(room: GameRoom, shift: JobShift, period: number, error: unknown, now: number): void {
  shift.paying = false
  shift.failures += 1
  warn(`salary of shift ${shift.shiftId} period ${period} failed (attempt ${shift.failures})`, error)
  if (isTerminalPaymentError(error)) {
    // never asked again, not even by the settlement endJob starts below
    shift.retryAt = Number.POSITIVE_INFINITY
    room.jobShifts.delete(shift)
    const player = room.players.get(shift.sessionId)
    if (player?.job === shift) {
      const { status } = (error ?? {}) as { status?: unknown }
      endJob(room, player, status === 401 || status === 403 ? 'account_inactive' : 'shift_closed')
    }
    return
  }
  const delay = retryDelayMs(shift.failures)
  shift.retryAt = now + delay
  liveClient(room, shift)?.send('job_payment_delayed', { period, retryInMs: delay })
}
