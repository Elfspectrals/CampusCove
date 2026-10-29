export const PUNCH_REACH = 2
export const PUNCH_COOLDOWN_MS = 800
export const PUNCH_IMPACT_S = 5 / 30
const PUNCH_FACING_COS = 0.5
const PUNCH_HEIGHT_REACH = 1
const SHAKE_DECAY = 2.2
const SHAKE_MAX_PITCH = 0.035
const SHAKE_MAX_ROLL = 0.05
const KNOCKBACK_DECAY = 9

export interface PunchCandidate {
  sessionId: string
  x: number
  feetY: number
  z: number
}

export function pickPunchTarget(
  feet: { x: number; y: number; z: number },
  forward: { x: number; z: number },
  candidates: PunchCandidate[],
): string | null {
  const length = Math.hypot(forward.x, forward.z)
  if (length === 0) return null
  let best: string | null = null
  let bestFacing = PUNCH_FACING_COS
  for (const c of candidates) {
    const dx = c.x - feet.x
    const dz = c.z - feet.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0 || dist > PUNCH_REACH || Math.abs(c.feetY - feet.y) > PUNCH_HEIGHT_REACH) continue
    const facing = (dx * forward.x + dz * forward.z) / (dist * length)
    if (facing >= bestFacing) {
      best = c.sessionId
      bestFacing = facing
    }
  }
  return best
}

export function createCameraShake() {
  let trauma = 0
  let time = 0

  return {
    add(amount: number): void {
      trauma = Math.min(1, trauma + amount)
    },
    update(dt: number): { pitch: number; roll: number } {
      if (trauma <= 0) return { pitch: 0, roll: 0 }
      trauma = Math.max(0, trauma - SHAKE_DECAY * dt)
      time += dt
      const strength = trauma * trauma
      return {
        pitch: SHAKE_MAX_PITCH * strength * Math.sin(time * 37),
        roll: SHAKE_MAX_ROLL * strength * Math.sin(time * 29 + 1),
      }
    },
  }
}

export function createKnockback() {
  let vx = 0
  let vz = 0

  return {
    push(dirX: number, dirZ: number, distance: number): void {
      const length = Math.hypot(dirX, dirZ)
      if (length === 0) return
      vx = (dirX / length) * distance * KNOCKBACK_DECAY
      vz = (dirZ / length) * distance * KNOCKBACK_DECAY
    },
    step(dt: number): { dx: number; dz: number } {
      const keep = Math.exp(-KNOCKBACK_DECAY * dt)
      const travelled = (1 - keep) / KNOCKBACK_DECAY
      const move = { dx: vx * travelled, dz: vz * travelled }
      vx *= keep
      vz *= keep
      return move
    },
  }
}
