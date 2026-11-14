// What an admin power changes in the player's own movement. The socket allows the same (socket/src/adminPowers.ts):
// speed x2 widens its speed check, fly skips it along with walls and locked doors, freeze refuses every move.

export const SPEED_POWER_FACTOR = 2
/** Fly speed (m/s), and with Shift held. */
export const FLY_SPEED = 12
export const FLY_FAST_SPEED = 30

export interface FlyKeys {
  forward: -1 | 0 | 1
  right: -1 | 0 | 1
  up: -1 | 0 | 1
}

/** One frame of flight: forward follows the look (pitch included), Space goes up and Ctrl down. */
export function flyStep(yaw: number, pitch: number, keys: FlyKeys, fast: boolean, dt: number): { dx: number; dy: number; dz: number } {
  const step = (fast ? FLY_FAST_SPEED : FLY_SPEED) * dt
  const cosPitch = Math.cos(pitch)
  // camera forward is (-sin yaw, sin pitch, -cos yaw); right is (cos yaw, 0, -sin yaw)
  const dx = (-Math.sin(yaw) * cosPitch * keys.forward + Math.cos(yaw) * keys.right) * step
  const dz = (-Math.cos(yaw) * cosPitch * keys.forward - Math.sin(yaw) * keys.right) * step
  const dy = (Math.sin(pitch) * keys.forward + keys.up) * step
  return { dx, dy, dz }
}
