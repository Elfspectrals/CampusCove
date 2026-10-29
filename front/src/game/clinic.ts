import { EYE_HEIGHT } from './gameRoomConstants.ts'

type Point = { x: number; y: number; z: number }
type Vec3 = [number, number, number]

const NURSE_REACH = 2.5
const NURSE_HEIGHT_REACH = 1.5
const NURSE_CHEST_HEIGHT = 1.2
const NURSE_AIM_ANGLE = 0.45

export function isAimingAtNurse(eye: Point, forward: Point, nurse: Vec3): boolean {
  const [nx, ny, nz] = nurse
  const dx = nx - eye.x
  const dz = nz - eye.z
  if (Math.hypot(dx, dz) > NURSE_REACH || Math.abs(eye.y - EYE_HEIGHT - ny) > NURSE_HEIGHT_REACH) return false
  const dy = ny + NURSE_CHEST_HEIGHT - eye.y
  const toNurse = Math.hypot(dx, dy, dz)
  const facing = Math.hypot(forward.x, forward.y, forward.z)
  const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (toNurse * facing)
  return Math.acos(Math.min(1, Math.max(-1, cos))) <= NURSE_AIM_ANGLE
}

export function lookAngles(from: Point, to: Vec3): { yaw: number; pitch: number } {
  const dx = to[0] - from.x
  const dy = to[1] - from.y
  const dz = to[2] - from.z
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

export function recoveryProgress(startedAt: number, durationMs: number, now: number): number {
  return Math.min(1, Math.max(0, (now - startedAt) / durationMs))
}
