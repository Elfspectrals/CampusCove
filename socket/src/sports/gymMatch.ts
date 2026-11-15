import { type Ball, type BallWorld, type Body, GRAVITY, droppedThroughRim, launchToward, stepBall } from './gymBall.ts'
import { type GymCourt, type Hoop, basketsOf, courtHoops, courtObstacles } from './gymCourt.ts'
import type { BasketballRules, FootballRules, GymRules, PassAssist } from './gymRules.ts'
import type { Team } from './signup.ts'

export interface Athlete {
  accountId: number
  team: Team | null
  x: number
  z: number
  vx: number
  vz: number
  ry: number
}

export type ShotRelease = 'perfect' | 'good' | 'early' | 'late'

export type GymActionKind = 'pass' | 'pass_start' | 'pass_release' | 'shot_start' | 'shot_release' | 'tackle' | 'jump'
export const GYM_ACTIONS: readonly GymActionKind[] = ['pass', 'pass_start', 'pass_release', 'shot_start', 'shot_release', 'tackle', 'jump']

export type GymEvent =
  | { kind: 'score', team: Team, scorer: number | null, points: number, dunk: boolean }
  | { kind: 'kick', accountId: number, shot: boolean, release?: ShotRelease }
  | { kind: 'tackle', accountId: number, won: boolean }
  | { kind: 'steal', accountId: number, won: boolean }
  | { kind: 'block', accountId: number }

interface Shot {
  accountId: number
  team: Team
  basket: Team
  points: 2 | 3
}

export type GymMode = 'match' | 'free'

export interface GymGame {
  mode: GymMode
  court: GymCourt
  world: BallWorld
  ball: Ball
  owner: number | null
  lastTouch: { accountId: number, team: Team | null } | null
  kickedBy: { accountId: number, until: number } | null
  restart: { team: Team, until: number } | null
  score: Record<Team, number>
  tallies: Map<number, number>
  threes: Map<number, number>
  cooldownUntil: Map<number, number>
  groundedUntil: Map<number, number>
  shotStartedAt: Map<number, number>
  passStartedAt: Map<number, number>
  jumpedAt: Map<number, number>
  lastShot: Shot | null
}

export type Rng = () => number

export const MAX_SHOT_HOLD_MS = 5000
const DUNK_POINTS = 2
const BLOCK_SPEED = 3

export function otherTeam(team: Team): Team {
  return team === 'red' ? 'blue' : 'red'
}

function restingBall(court: GymCourt, x: number, z: number, radius: number): Ball {
  return { x, y: court.floorY + radius, z, vx: 0, vy: 0, vz: 0 }
}

function worldOf(court: GymCourt): BallWorld {
  return { floorY: court.floorY, ceilingY: court.ceilingY, arena: court.arena, ...courtObstacles(court) }
}

export function newGymGame(court: GymCourt, rules: GymRules, now: number, mode: GymMode = 'match', at: { x: number, z: number } = court.centre): GymGame {
  return {
    mode,
    court,
    world: worldOf(court),
    ball: restingBall(court, at.x, at.z, rules.ball.radius),
    owner: null,
    lastTouch: null,
    kickedBy: null,
    restart: mode === 'match' ? { team: 'red', until: now + rules.restartMs } : null,
    score: { red: 0, blue: 0 },
    tallies: new Map(),
    threes: new Map(),
    cooldownUntil: new Map(),
    groundedUntil: new Map(),
    shotStartedAt: new Map(),
    passStartedAt: new Map(),
    jumpedAt: new Map(),
    lastShot: null
  }
}

function facing(a: Athlete): { x: number, z: number } {
  return { x: -Math.sin(a.ry), z: -Math.cos(a.ry) }
}

function flatDistance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz)
}

function kickoff(game: GymGame, rules: GymRules, x: number, z: number, team: Team, now: number): void {
  game.ball = restingBall(game.court, x, z, rules.ball.radius)
  game.owner = null
  game.kickedBy = null
  game.lastShot = null
  game.restart = { team, until: now + rules.restartMs }
  game.shotStartedAt.clear()
}

export function restartHalf(game: GymGame, rules: GymRules, team: Team, now: number): void {
  kickoff(game, rules, game.court.centre.x, game.court.centre.z, team, now)
}

function tally(map: Map<number, number>, accountId: number, add: number): void {
  map.set(accountId, (map.get(accountId) ?? 0) + add)
}

function award(game: GymGame, rules: GymRules, team: Team, scorer: number | null, points: number, dunk: boolean, now: number): GymEvent {
  game.score[team] += points
  if (scorer !== null) tally(game.tallies, scorer, points)
  if (scorer !== null && points === 3) tally(game.threes, scorer, 1)
  const conceding = otherTeam(team)
  if (rules.sport === 'football') {
    kickoff(game, rules, game.court.centre.x, game.court.centre.z, conceding, now)
  } else {
    const basket = basketsOf(game.court)[team]
    const inward = Math.sign(game.court.centre.x - basket.x)
    kickoff(game, rules, basket.x + inward * 1.2, basket.z, conceding, now)
  }
  return { kind: 'score', team, scorer, points, dunk }
}

function owned(game: GymGame, athletes: readonly Athlete[]): Athlete | null {
  return game.owner === null ? null : athletes.find((a) => a.accountId === game.owner) ?? null
}

function grounded(game: GymGame, accountId: number, now: number): boolean {
  return (game.groundedUntil.get(accountId) ?? 0) > now
}

function canPickUp(game: GymGame, a: Athlete, now: number): boolean {
  if (grounded(game, a.accountId, now)) return false
  if (game.kickedBy && game.kickedBy.accountId === a.accountId && now < game.kickedBy.until) return false
  if (game.restart && now < game.restart.until && game.restart.team !== a.team) return false
  return true
}

function pickUp(game: GymGame, rules: GymRules, athletes: readonly Athlete[], now: number): void {
  if (game.owner !== null) return
  const reach = rules.sport === 'football' ? rules.dribbleReachM : rules.catchReachM
  const height = rules.sport === 'football' ? rules.pickupHeightM : rules.catchHeightM
  if (game.ball.y - game.court.floorY > height) return
  const near = athletes
    .filter((a) => canPickUp(game, a, now))
    .map((a) => ({ a, d: flatDistance(a.x, a.z, game.ball.x, game.ball.z) }))
    .filter(({ d }) => d <= reach)
    .sort((p, q) => p.d - q.d)[0]
  if (!near) return
  game.owner = near.a.accountId
  game.lastTouch = { accountId: near.a.accountId, team: near.a.team }
  game.restart = null
}

export function carryAhead(rules: GymRules, a: Athlete): number {
  if (rules.sport !== 'football') return rules.carryAheadM
  const [walk, sprint] = rules.sprintCarry.speedMps
  const share = Math.min(1, Math.max(0, (Math.hypot(a.vx, a.vz) - walk) / (sprint - walk)))
  return rules.carryAheadM + rules.sprintCarry.extraM * share
}

function carry(game: GymGame, rules: GymRules, a: Athlete): void {
  const f = facing(a)
  const y = rules.sport === 'football' ? game.court.floorY + rules.ball.radius : game.court.floorY + rules.carryHeightM
  const ahead = carryAhead(rules, a)
  game.ball = { x: a.x + f.x * ahead, y, z: a.z + f.z * ahead, vx: a.vx, vy: 0, vz: a.vz }
}

function goalScored(before: Ball, after: Ball, game: GymGame, rules: FootballRules): Team | null {
  for (const team of ['red', 'blue'] as const) {
    const g = game.court.goals[team]
    const crossed = (before.x - g.lineX) * g.inward <= 0 && (after.x - g.lineX) * g.inward > 0
    const mouth = after.z > g.minZ + rules.ball.radius && after.z < g.maxZ - rules.ball.radius && after.y < game.court.floorY + g.height
    if (crossed && mouth) return team
  }
  return null
}

function basketScored(before: Ball, after: Ball, game: GymGame): Team | null {
  for (const team of ['red', 'blue'] as const) {
    const { x, y, z, rimRadius } = basketsOf(game.court)[team]
    if (droppedThroughRim(before, after, { x, y, z, radius: rimRadius })) return team
  }
  return null
}

function bodiesOf(game: GymGame, athletes: readonly Athlete[], now: number): Body[] {
  const kicker = game.kickedBy && now < game.kickedBy.until ? game.kickedBy.accountId : null
  return athletes.filter((a) => a.accountId !== kicker)
}

function scorerFor(game: GymGame, team: Team): number | null {
  return game.lastTouch && game.lastTouch.team === team ? game.lastTouch.accountId : null
}

const THROW_IN_INSET_M = 0.3

function offPitch(court: GymCourt, x: number, z: number): boolean {
  const c = court.court
  return x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ
}

function throwIn(game: GymGame, rules: GymRules, x: number, z: number, now: number): void {
  const c = game.court.court
  const spotX = Math.min(c.maxX - THROW_IN_INSET_M, Math.max(c.minX + THROW_IN_INSET_M, x))
  const spotZ = Math.min(c.maxZ - THROW_IN_INSET_M, Math.max(c.minZ + THROW_IN_INSET_M, z))
  if (game.mode === 'free') {
    game.ball = restingBall(game.court, spotX, spotZ, rules.ball.radius)
    game.owner = null
    return
  }
  const last = game.lastTouch?.team ?? null
  kickoff(game, rules, spotX, spotZ, last === null ? 'red' : otherTeam(last), now)
}

export function stepGym(game: GymGame, rules: GymRules, athletes: readonly Athlete[], dt: number, now: number): GymEvent[] {
  if (game.restart && now >= game.restart.until) game.restart = null
  const holder = owned(game, athletes)
  if (game.owner !== null && !holder) game.owner = null
  if (holder && !game.court.walls && offPitch(game.court, holder.x, holder.z)) {
    throwIn(game, rules, holder.x, holder.z, now)
    return []
  }
  if (holder) {
    carry(game, rules, holder)
    return []
  }
  const before = { ...game.ball }
  stepBall(game.ball, rules.ball, game.world, dt, bodiesOf(game, athletes, now))
  if (game.mode === 'free') {
    if (!game.court.walls && offPitch(game.court, game.ball.x, game.ball.z)) throwIn(game, rules, game.ball.x, game.ball.z, now)
    pickUp(game, rules, athletes, now)
    return []
  }
  if (rules.sport === 'football') {
    const team = goalScored(before, game.ball, game, rules)
    if (team) return [award(game, rules, team, scorerFor(game, team), 1, false, now)]
    if (!game.court.walls && offPitch(game.court, game.ball.x, game.ball.z)) {
      throwIn(game, rules, game.ball.x, game.ball.z, now)
      return []
    }
  } else {
    const team = basketScored(before, game.ball, game)
    if (team) {
      const shot = game.lastShot && game.lastShot.basket === team && game.lastShot.team === team ? game.lastShot : null
      return [award(game, rules, team, shot ? shot.accountId : scorerFor(game, team), shot ? shot.points : 2, false, now)]
    }
  }
  pickUp(game, rules, athletes, now)
  return []
}

function release(game: GymGame, a: Athlete, now: number, ignoreMs: number): void {
  game.owner = null
  game.kickedBy = { accountId: a.accountId, until: now + ignoreMs }
  game.lastTouch = { accountId: a.accountId, team: a.team }
}

function footballHasBall(game: GymGame, rules: FootballRules, a: Athlete, now: number): boolean {
  if (game.owner === a.accountId) return true
  if (game.owner !== null || !canPickUp(game, a, now)) return false
  return flatDistance(a.x, a.z, game.ball.x, game.ball.z) <= rules.dribbleReachM && game.ball.y - game.court.floorY <= rules.pickupHeightM
}

function kickAlong(game: GymGame, rules: FootballRules, a: Athlete, dir: { x: number, z: number }, speed: number, lift: number, now: number, shot: boolean): GymEvent[] {
  game.ball = { ...game.ball, vx: dir.x * speed, vy: lift, vz: dir.z * speed }
  release(game, a, now, rules.kickIgnoreMs)
  return [{ kind: 'kick', accountId: a.accountId, shot }]
}

function kick(game: GymGame, rules: FootballRules, a: Athlete, speed: number, lift: number, now: number, shot: boolean): GymEvent[] {
  return kickAlong(game, rules, a, facing(a), speed, lift, now, shot)
}

export function passTarget(a: Athlete, athletes: readonly Athlete[], assist: PassAssist): Athlete | null {
  const f = facing(a)
  const least = Math.cos((assist.coneDeg / 2) * Math.PI / 180)
  let best: { mate: Athlete, ahead: number } | null = null
  for (const mate of athletes) {
    if (mate.accountId === a.accountId || (a.team !== null && mate.team !== a.team)) continue
    const d = flatDistance(a.x, a.z, mate.x, mate.z)
    if (d < 1e-6 || d > assist.maxM) continue
    const ahead = ((mate.x - a.x) * f.x + (mate.z - a.z) * f.z) / d
    if (ahead >= least && (!best || ahead > best.ahead)) best = { mate, ahead }
  }
  return best?.mate ?? null
}

function ledSpot(mate: Athlete, flightS: number): { x: number, z: number } {
  return { x: mate.x + mate.vx * flightS, z: mate.z + mate.vz * flightS }
}

function towards(a: Athlete, spot: { x: number, z: number }): { x: number, z: number } {
  const d = flatDistance(a.x, a.z, spot.x, spot.z)
  return d < 1e-6 ? facing(a) : { x: (spot.x - a.x) / d, z: (spot.z - a.z) / d }
}

function groundPass(game: GymGame, rules: FootballRules, a: Athlete, athletes: readonly Athlete[], now: number): GymEvent[] {
  const mate = passTarget(a, athletes, rules.passAssist)
  if (!mate) return kick(game, rules, a, rules.passSpeed, rules.passLift, now, false)
  const d = flatDistance(a.x, a.z, mate.x, mate.z)
  const speed = Math.min(rules.passAssist.maxSpeed, rules.passSpeed + d * rules.passAssist.speedPerM)
  return kickAlong(game, rules, a, towards(a, ledSpot(mate, d / speed)), speed, rules.passLift, now, false)
}

function lobFlightS(distance: number, angleRad: number): number {
  return 2 * Math.sin(angleRad) * Math.sqrt(distance / (GRAVITY * Math.sin(2 * angleRad)))
}

function lobPass(game: GymGame, rules: FootballRules, a: Athlete, athletes: readonly Athlete[], charge: number, now: number): GymEvent[] {
  const angle = (rules.lob.angleDeg * Math.PI) / 180
  const mate = passTarget(a, athletes, rules.passAssist)
  const f = facing(a)
  const reach = rules.lob.rangeM[0] + (rules.lob.rangeM[1] - rules.lob.rangeM[0]) * charge
  const spot = mate ? ledSpot(mate, lobFlightS(flatDistance(a.x, a.z, mate.x, mate.z), angle)) : { x: a.x + f.x * reach, z: a.z + f.z * reach }
  const v = launchToward(game.ball.x, game.ball.y, game.ball.z, spot.x, game.court.floorY + rules.ball.radius, spot.z, angle)
  if (!v) return kick(game, rules, a, rules.passSpeed, rules.passLift, now, false)
  game.ball = { ...game.ball, ...v }
  release(game, a, now, rules.kickIgnoreMs)
  return [{ kind: 'kick', accountId: a.accountId, shot: false }]
}

function shotAim(game: GymGame, rules: FootballRules, a: Athlete): { x: number, z: number } {
  const f = facing(a)
  const goal = game.mode === 'match' && a.team ? game.court.goals[a.team] : null
  if (!goal || f.x * (goal.lineX - a.x) <= 0) return f
  const z = a.z + (f.z * (goal.lineX - a.x)) / f.x
  const lo = goal.minZ + rules.shotAssist.insidePostM
  const hi = goal.maxZ - rules.shotAssist.insidePostM
  if (z < goal.minZ - rules.shotAssist.maxOffM || z > goal.maxZ + rules.shotAssist.maxOffM) return f
  return towards(a, { x: goal.lineX, z: Math.min(hi, Math.max(lo, z)) })
}

export function chargeOf(heldMs: number, chargeMs: number): number {
  return Math.min(1, Math.max(0, heldMs) / chargeMs)
}

function inCone(a: Athlete, x: number, z: number, reach: number, coneDeg: number): boolean {
  const d = flatDistance(a.x, a.z, x, z)
  if (d > reach) return false
  if (d < 0.3) return true
  const f = facing(a)
  return ((x - a.x) * f.x + (z - a.z) * f.z) / d >= Math.cos((coneDeg / 2) * Math.PI / 180)
}

function footballAction(game: GymGame, rules: FootballRules, a: Athlete, athletes: readonly Athlete[], kind: GymActionKind, now: number): GymEvent[] {
  if (kind === 'tackle') {
    if ((game.cooldownUntil.get(a.accountId) ?? 0) > now || grounded(game, a.accountId, now)) return []
    game.cooldownUntil.set(a.accountId, now + rules.tackle.cooldownMs)
    const holder = game.owner
    const reachable = holder !== a.accountId && game.ball.y - game.court.floorY <= rules.pickupHeightM &&
      inCone(a, game.ball.x, game.ball.z, rules.tackle.reachM, rules.tackle.coneDeg)
    if (reachable && (!game.restart || game.restart.team === a.team)) {
      game.owner = a.accountId
      game.lastTouch = { accountId: a.accountId, team: a.team }
      game.kickedBy = null
      game.restart = null
      if (holder !== null) game.shotStartedAt.delete(holder)
      return [{ kind: 'tackle', accountId: a.accountId, won: true }]
    }
    game.groundedUntil.set(a.accountId, now + rules.tackle.groundMs)
    return [{ kind: 'tackle', accountId: a.accountId, won: false }]
  }
  if (grounded(game, a.accountId, now)) return []
  if (kind === 'pass') {
    if (!footballHasBall(game, rules, a, now)) return []
    game.shotStartedAt.delete(a.accountId)
    game.passStartedAt.delete(a.accountId)
    return groundPass(game, rules, a, athletes, now)
  }
  if (kind === 'pass_start') {
    game.passStartedAt.set(a.accountId, now)
    return []
  }
  if (kind === 'pass_release') {
    const pressed = game.passStartedAt.get(a.accountId)
    game.passStartedAt.delete(a.accountId)
    if (pressed === undefined || now - pressed > MAX_SHOT_HOLD_MS || !footballHasBall(game, rules, a, now)) return []
    game.shotStartedAt.delete(a.accountId)
    const held = now - pressed
    return held < rules.lob.holdMs ? groundPass(game, rules, a, athletes, now) : lobPass(game, rules, a, athletes, chargeOf(held - rules.lob.holdMs, rules.lob.chargeMs), now)
  }
  if (kind === 'shot_start') {
    game.shotStartedAt.set(a.accountId, now)
    return []
  }
  if (kind !== 'shot_release') return []
  const started = game.shotStartedAt.get(a.accountId)
  game.shotStartedAt.delete(a.accountId)
  if (started === undefined || now - started > MAX_SHOT_HOLD_MS || !footballHasBall(game, rules, a, now)) return []
  const m = chargeOf(now - started, rules.shotChargeMs)
  const [s0, s1] = rules.shotSpeed
  const [l0, l1] = rules.shotLift
  const lift = l0 + (l1 - l0) * m + (m >= rules.overcharge.from ? rules.overcharge.lift : 0)
  return kickAlong(game, rules, a, shotAim(game, rules, a), s0 + (s1 - s0) * m, lift, now, true)
}

export function meterOf(heldMs: number, riseMs: number): { value: number, rising: boolean } {
  const phase = Math.max(0, heldMs) / riseMs
  return phase <= 1 ? { value: phase, rising: true } : { value: Math.max(0, 2 - phase), rising: false }
}

export function goodWindow(rules: BasketballRules, distance: number, contestShare = 1): number {
  const { windowNear, windowFar, farDistanceM } = rules.shotMeter
  const t = Math.min(1, Math.max(0, distance / farDistanceM))
  return (windowNear + (windowFar - windowNear) * t) * contestShare
}

export function contestShare(rules: BasketballRules, defenderDistance: number | null): number {
  const { reachM, tightM, minShare } = rules.contest
  if (defenderDistance === null || defenderDistance >= reachM) return 1
  return minShare + (1 - minShare) * Math.max(0, (defenderDistance - tightM) / (reachM - tightM))
}

function nearestDefender(a: Athlete, athletes: readonly Athlete[]): number | null {
  let nearest: number | null = null
  for (const o of athletes) {
    if (o.accountId === a.accountId || (a.team !== null && o.team === a.team)) continue
    const d = flatDistance(a.x, a.z, o.x, o.z)
    if (nearest === null || d < nearest) nearest = d
  }
  return nearest
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

function shotPoints(a: Athlete, basket: Hoop & { threePointRadius: number }): 2 | 3 {
  return flatDistance(a.x, a.z, basket.x, basket.z) > basket.threePointRadius ? 3 : 2
}

function speedOf(a: Athlete): number {
  return Math.hypot(a.vx, a.vz)
}

function finishAtRim(game: GymGame, rules: BasketballRules, a: Athlete, basket: Hoop, now: number, rng: Rng, chance: number, dunked: boolean): GymEvent[] {
  release(game, a, now, rules.kickIgnoreMs)
  const made = rng() < chance
  if (made && game.mode === 'match' && a.team) return [award(game, rules, a.team, a.accountId, DUNK_POINTS, dunked, now)]
  if (made) {
    game.ball = { x: basket.x, y: basket.y + 0.15, z: basket.z, vx: 0, vy: -2, vz: 0 }
    return [{ kind: 'kick', accountId: a.accountId, shot: true }]
  }
  game.ball = { x: basket.x, y: basket.y + 0.3, z: basket.z, vx: (rng() - 0.5) * 3, vy: 2.5, vz: (rng() - 0.5) * 3 }
  return [{ kind: 'kick', accountId: a.accountId, shot: true }]
}

function blocker(game: GymGame, rules: BasketballRules, a: Athlete, athletes: readonly Athlete[], now: number): Athlete | null {
  return athletes.find((o) => o.accountId !== a.accountId && (o.team === null || o.team !== a.team) && flatDistance(o.x, o.z, a.x, a.z) <= rules.blockReachM &&
    now - (game.jumpedAt.get(o.accountId) ?? -Infinity) <= rules.blockWindowMs) ?? null
}

export function releaseOf(rules: BasketballRules, heldMs: number, distance: number, contest = 1): ShotRelease {
  const meter = meterOf(heldMs, rules.shotMeter.riseMs)
  const window = goodWindow(rules, distance, contest)
  if (meter.value >= 1 - window * rules.shotMeter.perfectShare) return 'perfect'
  if (meter.value >= 1 - window) return 'good'
  return meter.rising ? 'early' : 'late'
}

function throwShot(game: GymGame, rules: BasketballRules, a: Athlete, basket: Hoop, heldMs: number, contest: number, rng: Rng): ShotRelease {
  const y0 = game.court.floorY + rules.releaseHeightM
  const distance = flatDistance(a.x, a.z, basket.x, basket.z)
  const meter = meterOf(heldMs, rules.shotMeter.riseMs)
  const quality = releaseOf(rules, heldMs, distance, contest)
  const good = quality === 'perfect' || quality === 'good'
  const toRim = Math.atan2(basket.x - a.x, basket.z - a.z)
  const aim = Math.atan2(-Math.sin(a.ry), -Math.cos(a.ry))
  const aimError = wrapAngle(aim - toRim)
  const miss = 1 - meter.value
  const lateral = good ? aimError * (1 - rules.aimAssistMax) : aimError * (1 - rules.missAimAssist) + (rng() * 2 - 1) * (0.02 + 0.03 * miss)
  const reachScale = good ? 1 : 1 + (meter.rising ? -1 : 1) * miss * rules.missReachError
  const heading = toRim + lateral
  const reach = distance * reachScale
  const tx = a.x + Math.sin(heading) * reach
  const tz = a.z + Math.cos(heading) * reach
  const angle = (rules.shotAngleDeg * Math.PI) / 180
  const v = launchToward(a.x, y0, a.z, tx, basket.y, tz, angle) ?? launchToward(a.x, y0, a.z, tx, basket.y, tz, 1.25)
  if (!v) throw new Error('basketball shot: no trajectory to the rim')
  game.ball = { x: a.x, y: y0, z: a.z, ...v }
  return quality
}

function targetHoop(game: GymGame, a: Athlete): Hoop {
  if (game.mode === 'match' && a.team) return basketsOf(game.court)[a.team]
  const f = facing(a)
  const score = (h: Hoop) => {
    const d = flatDistance(a.x, a.z, h.x, h.z)
    const ahead = d < 1e-6 ? 1 : ((h.x - a.x) * f.x + (h.z - a.z) * f.z) / d
    return d * (2 - ahead)
  }
  return courtHoops(game.court).reduce((best, h) => (score(h) < score(best) ? h : best))
}

function basketballAction(game: GymGame, rules: BasketballRules, a: Athlete, athletes: readonly Athlete[], kind: GymActionKind, now: number, rng: Rng): GymEvent[] {
  if (kind === 'jump') {
    game.jumpedAt.set(a.accountId, now)
    return []
  }
  if (kind === 'tackle') {
    if ((game.cooldownUntil.get(a.accountId) ?? 0) > now) return []
    const holder = owned(game, athletes)
    if (!holder || holder.accountId === a.accountId || (holder.team !== null && holder.team === a.team) || flatDistance(holder.x, holder.z, a.x, a.z) > rules.steal.reachM) return []
    game.cooldownUntil.set(a.accountId, now + rules.steal.cooldownMs)
    if (rng() >= rules.steal.chance) return [{ kind: 'steal', accountId: a.accountId, won: false }]
    game.owner = a.accountId
    game.lastTouch = { accountId: a.accountId, team: a.team }
    game.shotStartedAt.delete(holder.accountId)
    return [{ kind: 'steal', accountId: a.accountId, won: true }]
  }
  if (game.owner !== a.accountId) {
    if (kind === 'shot_release') game.shotStartedAt.delete(a.accountId)
    return []
  }
  if (kind === 'pass') {
    game.shotStartedAt.delete(a.accountId)
    const f = facing(a)
    const mate = passTarget(a, athletes, rules.passAssist)
    const reach = mate ? flatDistance(a.x, a.z, mate.x, mate.z) : 0
    const speed = mate ? Math.min(rules.passAssist.maxSpeed, rules.passSpeed + reach * rules.passAssist.speedPerM) : rules.passSpeed
    const dir = mate ? towards(a, ledSpot(mate, reach / speed)) : f
    const lift = mate ? (GRAVITY * reach) / speed / 2 : rules.passLift
    game.ball = { x: a.x + f.x * 0.4, y: game.court.floorY + rules.carryHeightM + 0.4, z: a.z + f.z * 0.4, vx: dir.x * speed, vy: lift, vz: dir.z * speed }
    release(game, a, now, rules.kickIgnoreMs)
    return [{ kind: 'kick', accountId: a.accountId, shot: false }]
  }
  if (kind === 'shot_start') {
    game.shotStartedAt.set(a.accountId, now)
    return []
  }
  const started = game.shotStartedAt.get(a.accountId)
  game.shotStartedAt.delete(a.accountId)
  if (started === undefined || now - started > MAX_SHOT_HOLD_MS) return []
  const basket = targetHoop(game, a)
  const toRim = flatDistance(a.x, a.z, basket.x, basket.z)
  const contest = contestShare(rules, nearestDefender(a, athletes))
  if (toRim <= rules.dunkRangeM && speedOf(a) >= rules.dunkSpeed) return finishAtRim(game, rules, a, basket, now, rng, rules.dunkChance, true)
  if (toRim <= rules.layup.rangeM && speedOf(a) >= rules.layup.speedMps) {
    const open = (contest - rules.contest.minShare) / (1 - rules.contest.minShare)
    return finishAtRim(game, rules, a, basket, now, rng, rules.layup.contestedChance + (rules.layup.chance - rules.layup.contestedChance) * open, false)
  }
  const block = blocker(game, rules, a, athletes, now)
  release(game, a, now, rules.kickIgnoreMs)
  if (block) {
    const away = Math.atan2(a.x - block.x, a.z - block.z) + (rng() - 0.5)
    game.ball = { x: a.x, y: game.court.floorY + rules.releaseHeightM, z: a.z, vx: Math.sin(away) * BLOCK_SPEED, vy: 1, vz: Math.cos(away) * BLOCK_SPEED }
    game.lastTouch = { accountId: block.accountId, team: block.team }
    game.lastShot = null
    return [{ kind: 'block', accountId: block.accountId }]
  }
  const quality = throwShot(game, rules, a, basket, now - started, contest, rng)
  if (game.mode === 'match' && a.team) game.lastShot = { accountId: a.accountId, team: a.team, basket: a.team, points: shotPoints(a, basketsOf(game.court)[a.team]) }
  return [{ kind: 'kick', accountId: a.accountId, shot: true, release: quality }]
}

export function actGym(game: GymGame, rules: GymRules, actor: Athlete, athletes: readonly Athlete[], kind: GymActionKind, now: number, rng: Rng): GymEvent[] {
  return rules.sport === 'football' ? footballAction(game, rules, actor, athletes, kind, now) : basketballAction(game, rules, actor, athletes, kind, now, rng)
}

export function dropOwner(game: GymGame, accountId: number): void {
  if (game.owner === accountId) game.owner = null
  game.shotStartedAt.delete(accountId)
}

export type TeamOutcome = 'win' | 'loss' | 'draw'

export function outcomeFor(team: Team, score: Record<Team, number>, forfeitLoser: Team | null | undefined): TeamOutcome {
  if (forfeitLoser !== undefined) return forfeitLoser === null ? 'draw' : forfeitLoser === team ? 'loss' : 'win'
  const mine = score[team]
  const theirs = score[otherTeam(team)]
  return mine === theirs ? 'draw' : mine > theirs ? 'win' : 'loss'
}
