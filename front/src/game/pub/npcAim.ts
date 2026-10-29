import { EYE_HEIGHT } from '../gameRoomConstants.ts'

type Point = { x: number; y: number; z: number }
type Vec3 = [number, number, number]

const NPC_HEIGHT_REACH = 1.5
const NPC_CHEST_HEIGHT = 1.2
const NPC_AIM_ANGLE = 0.6

/** The crosshair is on a standing NPC (feet at `npc`) within `reach` metres (XZ); the server re-checks the reach. */
export function isAimingAtNpc(eye: Point, forward: Point, npc: Vec3, reach: number): boolean {
  const [nx, ny, nz] = npc
  const dx = nx - eye.x
  const dz = nz - eye.z
  if (Math.hypot(dx, dz) > reach || Math.abs(eye.y - EYE_HEIGHT - ny) > NPC_HEIGHT_REACH) return false
  const dy = ny + NPC_CHEST_HEIGHT - eye.y
  const toNpc = Math.hypot(dx, dy, dz)
  const facing = Math.hypot(forward.x, forward.y, forward.z)
  const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (toNpc * facing)
  return Math.acos(Math.min(1, Math.max(-1, cos))) <= NPC_AIM_ANGLE
}
