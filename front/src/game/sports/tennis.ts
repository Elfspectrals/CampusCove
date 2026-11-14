import type { TennisBall, TennisStatePayload, TennisTeam } from '../../types/gameRealtime'

export const TENNIS_GRAVITY = 9.81
export const TENNIS_RESTITUTION = 0.75
export const TENNIS_BOUNCE_KEEP = 0.8
export const TENNIS_REACH_M = 1.6
export const TENNIS_HALF_LENGTH = 11.885
export const TENNIS_CALL_MS = 1600
export const TENNIS_END_SHOWN_MS = 5000
const CUE_AHEAD_MS = 250
const CUE_STEP_MS = 25
const LEVEL_RAY = -0.02

export interface Point3 {
  x: number
  y: number
  z: number
}

function along(ball: TennisBall, t: number): Point3 {
  const dt = (t - ball.t) / 1000
  return { x: ball.x + ball.vx * dt, y: ball.y + ball.vy * dt - (TENNIS_GRAVITY * dt * dt) / 2, z: ball.z + ball.vz * dt }
}

function groundTime(ball: TennisBall): number {
  return ball.t + ((ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * TENNIS_GRAVITY * Math.max(ball.y, 0))) / TENNIS_GRAVITY) * 1000
}

export function ballPosition(ball: TennisBall, t: number): Point3 {
  const landing = groundTime(ball)
  if (t <= landing) return along(ball, t)
  const at = along(ball, landing)
  const impactVy = ball.vy - (TENNIS_GRAVITY * (landing - ball.t)) / 1000
  const bounced = { x: at.x, y: 0, z: at.z, vx: ball.vx * TENNIS_BOUNCE_KEEP, vy: Math.abs(impactVy) * TENNIS_RESTITUTION, vz: ball.vz * TENNIS_BOUNCE_KEEP, t: landing }
  const p = along(bounced, t)
  return { ...p, y: Math.max(p.y, 0) }
}

export function myTeam(state: TennisStatePayload, sessionId: string | null): TennisTeam | null {
  return state.players.find((p) => p.sessionId === sessionId)?.team ?? null
}

function sideSign(team: TennisTeam): number {
  return team === 'red' ? 1 : -1
}

export function ballComing(state: TennisStatePayload, team: TennisTeam, me: { x: number; z: number }, serverMs: number): boolean {
  if (state.phase !== 'flight' || !state.ball || state.hitter === team) return false
  for (let t = serverMs; t <= serverMs + CUE_AHEAD_MS; t += CUE_STEP_MS) {
    const p = ballPosition(state.ball, t)
    if ((p.z - state.court.netZ) * sideSign(team) >= 0 && Math.hypot(p.x - me.x, p.z - me.z) <= TENNIS_REACH_M) return true
  }
  return false
}

export function aimOnCourt(state: TennisStatePayload, team: TennisTeam, eye: Point3, dir: Point3): { x: number; z: number } {
  const baselineZ = state.court.netZ - sideSign(team) * TENNIS_HALF_LENGTH
  if (dir.y < LEVEL_RAY) {
    const t = -eye.y / dir.y
    return { x: eye.x + dir.x * t, z: eye.z + dir.z * t }
  }
  const toBaseline = (baselineZ - eye.z) / dir.z
  if (!Number.isFinite(toBaseline) || toBaseline <= 0) return { x: state.court.cx, z: baselineZ }
  return { x: eye.x + dir.x * toBaseline, z: baselineZ }
}

export function iServe(state: TennisStatePayload, sessionId: string | null): boolean {
  return sessionId !== null && state.server === sessionId && (state.phase === 'serve_wait' || state.phase === 'toss')
}
