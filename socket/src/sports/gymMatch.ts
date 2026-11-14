import { type Ball, type BallWorld, type Body, droppedThroughRim, launchToward, stepBall } from './gymBall.ts'
import { type GymCourt, type Hoop, courtHoops, courtObstacles } from './gymCourt.ts'
import type { BasketballRules, FootballRules, GymRules } from './gymRules.ts'
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

export type GymActionKind = 'pass' | 'shot_start' | 'shot_release' | 'tackle' | 'jump'
export const GYM_ACTIONS: readonly GymActionKind[] = ['pass', 'shot_start', 'shot_release', 'tackle', 'jump']

export type GymEvent =
  | { kind: 'score', team: Team, scorer: number | null, points: number, dunk: boolean }
  | { kind: 'kick', accountId: number, shot: boolean }
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
    const basket = game.court.baskets[team]
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

function carry(game: GymGame, rules: GymRules, a: Athlete): void {
  const f = facing(a)
  const y = rules.sport === 'football' ? game.court.floorY + rules.ball.radius : game.court.floorY + rules.carryHeightM
  game.ball = { x: a.x + f.x * rules.carryAheadM, y, z: a.z + f.z * rules.carryAheadM, vx: a.vx, vy: 0, vz: a.vz }
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
    const { x, y, z, rimRadius } = game.court.baskets[team]
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

export function stepGym(game: GymGame, rules: GymRules, athletes: readonly Athlete[], dt: number, now: number): GymEvent[] {
  if (game.restart && now >= game.restart.until) game.restart = null
  const holder = owned(game, athletes)
  if (game.owner !== null && !holder) game.owner = null
  if (holder) {
    carry(game, rules, holder)
    return []
  }
  const before = { ...game.ball }
  stepBall(game.ball, rules.ball, game.world, dt, bodiesOf(game, athletes, now))
  if (game.mode === 'free') {
    pickUp(game, rules, athletes, now)
    return []
  }
  if (rules.sport === 'football') {
    const team = goalScored(before, game.ball, game, rules)
    if (team) return [award(game, rules, team, scorerFor(game, team), 1, false, now)]
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

function kick(game: GymGame, rules: FootballRules, a: Athlete, speed: number, lift: number, now: number, shot: boolean): GymEvent[] {
  const f = facing(a)
  game.ball = { ...game.ball, vx: f.x * speed, vy: lift, vz: f.z * speed }
  release(game, a, now, rules.kickIgnoreMs)
  return [{ kind: 'kick', accountId: a.accountId, shot }]
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

function footballAction(game: GymGame, rules: FootballRules, a: Athlete, kind: GymActionKind, now: number): GymEvent[] {
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
    return kick(game, rules, a, rules.passSpeed, rules.passLift, now, false)
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
  return kick(game, rules, a, s0 + (s1 - s0) * m, l0 + (l1 - l0) * m, now, true)
}

export function meterOf(heldMs: number, riseMs: number): { value: number, rising: boolean } {
  const phase = Math.max(0, heldMs) / riseMs
  return phase <= 1 ? { value: phase, rising: true } : { value: Math.max(0, 2 - phase), rising: false }
}

export function goodWindow(rules: BasketballRules, distance: number): number {
  const { windowNear, windowFar, farDistanceM } = rules.shotMeter
  const t = Math.min(1, Math.max(0, distance / farDistanceM))
  return windowNear + (windowFar - windowNear) * t
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

function dunk(game: GymGame, rules: BasketballRules, a: Athlete, basket: Hoop, now: number, rng: Rng): GymEvent[] {
  release(game, a, now, rules.kickIgnoreMs)
  const made = rng() < rules.dunkChance
  if (made && game.mode === 'match' && a.team) return [award(game, rules, a.team, a.accountId, DUNK_POINTS, true, now)]
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

function throwShot(game: GymGame, rules: BasketballRules, a: Athlete, basket: Hoop, heldMs: number, rng: Rng): void {
  const y0 = game.court.floorY + rules.releaseHeightM
  const distance = flatDistance(a.x, a.z, basket.x, basket.z)
  const meter = meterOf(heldMs, rules.shotMeter.riseMs)
  const good = meter.value >= 1 - goodWindow(rules, distance)
  const toRim = Math.atan2(basket.x - a.x, basket.z - a.z)
  const aim = Math.atan2(-Math.sin(a.ry), -Math.cos(a.ry))
  const aimError = wrapAngle(aim - toRim)
  const miss = 1 - meter.value
  const lateral = aimError * (good ? 1 - rules.aimAssistMax : 1) + (rng() * 2 - 1) * (good ? 0.004 : 0.03 + 0.05 * miss)
  const reachScale = good ? 1 + (rng() - 0.5) * 0.01 : 1 + (meter.rising ? -1 : 1) * miss * 0.45
  const heading = toRim + lateral
  const reach = distance * reachScale
  const tx = a.x + Math.sin(heading) * reach
  const tz = a.z + Math.cos(heading) * reach
  const angle = (rules.shotAngleDeg * Math.PI) / 180
  const v = launchToward(a.x, y0, a.z, tx, basket.y, tz, angle) ?? launchToward(a.x, y0, a.z, tx, basket.y, tz, 1.25)
  if (!v) throw new Error('basketball shot: no trajectory to the rim')
  game.ball = { x: a.x, y: y0, z: a.z, ...v }
}

function targetHoop(game: GymGame, a: Athlete): Hoop {
  if (game.mode === 'match' && a.team) return game.court.baskets[a.team]
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
    game.ball = { x: a.x + f.x * 0.4, y: game.court.floorY + rules.carryHeightM + 0.4, z: a.z + f.z * 0.4, vx: f.x * rules.passSpeed, vy: rules.passLift, vz: f.z * rules.passSpeed }
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
  if (flatDistance(a.x, a.z, basket.x, basket.z) <= rules.dunkRangeM && speedOf(a) >= rules.dunkSpeed) return dunk(game, rules, a, basket, now, rng)
  const block = blocker(game, rules, a, athletes, now)
  release(game, a, now, rules.kickIgnoreMs)
  if (block) {
    const away = Math.atan2(a.x - block.x, a.z - block.z) + (rng() - 0.5)
    game.ball = { x: a.x, y: game.court.floorY + rules.releaseHeightM, z: a.z, vx: Math.sin(away) * BLOCK_SPEED, vy: 1, vz: Math.cos(away) * BLOCK_SPEED }
    game.lastTouch = { accountId: block.accountId, team: block.team }
    game.lastShot = null
    return [{ kind: 'block', accountId: block.accountId }]
  }
  throwShot(game, rules, a, basket, now - started, rng)
  if (game.mode === 'match' && a.team) game.lastShot = { accountId: a.accountId, team: a.team, basket: a.team, points: shotPoints(a, game.court.baskets[a.team]) }
  return [{ kind: 'kick', accountId: a.accountId, shot: true }]
}

export function actGym(game: GymGame, rules: GymRules, actor: Athlete, athletes: readonly Athlete[], kind: GymActionKind, now: number, rng: Rng): GymEvent[] {
  return rules.sport === 'football' ? footballAction(game, rules, actor, kind, now) : basketballAction(game, rules, actor, athletes, kind, now, rng)
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
