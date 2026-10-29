export const PUNCH_REACH = 2
export const PUNCH_COOLDOWN_MS = 800
export const PUNCH_IMPACT_S = 5 / 30
export const PUNCH_DAMAGE = 8
const PUNCH_FACING_COS = 0.5
const PUNCH_HEIGHT_REACH = 1
const SHAKE_DECAY = 2.2
const SHAKE_MAX_PITCH = 0.035
const SHAKE_MAX_ROLL = 0.05
const SHAKE_PITCH_RATE = 24
const SHAKE_ROLL_RATE = 19
const JOLT_RISE_S = 0.03
const JOLT_DECAY = 14
const JOLT_S = 0.35
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

function joltWeight(t: number): number {
  if (t < 0 || t >= JOLT_S) return 0
  if (t < JOLT_RISE_S) return Math.sin((t / JOLT_RISE_S) * (Math.PI / 2))
  return Math.exp(-JOLT_DECAY * (t - JOLT_RISE_S))
}

export function createCameraShake() {
  let trauma = 0
  let time = 0
  let joltT = JOLT_S
  let joltPitch = 0
  let joltRoll = 0

  return {
    add(amount: number): void {
      trauma = Math.min(1, trauma + amount)
    },
    jolt(pitch: number, roll: number): void {
      joltPitch = pitch
      joltRoll = roll
      joltT = 0
    },
    update(dt: number): { pitch: number; roll: number } {
      joltT += dt
      const jolt = joltWeight(joltT)
      if (trauma <= 0) return { pitch: joltPitch * jolt, roll: joltRoll * jolt }
      trauma = Math.max(0, trauma - SHAKE_DECAY * dt)
      time += dt
      const strength = trauma * trauma
      return {
        pitch: SHAKE_MAX_PITCH * strength * Math.sin(time * SHAKE_PITCH_RATE) + joltPitch * jolt,
        roll: SHAKE_MAX_ROLL * strength * Math.sin(time * SHAKE_ROLL_RATE + 1) + joltRoll * jolt,
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
