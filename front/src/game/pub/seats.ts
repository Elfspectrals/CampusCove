import { EYE_HEIGHT, SEAT_REACH } from '../gameRoomConstants.ts'
import type { PubSeat } from '../world/worldManifest.ts'

type Point = { x: number; y: number; z: number }

/** A seat top at most this far (m) above or below the feet is on the player's floor (not the cellar's). */
const SEAT_HEIGHT_REACH = 1.5

/** The seated eye sits this high above the seat top (socket: y = seat.y - 0.72 + 1.6). */
export const SEATED_EYE_ABOVE_SEAT = 0.88
/** Hips above the feet in the `Sit` clip (thighs horizontal, knees at 90°), and when standing. */
const SIT_HIP_HEIGHT = 0.45
const STAND_HIP_HEIGHT = 0.9

export function nearestFreeSeat(position: Point, seats: readonly PubSeat[], occupied: ReadonlySet<string>): PubSeat | null {
  let best: PubSeat | null = null
  let bestDistance = SEAT_REACH
  for (const seat of seats) {
    if (occupied.has(seat.id) || Math.abs(seat.position[1] - (position.y - EYE_HEIGHT)) > SEAT_HEIGHT_REACH) continue
    const distance = Math.hypot(seat.position[0] - position.x, seat.position[2] - position.z)
    if (distance <= bestDistance) {
      bestDistance = distance
      best = seat
    }
  }
  return best
}

/** Camera yaw once seated: the seat's own direction, wrapped to (-π, π]. */
export function seatCameraYaw(seat: Pick<PubSeat, 'yaw'>): number {
  const wrapped = Math.atan2(Math.sin(seat.yaw), Math.cos(seat.yaw))
  return Object.is(wrapped, -0) ? 0 : wrapped
}

export function seatedEye(seat: Pick<PubSeat, 'position'>): { x: number; y: number; z: number } {
  const [x, y, z] = seat.position
  return { x, y: y + SEATED_EYE_ABOVE_SEAT, z }
}

/**
 * Feet height of a seated avatar so its hips rest on the seat top: with the `Sit` clip the hips are
 * SIT_HIP_HEIGHT above the feet; a skin without the clip stays in Idle and is lowered another 0.45 m.
 */
export function seatedAvatarFeetY(seatY: number, hasSitClip: boolean): number {
  return seatY - (hasSitClip ? SIT_HIP_HEIGHT : STAND_HIP_HEIGHT)
}

export function isStool(seat: Pick<PubSeat, 'kind'>): boolean {
  return seat.kind === 'stool'
}
