import type { Bounds } from '../types.ts'
import type { Team } from './signup.ts'
import {
  AIM_NET_GAP,
  AIM_OUT_MARGIN,
  BALL_RADIUS,
  BOUNCE_KEEP,
  CLEAR_QUALITY,
  COURT_HALF_LENGTH,
  DOUBLES_HALF_WIDTH,
  DRIVE_SPEED,
  GRAVITY,
  HIT_ALLOWANCE_MS,
  HIT_MAX_HEIGHT,
  HIT_SAMPLE_MS,
  LOB_SPEED,
  MIN_CONTACT_Y,
  MISS_M,
  NET_CLEAR_M,
  NET_HALF_SPAN,
  NET_HEIGHT,
  OWN_HALF_TOLERANCE,
  PERFECT_QUALITY,
  PLAY_AREA_END_MARGIN,
  PLAY_AREA_SIDE_MARGIN,
  POINT_PAUSE_MS,
  REACH_M,
  RESTITUTION,
  SERVE_FLOOR,
  SERVE_REACH_M,
  SERVE_SPEED,
  SERVE_WAIT_MS,
  SERVE_WINDOW_MS,
  SWEET_M,
  SMASH_SPEED,
  SWING_AHEAD_MS,
  TIMING_FLOOR,
  TIMING_PERFECT_MS,
  TIMING_SMASH_MS,
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

export type Timing = 'smash' | 'perfect' | 'good' | 'early' | 'late'

export interface Shot {
  sessionId: string
  timing: Timing
}

export interface Swing {
  sessionId: string
  team: Team
  at: number
  contactX: number
  aim: Aim
  lob: boolean
  quality: number
  timing: Timing
}

export type Flight = { phase: 'flight', ball: Ball, hitter: Team, bounces: 0 | 1, netAt: number | null, swing: Swing | null, shot: Shot | null }

export type Rally =
  | { phase: 'serve_wait', server: string, team: Team, since: number }
  | { phase: 'toss', server: string, team: Team, ball: Ball }
  | Flight
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

export function playAreaFor(cx: number, netZ: number): Bounds {
  const halfX = DOUBLES_HALF_WIDTH + PLAY_AREA_SIDE_MARGIN
  const halfZ = COURT_HALF_LENGTH + PLAY_AREA_END_MARGIN
  return { minX: cx - halfX, maxX: cx + halfX, minZ: netZ - halfZ, maxZ: netZ + halfZ }
}

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

function clearingFlight(court: Court, from: { y: number, z: number }, target: Aim, flight: number): number {
  const crossing = (court.netZ - from.z) / (target.z - from.z)
  if (!(crossing > 0 && crossing < 1)) return flight
  const missing = NET_HEIGHT + NET_CLEAR_M - from.y * (1 - crossing)
  return missing <= 0 ? flight : Math.max(flight, Math.sqrt((2 * missing) / (GRAVITY * crossing * (1 - crossing))))
}

export function shoot(court: Court, from: { x: number, y: number, z: number }, target: Aim, speed: number, now: number, clearsNet = false): { ball: Ball, netAt: number | null } {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const direct = Math.hypot(dx, dz) / speed
  const flight = clearsNet ? clearingFlight(court, from, target, direct) : direct
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

function strike(court: Court, hitter: Team, contact: { x: number, y: number, z: number }, aim: Aim, speed: readonly [number, number], quality: number, now: number, shot: Shot): Rally {
  const target = missedSpot(contact, aimSpot(court, other(hitter), aim), quality)
  const { ball, netAt } = shoot(court, { ...contact, y: Math.max(contact.y, MIN_CONTACT_Y) }, target, lerp(speed, quality), now, quality >= CLEAR_QUALITY)
  return { phase: 'flight', ball, hitter, bounces: 0, netAt, swing: null, shot }
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
  let current: Flight = rally
  for (;;) {
    const { ball, hitter, bounces, netAt, swing, shot }: Flight = current
    const landing = groundTime(ball)
    if (swing && swing.at <= Math.min(landing, netAt ?? Infinity)) {
      if (now < swing.at) return current
      const speed = swing.lob ? LOB_SPEED : swing.timing === 'smash' ? ([SMASH_SPEED, SMASH_SPEED] as const) : DRIVE_SPEED
      return strike(court, swing.team, ballAt(ball, swing.at), swing.aim, speed, swing.quality, swing.at, { sessionId: swing.sessionId, timing: swing.timing })
    }
    if (netAt !== null && netAt <= landing) {
      if (now < netAt) return current
      return pointTo(other(hitter), 'net', null, netAt)
    }
    if (now < landing) return current
    const at = ballAt(ball, landing)
    if (bounces === 1) return pointTo(hitter, 'double_bounce', bounce(ball, landing), landing)
    if (!landsIn(court, other(hitter), at.x, at.z)) return pointTo(other(hitter), 'out', bounce(ball, landing), landing)
    current = { phase: 'flight', ball: bounce(ball, landing), hitter, bounces: 1, netAt: null, swing, shot }
  }
}

export function contactQuality(distance: number): number {
  return clamp(1 - (distance - SWEET_M) / (REACH_M - SWEET_M), 0, 1)
}

export function timingFactor(offsetMs: number): number {
  const [late, early] = TIMING_PERFECT_MS
  if (offsetMs > early) return 1 - (1 - TIMING_FLOOR) * clamp((offsetMs - early) / (SWING_AHEAD_MS - early), 0, 1)
  if (offsetMs < late) return 1 - (1 - TIMING_FLOOR) * clamp((late - offsetMs) / (HIT_ALLOWANCE_MS + late), 0, 1)
  return 1
}

export function timingOf(offsetMs: number, quality: number): Timing {
  if (offsetMs > TIMING_PERFECT_MS[1]) return 'early'
  if (offsetMs < TIMING_PERFECT_MS[0]) return 'late'
  if (quality < PERFECT_QUALITY) return 'good'
  return offsetMs >= TIMING_SMASH_MS[0] && offsetMs <= TIMING_SMASH_MS[1] ? 'smash' : 'perfect'
}

function plannedContact(flight: Flight, court: Court, hitter: Hitter, now: number): { t: number, d: number, x: number } | null {
  let best: { t: number, d: number, x: number } | null = null
  let ball = flight.ball
  let dies = flight.netAt ?? Infinity
  for (let segment = flight.bounces; segment <= 1; segment += 1) {
    const landing = groundTime(ball)
    const end = Math.min(landing, dies)
    for (let t = Math.max(ball.t, now - HIT_ALLOWANCE_MS); t <= end; t += HIT_SAMPLE_MS) {
      const at = ballAt(ball, t)
      if (at.y < 0 || at.y > HIT_MAX_HEIGHT || !onHalf(court, hitter.team, at.z, 0)) continue
      const d = Math.hypot(at.x - hitter.x, at.z - hitter.z)
      if (d <= REACH_M && (!best || d < best.d)) best = { t, d, x: at.x }
    }
    const at = ballAt(ball, landing)
    if (landing >= dies || !landsIn(court, hitter.team, at.x, at.z)) break
    ball = bounce(ball, landing)
    dies = Infinity
  }
  return best && best.t <= now + SWING_AHEAD_MS ? best : null
}

export function hit(rally: Rally, hitter: Hitter, aim: Aim, lob: boolean, now: number, court: Court): Rally | null {
  if (!onHalf(court, hitter.team, hitter.z, OWN_HALF_TOLERANCE)) return null
  if (rally.phase === 'serve_wait') {
    if (hitter.sessionId !== rally.server) return null
    return { phase: 'toss', server: rally.server, team: rally.team, ball: tossBall(hitter.x, hitter.z, now) }
  }
  if (rally.phase === 'toss') {
    if (hitter.sessionId !== rally.server || Math.hypot(hitter.x - rally.ball.x, hitter.z - rally.ball.z) > SERVE_REACH_M) return null
    const quality = Math.max(SERVE_FLOOR, 1 - Math.abs(now - tossPeak(rally.ball)) / SERVE_WINDOW_MS)
    const timing = quality >= PERFECT_QUALITY ? 'perfect' : quality > SERVE_FLOOR ? 'good' : now < tossPeak(rally.ball) ? 'early' : 'late'
    return strike(court, rally.team, ballAt(rally.ball, now), aim, SERVE_SPEED, quality, now, { sessionId: hitter.sessionId, timing })
  }
  if (rally.phase !== 'flight' || rally.hitter === hitter.team || rally.swing) return null
  const contact = plannedContact(rally, court, hitter, now)
  if (!contact) return null
  const quality = contactQuality(contact.d) * timingFactor(contact.t - now)
  const swing: Swing = { sessionId: hitter.sessionId, team: hitter.team, at: contact.t, contactX: contact.x, aim, lob, quality, timing: timingOf(contact.t - now, quality) }
  return step({ ...rally, swing }, now, court, () => null)
}

export type Stroke = 'serve' | 'forehand' | 'backhand' | 'lob' | 'celebrate'

export function strokeOf(before: Rally, after: Rally, hitter: Hitter, lob: boolean): Stroke | null {
  if (before.phase === 'serve_wait' && after.phase === 'toss') return 'serve'
  if (before.phase !== 'flight' || after.phase !== 'flight') return null
  if (lob) return 'lob'
  const contactX = after.swing ? after.swing.contactX : after.ball.x
  return (contactX - hitter.x) * sideSign(hitter.team) >= 0 ? 'forehand' : 'backhand'
}
