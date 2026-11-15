import type { TennisBall, TennisStatePayload, TennisTeam } from '../../types/gameRealtime'

export const TENNIS_GRAVITY = 9.81
export const TENNIS_RESTITUTION = 0.75
export const TENNIS_BOUNCE_KEEP = 0.8
export const TENNIS_REACH_M = 1.8
export const TENNIS_HALF_LENGTH = 11.885
export const TENNIS_CALL_MS = 1600
export const TENNIS_END_SHOWN_MS = 5000
export const TENNIS_MARK_MS = 4000
const TENNIS_MARK_FADE_MS = 1500
export const TENNIS_NET_Z = -271.5
export const TENNIS_COURTS = [
  { id: 'tennis_1', cx: -454.645 },
  { id: 'tennis_2', cx: -432.355 },
] as const
export const TENNIS_DOUBLES_HALF_WIDTH = 5.485
export const TENNIS_PLAY_HALF_X = TENNIS_DOUBLES_HALF_WIDTH + 1.5
export const TENNIS_PLAY_HALF_Z = 11.885 + 4.0
export const TENNIS_BALL_LOAN = 'tennis_ball'
export const TENNIS_RACKET = 'gear_tennis_racket'
export const BALL_BASKET_REACH = 2.5
export const BALL_BASKETS = [
  { court: 'tennis_1', position: [-444.7, 0, -266.0] as const },
  { court: 'tennis_2', position: [-442.3, 0, -266.0] as const },
]
const CUE_AHEAD_MS = 180
const CUE_SEARCH_MS = 1500
const CUE_STEP_MS = 20
export const TENNIS_AUTO_RUN_SHARE = 0.6
const CONTACT_AFTER_BOUNCE_MS = 350
const CHASE_AHEAD_MS = 150
const STAND_ASIDE_M = 0.6
const MAX_BEHIND_BASELINE_M = 3
const RECOVERY_BEHIND_BASELINE_M = 0.3
const DOUBLES_FROM_HALF_WIDTH_M = 5
const DOUBLES_SPREAD_M = 2.5
const ARRIVED_M = 0.05
const AIM_M_PER_PIXEL = 0.02
const AIM_NET_GAP_M = 1.5
const AIM_LINE_MARGIN_M = 0.5
const AIM_DEFAULT_DEPTH_M = 8.5

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

export function landingSpot(ball: TennisBall): Spot {
  const at = along(ball, groundTime(ball))
  return { x: at.x, z: at.z }
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

export interface BallPlay {
  phase: string
  ball: TennisBall | null
  hitter: TennisTeam | null
  netZ: number
}

export function ballComing(play: BallPlay, team: TennisTeam, me: { x: number; z: number }, serverMs: number): boolean {
  if (play.phase !== 'flight' || !play.ball || play.hitter === team) return false
  let closest = { t: serverMs, d: Infinity }
  for (let t = serverMs; t <= serverMs + CUE_SEARCH_MS; t += CUE_STEP_MS) {
    const p = ballPosition(play.ball, t)
    const d = (p.z - play.netZ) * sideSign(team) >= 0 ? Math.hypot(p.x - me.x, p.z - me.z) : Infinity
    if (d < closest.d) closest = { t, d }
  }
  return closest.d <= TENNIS_REACH_M && closest.t - serverMs <= CUE_AHEAD_MS
}

export interface CourtView {
  cx: number
  netZ: number
  halfWidth: number
}

export interface Spot {
  x: number
  z: number
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

export function defaultAim(court: CourtView, team: TennisTeam): Spot {
  return { x: court.cx, z: court.netZ - sideSign(team) * AIM_DEFAULT_DEPTH_M }
}

export function aimMoved(court: CourtView, team: TennisTeam, aim: Spot, movementX: number, movementY: number): Spot {
  const side = sideSign(team)
  const halfX = court.halfWidth - AIM_LINE_MARGIN_M
  const depth = clamp((court.netZ - (aim.z + movementY * AIM_M_PER_PIXEL * side)) * side, AIM_NET_GAP_M, TENNIS_HALF_LENGTH - AIM_LINE_MARGIN_M)
  return { x: clamp(aim.x + movementX * AIM_M_PER_PIXEL * side, court.cx - halfX, court.cx + halfX), z: court.netZ - depth * side }
}

export function interceptSpot(play: BallPlay & { bounces: number }, team: TennisTeam, serverMs: number): Spot | null {
  if (play.phase !== 'flight' || !play.ball || play.hitter === team) return null
  const bounceAt = play.bounces === 0 ? groundTime(play.ball) : play.ball.t
  const at = ballPosition(play.ball, Math.max(bounceAt + CONTACT_AFTER_BOUNCE_MS, serverMs + CHASE_AHEAD_MS))
  const side = sideSign(team)
  const depth = clamp((at.z - play.netZ) * side, 0, TENNIS_HALF_LENGTH + MAX_BEHIND_BASELINE_M)
  return { x: at.x - side * STAND_ASIDE_M, z: play.netZ + depth * side }
}

export function recoverySpot(court: CourtView, team: TennisTeam, me: Spot): Spot {
  const doubles = court.halfWidth > DOUBLES_FROM_HALF_WIDTH_M
  const x = doubles ? court.cx + (me.x >= court.cx ? DOUBLES_SPREAD_M : -DOUBLES_SPREAD_M) : court.cx
  return { x, z: court.netZ + sideSign(team) * (TENNIS_HALF_LENGTH + RECOVERY_BEHIND_BASELINE_M) }
}

export function runStep(me: Spot, spot: Spot, maxStep: number): { dx: number; dz: number } {
  const dx = spot.x - me.x
  const dz = spot.z - me.z
  const distance = Math.hypot(dx, dz)
  if (distance < ARRIVED_M) return { dx: 0, dz: 0 }
  const step = Math.min(distance, maxStep)
  return { dx: (dx / distance) * step, dz: (dz / distance) * step }
}

export function iServe(state: TennisStatePayload, sessionId: string | null): boolean {
  return sessionId !== null && state.server === sessionId && (state.phase === 'serve_wait' || state.phase === 'toss')
}

export function freeCourtAt(x: number, z: number): (typeof TENNIS_COURTS)[number] | null {
  return TENNIS_COURTS.find((c) => Math.abs(x - c.cx) <= TENNIS_PLAY_HALF_X && Math.abs(z - TENNIS_NET_Z) <= TENNIS_PLAY_HALF_Z) ?? null
}

export function sideAt(z: number): TennisTeam {
  return z > TENNIS_NET_Z ? 'red' : 'blue'
}


export type TennisSwing = 'serve' | 'forehand' | 'backhand' | 'lob'

export function swingFor(serving: boolean, lob: boolean, team: TennisTeam, me: { x: number }, ballX: number | null): TennisSwing {
  if (serving) return 'serve'
  if (lob) return 'lob'
  return ballX === null || (ballX - me.x) * sideSign(team) >= 0 ? 'forehand' : 'backhand'
}

export function markOpacity(ageMs: number): number {
  if (ageMs < 0 || ageMs >= TENNIS_MARK_MS) return 0
  return Math.min(1, (TENNIS_MARK_MS - ageMs) / TENNIS_MARK_FADE_MS)
}

export function markYaw(ball: { vx: number; vz: number }): number {
  return Math.atan2(ball.vx, ball.vz)
}
