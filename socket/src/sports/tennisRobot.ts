import type { RobotLevel } from './robots.ts'
import type { Team } from './signup.ts'
import { SPORTS_TICK_MS } from './sportsConstants.ts'
import { COURT_HALF_LENGTH, HIT_MAX_HEIGHT, PLAY_AREA_END_MARGIN, TENNIS_HIT_COOLDOWN_MS, TENNIS_WHIFF_RECOVERY_MS, TIMING_PERFECT_MS } from './tennisConstants.ts'
import { type Aim, type Ball, type Court, type Flight, type Rally, type Shot, ballAt, bounce, groundTime, landsIn, nearestContact, playAreaFor, sideSign, tossPeak } from './tennisRally.ts'

interface RobotSkill {
  speedMps: number
  reactMs: number
  timingErrorMs: number
  placeErrorM: number
  missChance: number
  aimWidthShare: number
  awayChance: number
  lobChance: number
  depthM: readonly [number, number]
}

export const TENNIS_ROBOT: Record<RobotLevel, RobotSkill> = {
  easy: { speedMps: 2.2, reactMs: 550, timingErrorMs: 500, placeErrorM: 1, missChance: 0.25, aimWidthShare: 0.25, awayChance: 0, lobChance: 0, depthM: [6, 9] },
  normal: { speedMps: 3, reactMs: 350, timingErrorMs: 300, placeErrorM: 0.5, missChance: 0.1, aimWidthShare: 0.6, awayChance: 0.35, lobChance: 0.05, depthM: [7, 10] },
  hard: { speedMps: 3.8, reactMs: 200, timingErrorMs: 150, placeErrorM: 0.15, missChance: 0.04, aimWidthShare: 0.8, awayChance: 0.8, lobChance: 0.15, depthM: [8.5, 11] }
}

const SERVE_PAUSE_MS = 1200
const SWING_LEAD_MS = (TIMING_PERFECT_MS[0] + TIMING_PERFECT_MS[1]) / 2
const AFTER_BOUNCE_MS = 200
const PATH_SAMPLE_MS = 50
const STAND_ASIDE_M = 0.6
const NET_STAND_OFF_M = 1
const EDGE_M = 0.3
const ARRIVED_M = 0.02

export interface Spot {
  x: number
  z: number
}

interface Chase {
  shot: Shot | null
  seenAt: number
  swingErrorMs: number
  offset: Spot
  misses: boolean
  swingAt: number | null
}

export interface TennisBrain {
  level: RobotLevel
  home: Spot
  thoughtAt: number
  nextSwingAt: number
  serveErrorMs: number
  chase: Chase | null
}

export type TennisRobotAction =
  | { kind: 'move', x: number, z: number, ry: number }
  | { kind: 'hit', aim: Aim, lob: boolean }

export interface TennisSight {
  rally: Rally
  court: Court
  team: Team
  sessionId: string
  at: Spot
  mates: Spot[]
  foes: Spot[]
  now: number
  random: () => number
}

export function newTennisBrain(level: RobotLevel, home: Spot, now: number): TennisBrain {
  return { level, home: { x: home.x, z: home.z }, thoughtAt: now, nextSwingAt: 0, serveErrorMs: 0, chase: null }
}

export function netFacing(team: Team): number {
  return team === 'red' ? 0 : Math.PI
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function spread(random: () => number): number {
  return random() * 2 - 1
}

function mistiming(skill: RobotSkill, random: () => number): number {
  return (random() + random() - 1) * skill.timingErrorMs
}

function distance(a: Spot, b: Spot): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function roam(court: Court, team: Team, spot: Spot): Spot {
  const area = playAreaFor(court.cx, court.netZ)
  const depth = clamp((spot.z - court.netZ) * sideSign(team), NET_STAND_OFF_M, COURT_HALF_LENGTH + PLAY_AREA_END_MARGIN - EDGE_M)
  return { x: clamp(spot.x, area.minX + EDGE_M, area.maxX - EDGE_M), z: court.netZ + depth * sideSign(team) }
}

function walk(sight: TennisSight, target: Spot, reachM: number): Extract<TennisRobotAction, { kind: 'move' }>[] {
  const { at, team } = sight
  const far = distance(at, target)
  if (far < ARRIVED_M || reachM <= 0) return []
  const step = Math.min(far, reachM)
  return [{ kind: 'move', x: at.x + ((target.x - at.x) / far) * step, z: at.z + ((target.z - at.z) / far) * step, ry: netFacing(team) }]
}

function ballAfterItsBounce(flight: Flight, court: Court, team: Team): Ball | null {
  if (flight.bounces === 1) return flight.ball
  const landing = groundTime(flight.ball)
  if (flight.netAt !== null && flight.netAt <= landing) return null
  const at = ballAt(flight.ball, landing)
  return landsIn(court, team, at.x, at.z) ? bounce(flight.ball, landing) : null
}

function standSpot(ball: Ball, team: Team, at: Spot, speedMps: number, now: number): Spot | null {
  const secondBounce = groundTime(ball)
  let spot: Spot | null = null
  for (let t = Math.max(ball.t + AFTER_BOUNCE_MS, now + SPORTS_TICK_MS); t < secondBounce; t += PATH_SAMPLE_MS) {
    const passing = ballAt(ball, t)
    if (passing.y > HIT_MAX_HEIGHT) continue
    spot = { x: passing.x - sideSign(team) * STAND_ASIDE_M, z: passing.z }
    if (distance(at, spot) <= (speedMps * (t - now)) / 1000) return spot
  }
  return spot
}

function openSide(court: Court, foes: Spot[], reachM: number, random: () => number): number {
  const first = random() < 0.5 ? 1 : -1
  const room = (x: number) => Math.min(...foes.map((foe) => Math.abs(foe.x - x)))
  return [first, -first, 0].map((side) => court.cx + side * reachM).reduce((best, x) => (room(x) > room(best) ? x : best))
}

function pickShot(skill: RobotSkill, sight: TennisSight): { aim: Aim, lob: boolean } {
  const { court, team, foes, random } = sight
  const reachM = court.halfWidth * skill.aimWidthShare
  const away = foes.length > 0 && random() < skill.awayChance
  const x = away ? openSide(court, foes, reachM, random) : court.cx + spread(random) * reachM
  const depth = skill.depthM[0] + (skill.depthM[1] - skill.depthM[0]) * random()
  return { aim: { x, z: court.netZ - sideSign(team) * depth }, lob: random() < skill.lobChance }
}

function serve(brain: TennisBrain, skill: RobotSkill, sight: TennisSight, rally: Extract<Rally, { phase: 'serve_wait' | 'toss' }>): TennisRobotAction[] {
  const { court, now, random } = sight
  if (now < brain.nextSwingAt) return []
  if (rally.phase === 'serve_wait') {
    if (now - rally.since < SERVE_PAUSE_MS) return []
    brain.serveErrorMs = mistiming(skill, random)
    brain.nextSwingAt = now + TENNIS_HIT_COOLDOWN_MS
    return [{ kind: 'hit', aim: { x: court.cx, z: court.netZ }, lob: false }]
  }
  if (now < tossPeak(rally.ball) - SPORTS_TICK_MS / 2 + brain.serveErrorMs) return []
  brain.nextSwingAt = now + TENNIS_HIT_COOLDOWN_MS
  return [{ kind: 'hit', ...pickShot(skill, sight) }]
}

function chaseOf(brain: TennisBrain, skill: RobotSkill, flight: Flight, now: number, random: () => number): Chase {
  if (!brain.chase || brain.chase.shot !== flight.shot) {
    brain.chase = {
      shot: flight.shot,
      seenAt: now,
      swingErrorMs: mistiming(skill, random),
      offset: { x: spread(random) * skill.placeErrorM, z: spread(random) * skill.placeErrorM },
      misses: random() < skill.missChance,
      swingAt: null
    }
  }
  return brain.chase
}

export function thinkTennis(brain: TennisBrain, sight: TennisSight): TennisRobotAction[] {
  const { rally, court, team, sessionId, at, mates, now, random } = sight
  const skill = TENNIS_ROBOT[brain.level]
  const reachM = (skill.speedMps * Math.max(0, now - brain.thoughtAt)) / 1000
  brain.thoughtAt = now
  if ((rally.phase === 'serve_wait' || rally.phase === 'toss') && rally.server === sessionId) {
    brain.chase = null
    return serve(brain, skill, sight, rally)
  }
  if (rally.phase !== 'flight' || rally.hitter === team || rally.swing) {
    brain.chase = null
    return walk(sight, brain.home, reachM)
  }
  const chase = chaseOf(brain, skill, rally, now, random)
  if (now - chase.seenAt < skill.reactMs) return []
  const ball = ballAfterItsBounce(rally, court, team)
  const spot = ball && standSpot(ball, team, at, skill.speedMps, now)
  if (!spot) return walk(sight, brain.home, reachM)
  const mine = mates.every((mate) => distance(mate, spot) >= distance(at, spot))
  const target = mine ? roam(court, team, { x: spot.x + chase.offset.x, z: spot.z + chase.offset.z }) : brain.home
  const steps = walk(sight, target, reachM)
  const stood = steps[0] ?? at
  const contact = nearestContact(rally, court, { sessionId, team, x: stood.x, z: stood.z }, now)
  if (contact && contact.t > now) chase.swingAt = contact.t - SWING_LEAD_MS - SPORTS_TICK_MS / 2 + chase.swingErrorMs
  if (chase.misses || chase.swingAt === null || now < chase.swingAt || now < brain.nextSwingAt) return steps
  brain.nextSwingAt = now + TENNIS_WHIFF_RECOVERY_MS
  chase.swingAt = null
  return [...steps, { kind: 'hit', ...pickShot(skill, sight) }]
}
