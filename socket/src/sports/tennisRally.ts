import type { Team } from './signup.ts'
import {
  AIM_NET_GAP,
  AIM_OUT_MARGIN,
  BALL_RADIUS,
  BOUNCE_KEEP,
  COURT_HALF_LENGTH,
  DRIVE_SPEED,
  GRAVITY,
  HIT_ALLOWANCE_MS,
  HIT_MAX_HEIGHT,
  HIT_SAMPLE_MS,
  LOB_SPEED,
  MIN_CONTACT_Y,
  MISS_M,
  NET_HALF_SPAN,
  NET_HEIGHT,
  OWN_HALF_TOLERANCE,
  POINT_PAUSE_MS,
  REACH_M,
  RESTITUTION,
  SERVE_SPEED,
  SERVE_WAIT_MS,
  SERVE_WINDOW_MS,
  SWEET_M,
  TOSS_FALL_MS,
  TOSS_SPEED,
  TOSS_START_Y
} from './tennisConstants.ts'
import { other } from './tennisScore.ts'

export interface Court {
  cx: number
  netZ: number
  halfWidth: number
}

export interface Ball {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  t: number
}

export type Call = 'out' | 'net' | 'double_bounce' | 'missed_toss'

export type Rally =
  | { phase: 'serve_wait', server: string, team: Team, since: number }
  | { phase: 'toss', server: string, team: Team, ball: Ball }
  | { phase: 'flight', ball: Ball, hitter: Team, bounces: 0 | 1, netAt: number | null }
  | { phase: 'point', winner: Team, call: Call, ball: Ball | null, until: number }

export interface Hitter {
  sessionId: string
  team: Team
  x: number
  z: number
}

export interface Aim {
  x: number
  z: number
}

type Where = (sessionId: string) => { x: number, z: number } | null

export function sideSign(team: Team): number {
  return team === 'red' ? 1 : -1
}

export function ballAt(ball: Ball, t: number): { x: number, y: number, z: number } {
  const dt = (t - ball.t) / 1000
  return { x: ball.x + ball.vx * dt, y: ball.y + ball.vy * dt - (GRAVITY * dt * dt) / 2, z: ball.z + ball.vz * dt }
}

export function groundTime(ball: Ball): number {
  const dt = (ball.vy + Math.sqrt(ball.vy * ball.vy + 2 * GRAVITY * Math.max(ball.y, 0))) / GRAVITY
  return ball.t + dt * 1000
}

function onHalf(court: Court, team: Team, z: number, tolerance: number): boolean {
  return (z - court.netZ) * sideSign(team) >= -tolerance
}

export function landsIn(court: Court, receiver: Team, x: number, z: number): boolean {
  const depth = (z - court.netZ) * sideSign(receiver)
  return Math.abs(x - court.cx) <= court.halfWidth + BALL_RADIUS && depth >= 0 && depth <= COURT_HALF_LENGTH + BALL_RADIUS
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

function lerp([lo, hi]: readonly [number, number], q: number): number {
  return lo + (hi - lo) * q
}

export function aimSpot(court: Court, receiver: Team, aim: Aim): Aim {
  const sign = sideSign(receiver)
  const depth = clamp((aim.z - court.netZ) * sign, AIM_NET_GAP, COURT_HALF_LENGTH + AIM_OUT_MARGIN)
  const halfX = court.halfWidth + AIM_OUT_MARGIN
  return { x: clamp(aim.x, court.cx - halfX, court.cx + halfX), z: court.netZ + depth * sign }
}

export function netTime(court: Court, ball: Ball): number | null {
  if (ball.vz === 0 || (ball.z - court.netZ) * ball.vz >= 0) return null
  const t = ball.t + ((court.netZ - ball.z) / ball.vz) * 1000
  if (t > groundTime(ball)) return null
  const at = ballAt(ball, t)
  return Math.abs(at.x - court.cx) <= NET_HALF_SPAN && at.y < NET_HEIGHT + BALL_RADIUS ? t : null
}

export function shoot(court: Court, from: { x: number, y: number, z: number }, target: Aim, speed: number, now: number): { ball: Ball, netAt: number | null } {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const flight = Math.hypot(dx, dz) / speed
  const ball = {
    x: from.x,
    y: from.y,
    z: from.z,
    vx: dx / flight,
    vy: (GRAVITY * flight * flight) / 2 / flight - from.y / flight,
    vz: dz / flight,
    t: now
  }
  return { ball, netAt: netTime(court, ball) }
}

function missedSpot(from: Aim, target: Aim, quality: number): Aim {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const length = Math.hypot(dx, dz)
  const extra = (1 - quality) * MISS_M
  return length === 0 ? target : { x: target.x + (dx / length) * extra, z: target.z + (dz / length) * extra }
}

function strike(court: Court, hitter: Team, contact: { x: number, y: number, z: number }, aim: Aim, speed: readonly [number, number], quality: number, now: number): Rally {
  const target = missedSpot(contact, aimSpot(court, other(hitter), aim), quality)
  const { ball, netAt } = shoot(court, { ...contact, y: Math.max(contact.y, MIN_CONTACT_Y) }, target, lerp(speed, quality), now)
  return { phase: 'flight', ball, hitter, bounces: 0, netAt }
}

function pointTo(winner: Team, call: Call, ball: Ball | null, now: number): Rally {
  return { phase: 'point', winner, call, ball, until: now + POINT_PAUSE_MS }
}

export function tossBall(x: number, z: number, now: number): Ball {
  return { x, y: TOSS_START_Y, z, vx: 0, vy: TOSS_SPEED, vz: 0, t: now }
}

export function tossPeak(ball: Ball): number {
  return ball.t + (ball.vy / GRAVITY) * 1000
}

export function serveWait(server: string, team: Team, now: number): Rally {
  return { phase: 'serve_wait', server, team, since: now }
}

function baselineCentre(court: Court, team: Team): { x: number, z: number } {
  return { x: court.cx, z: court.netZ + sideSign(team) * COURT_HALF_LENGTH }
}

function bounce(ball: Ball, t: number): Ball {
  const at = ballAt(ball, t)
  const impactVy = ball.vy - (GRAVITY * (t - ball.t)) / 1000
  return { x: at.x, y: 0, z: at.z, vx: ball.vx * BOUNCE_KEEP, vy: Math.abs(impactVy) * RESTITUTION, vz: ball.vz * BOUNCE_KEEP, t }
}

export function step(rally: Rally, now: number, court: Court, where: Where): Rally {
  if (rally.phase === 'serve_wait') {
    if (now - rally.since < SERVE_WAIT_MS) return rally
    const spot = where(rally.server) ?? baselineCentre(court, rally.team)
    return { phase: 'toss', server: rally.server, team: rally.team, ball: tossBall(spot.x, spot.z, now) }
  }
  if (rally.phase === 'toss') {
    return now - rally.ball.t >= TOSS_FALL_MS ? pointTo(other(rally.team), 'missed_toss', null, rally.ball.t + TOSS_FALL_MS) : rally
  }
  if (rally.phase !== 'flight') return rally
  let current: Extract<Rally, { phase: 'flight' }> = rally
  for (;;) {
    const { ball, hitter, bounces, netAt }: Extract<Rally, { phase: 'flight' }> = current
    const landing = groundTime(ball)
    if (netAt !== null && netAt <= landing) {
      if (now < netAt) return current
      return pointTo(other(hitter), 'net', null, netAt)
    }
    if (now < landing) return current
    const at = ballAt(ball, landing)
    if (bounces === 1) return pointTo(hitter, 'double_bounce', bounce(ball, landing), landing)
    if (!landsIn(court, other(hitter), at.x, at.z)) return pointTo(other(hitter), 'out', bounce(ball, landing), landing)
    current = { phase: 'flight', ball: bounce(ball, landing), hitter, bounces: 1, netAt: null }
  }
}

export function contactQuality(distance: number): number {
  return clamp(1 - (distance - SWEET_M) / (REACH_M - SWEET_M), 0, 1)
}

function bestContact(ball: Ball, team: Team, court: Court, hitter: Hitter, now: number): { t: number, d: number } | null {
  let best: { t: number, d: number } | null = null
  const end = Math.min(now, groundTime(ball))
  for (let t = Math.max(ball.t, now - HIT_ALLOWANCE_MS); t <= end; t += HIT_SAMPLE_MS) {
    const at = ballAt(ball, t)
    if (at.y < 0 || at.y > HIT_MAX_HEIGHT || !onHalf(court, team, at.z, 0)) continue
    const d = Math.hypot(at.x - hitter.x, at.z - hitter.z)
    if (d <= REACH_M && (!best || d < best.d)) best = { t, d }
  }
  return best
}

export function hit(rally: Rally, hitter: Hitter, aim: Aim, lob: boolean, now: number, court: Court): Rally | null {
  if (!onHalf(court, hitter.team, hitter.z, OWN_HALF_TOLERANCE)) return null
  if (rally.phase === 'serve_wait') {
    if (hitter.sessionId !== rally.server) return null
    return { phase: 'toss', server: rally.server, team: rally.team, ball: tossBall(hitter.x, hitter.z, now) }
  }
  if (rally.phase === 'toss') {
    const off = Math.abs(now - tossPeak(rally.ball))
    if (hitter.sessionId !== rally.server || off > SERVE_WINDOW_MS) return null
    const contact = ballAt(rally.ball, now)
    return strike(court, rally.team, contact, aim, SERVE_SPEED, 1 - off / SERVE_WINDOW_MS, now)
  }
  if (rally.phase !== 'flight' || rally.hitter === hitter.team) return null
  const contact = bestContact(rally.ball, hitter.team, court, hitter, now)
  if (!contact) return null
  return strike(court, hitter.team, ballAt(rally.ball, contact.t), aim, lob ? LOB_SPEED : DRIVE_SPEED, contactQuality(contact.d), now)
}
