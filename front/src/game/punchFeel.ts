import { PUNCH_IMPACT_S } from './punch.ts'

export const HIT_STOP_S = 0.07
export const VICTIM_HIT_STOP_S = 0.05
const KICK_PITCH = -0.02
const KICK_FOV = -3
const KICK_RETURN_S = 0.2
const JOLT_PITCH = 0.05
const JOLT_ROLL = 0.06
const BACK_OVERSHOOT = 2.2

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

export function easeOutBack(t: number): number {
  const u = Math.min(1, Math.max(0, t)) - 1
  return 1 + (BACK_OVERSHOOT + 1) * u * u * u + BACK_OVERSHOOT * u * u
}

function kickWeight(t: number): number {
  if (t < 0 || t >= PUNCH_IMPACT_S + KICK_RETURN_S) return 0
  if (t < PUNCH_IMPACT_S) return smooth(t / PUNCH_IMPACT_S)
  return smooth(1 - (t - PUNCH_IMPACT_S) / KICK_RETURN_S)
}

export function punchKick(t: number): { pitch: number; fov: number } {
  const weight = kickWeight(t)
  return { pitch: KICK_PITCH * weight, fov: KICK_FOV * weight }
}

export function cameraJolt(dirX: number, dirZ: number, yaw: number, strength: number): { pitch: number; roll: number } {
  const length = Math.hypot(dirX, dirZ)
  if (length === 0) return { pitch: 0, roll: 0 }
  const forward = (-Math.sin(yaw) * dirX - Math.cos(yaw) * dirZ) / length
  const right = (Math.cos(yaw) * dirX - Math.sin(yaw) * dirZ) / length
  return { pitch: -forward * JOLT_PITCH * strength, roll: -right * JOLT_ROLL * strength }
}

export interface HitStop {
  delay: number
  hold: number
}

export function idleHitStop(): HitStop {
  return { delay: 0, hold: 0 }
}

export function scheduleHitStop(stop: HitStop, delay: number, hold: number): void {
  stop.delay = delay
  stop.hold = hold
}

export function advanceHitStop(stop: HitStop, dt: number): number {
  const beforeStop = Math.min(stop.delay, dt)
  stop.delay -= beforeStop
  const held = Math.min(stop.hold, dt - beforeStop)
  stop.hold -= held
  return dt - held
}

export function untilImpactS(sincePunchS: number): number {
  return Math.max(0, PUNCH_IMPACT_S - sincePunchS)
}

export function remoteHitTiming(byMe: boolean, sinceMyPunchS: number): { delay: number; hitStop: number } {
  if (!byMe) return { delay: PUNCH_IMPACT_S, hitStop: 0 }
  return { delay: untilImpactS(sinceMyPunchS), hitStop: HIT_STOP_S }
}

export function confirmsFromServer(predictedHit: boolean | null, serverHit: boolean): boolean {
  return serverHit && predictedHit !== true
}
