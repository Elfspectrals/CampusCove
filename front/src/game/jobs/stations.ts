import { EYE_HEIGHT, JOB_STATION_REACH } from '../gameRoomConstants.ts'
import type { JobStation } from '../world/worldManifest.ts'

type Point = { x: number; y: number; z: number }

/** A desk on the player's floor: its floor at most this far (m) from the feet. */
const STATION_FLOOR_REACH = 1
/** The camera must point at the desk (cosine between the view and the screen direction, XZ). */
const AIM_MIN_COS = 0.6
/** The seated eye sits this high above the seat top (socket/src/jobRules.ts SEATED_EYE_ABOVE_SEAT, same as the pub). */
const SEATED_EYE_ABOVE_SEAT = 0.88

/** The free or taken desk the player aims at, in reach on their floor (nearest view direction wins), or null. */
export function aimedStation(eye: Point, yaw: number, stations: readonly JobStation[]): JobStation | null {
  const forwardX = -Math.sin(yaw)
  const forwardZ = -Math.cos(yaw)
  let best: JobStation | null = null
  let bestCos = AIM_MIN_COS
  for (const station of stations) {
    const [sx, sy, sz] = station.seat
    if (Math.abs(sy - station.seatHeight - (eye.y - EYE_HEIGHT)) > STATION_FLOOR_REACH) continue
    if (Math.hypot(sx - eye.x, sz - eye.z) > JOB_STATION_REACH) continue
    const dx = station.lookAt[0] - eye.x
    const dz = station.lookAt[2] - eye.z
    const length = Math.hypot(dx, dz)
    const cos = length < 1e-3 ? 1 : (dx * forwardX + dz * forwardZ) / length
    if (cos >= bestCos) {
      bestCos = cos
      best = station
    }
  }
  return best
}

/** Eye position of a worker at `station` (the socket puts the player there too). */
export function workingEye(station: Pick<JobStation, 'seat'>): Point {
  const [x, y, z] = station.seat
  return { x, y: y + SEATED_EYE_ABOVE_SEAT, z }
}

/** Camera look of a worker: facing the desk, eyes on the screen. */
export function workingLook(station: Pick<JobStation, 'seat' | 'yaw' | 'lookAt'>): { yaw: number; pitch: number } {
  const eye = workingEye(station)
  const [lx, ly, lz] = station.lookAt
  const yaw = Math.atan2(Math.sin(station.yaw), Math.cos(station.yaw))
  return { yaw: Object.is(yaw, -0) ? 0 : yaw, pitch: Math.atan2(ly - eye.y, Math.hypot(lx - eye.x, lz - eye.z)) }
}

/** Seat pose for an avatar working at `station` (useRemoteAvatars sits it on the chair, Sit clip or lowered). */
export function stationPose(station: Pick<JobStation, 'seat' | 'yaw'>): { x: number; y: number; z: number; yaw: number } {
  const [x, y, z] = station.seat
  return { x, y, z, yaw: station.yaw }
}

/** The server's clock of the shift at its last message, to show the time between two messages (display only). */
export interface ShiftClock {
  periodMs: number
  workedMs: number
  /** performance.now() when workedMs was received. */
  syncedAt: number
}

/** Time worked and time to the next pay, as shown by the panel; the coins only change on the server's job_paid. */
export function shiftDisplay(clock: ShiftClock, now: number): { workedMs: number; nextPaymentInMs: number } {
  const workedMs = clock.workedMs + Math.max(0, now - clock.syncedAt)
  return { workedMs, nextPaymentInMs: clock.periodMs - (workedMs % clock.periodMs) }
}

/** Coins per minute for a salary paid every `periodMs`. */
export function salaryPerMinute(salaryCoins: number, periodMs: number): number {
  return Math.round((salaryCoins * 60_000) / periodMs)
}

/** "4:07", or "1:02:09" past an hour. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`
}
