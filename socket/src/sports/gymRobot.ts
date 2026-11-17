import type { Bounds } from '../types.ts'
import { type GymCourt, basketsOf } from './gymCourt.ts'
import { type Athlete, type GymActionKind, type GymGame, dunkRange, otherTeam } from './gymMatch.ts'
import type { BasketballRules, FootballRules, GymRules } from './gymRules.ts'
import { type RobotLevel, isRobot } from './robots.ts'
import type { Team } from './signup.ts'

interface GymRobotSkill {
  speedMps: number
  reactMs: number
  decideMs: number
  tackleChance: number
  passChance: number
  passErrorRad: number
  shotErrorRad: number
  shotCharge: number
  shotErrorMs: number
  rimChance: number
  blockChance: number
}

export const GYM_ROBOT: Record<RobotLevel, GymRobotSkill> = {
  easy: { speedMps: 3.8, reactMs: 700, decideMs: 900, tackleChance: 0.1, passChance: 0.35, passErrorRad: 0.8, shotErrorRad: 0.45, shotCharge: 0.25, shotErrorMs: 260, rimChance: 0.3, blockChance: 0.1 },
  normal: { speedMps: 6, reactMs: 400, decideMs: 550, tackleChance: 0.25, passChance: 0.55, passErrorRad: 0.4, shotErrorRad: 0.22, shotCharge: 0.45, shotErrorMs: 160, rimChance: 0.55, blockChance: 0.35 },
  hard: { speedMps: 8, reactMs: 220, decideMs: 300, tackleChance: 0.45, passChance: 0.7, passErrorRad: 0.15, shotErrorRad: 0.1, shotCharge: 0.6, shotErrorMs: 100, rimChance: 0.75, blockChance: 0.6 }
}

const MAX_STEP_S = 0.5
const EDGE_M = 0.3
const BALL_LEAD_S = 0.25
const LANE_M = 1
const OPEN_M = 2
const PRESSURE_M = 2.5
const SHORT_PASS_M = 3
const PASS_GAIN_M = 3
const HUMAN_MATE_BONUS_M = 5
const THROUGH_RUN_MPS = 2
const FOOTBALL_SHOOT_FROM_M = 13
const POINT_BLANK_M = 6
const CHARGE_MARGIN = 0.05
const SHOT_LANE_M = 0.7
const AIM_INSIDE_POST_M = 0.5
const SWERVE_FROM_M = 4
const SWERVE_M = 3
const SUPPORT_AHEAD_M = 7
const SUPPORT_WIDE_M = 7
const SUPPORT_OFF_LINE_M = 4
const COVER = [{ share: 0.35, wideM: 0 }, { share: 0.6, wideM: 3 }, { share: 0.2, wideM: 0 }, { share: 0.6, wideM: -3 }, { share: 0.8, wideM: 0 }]
const JUMPER_FROM_M = [4.5, 8.5]
const UNDER_RIM_M = 1.5
const BACK_OUT_M = 3
const SPACING_M = 6
const SPACING_RAD = [0.9, -0.9, 0.3, -0.3, 1.4]
const GUARD_GAP_M = 1.1
const KICKOFF_BACK_M = 5
const TRY_EVERY_MS = 700

interface Spot {
  x: number
  z: number
}

type Situation = 'free' | 'mine' | 'ours' | 'theirs'

export interface GymRobotBrain {
  level: RobotLevel
  thoughtAt: number
  vx: number
  vz: number
  seen: Situation | null
  noticedAt: number
  heading: Spot | null
  nextChoiceAt: number
  shot: { releaseAt: number, aimZ: number } | null
  shootFromM: number | null
  blockSeen: number | null
  jumpAt: number | null
}

export interface GymRobotSight<R extends GymRules = GymRules> {
  game: GymGame
  rules: R
  self: Athlete
  athletes: readonly Athlete[]
  now: number
  random: () => number
}

export interface GymRobotAct {
  kind: GymActionKind
  at: number
}

export interface GymRobotStep {
  x: number
  z: number
  ry: number
  acts: GymRobotAct[]
}

interface Mind<R extends GymRules> {
  brain: GymRobotBrain
  skill: GymRobotSkill
  sight: GymRobotSight<R>
  dtS: number
  team: Team
  mates: Athlete[]
  foes: Athlete[]
  robots: Athlete[]
}

export function newGymRobotBrain(level: RobotLevel, now: number): GymRobotBrain {
  return { level, thoughtAt: now, vx: 0, vz: 0, seen: null, noticedAt: now, heading: null, nextChoiceAt: 0, shot: null, shootFromM: null, blockSeen: null, jumpAt: null }
}

export function kickoffSpot(court: GymCourt, team: Team, slot: number, count: number): { x: number, z: number, ry: number } {
  const { inward } = court.goals[team]
  const lines = court.court
  return { x: court.centre.x - inward * KICKOFF_BACK_M, z: lines.minZ + ((lines.maxZ - lines.minZ) * (slot + 1)) / (count + 1), ry: -inward * Math.PI / 2 }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function gap(a: Spot, b: Spot): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function yawTo(from: Spot, to: Spot, otherwise: number): number {
  return gap(from, to) < 1e-6 ? otherwise : Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

function spread(random: () => number, half: number): number {
  return (random() * 2 - 1) * half
}

function fieldOf(court: GymCourt): Bounds {
  const b = court.walls ? court.playArea : court.court
  return { minX: b.minX + EDGE_M, maxX: b.maxX - EDGE_M, minZ: b.minZ + EDGE_M, maxZ: b.maxZ - EDGE_M }
}

function inLane(from: Spot, to: Spot, foe: Spot, halfWidth = LANE_M): boolean {
  const length = gap(from, to)
  if (length < 1e-6) return false
  const ux = (to.x - from.x) / length
  const uz = (to.z - from.z) / length
  const along = (foe.x - from.x) * ux + (foe.z - from.z) * uz
  return along > 0 && along < length && Math.abs((foe.x - from.x) * uz - (foe.z - from.z) * ux) < halfWidth
}

function nearest(list: readonly Athlete[], to: Spot): Athlete {
  return list.reduce((best, a) => (gap(a, to) < gap(best, to) ? a : best))
}

function still(self: Athlete): GymRobotStep {
  return { x: self.x, z: self.z, ry: self.ry, acts: [] }
}

function wake<R extends GymRules>(brain: GymRobotBrain, sight: GymRobotSight<R>): Mind<R> | null {
  const { game, self, athletes, now } = sight
  const dtS = Math.min(MAX_STEP_S, Math.max(0, now - brain.thoughtAt) / 1000)
  brain.thoughtAt = now
  if (game.owner !== self.accountId) Object.assign(brain, { shot: null, shootFromM: null })
  if (self.team === null || (game.groundedUntil.get(self.accountId) ?? 0) > now) {
    Object.assign(brain, { vx: 0, vz: 0 })
    return null
  }
  const mates = athletes.filter((a) => a.team === self.team && a.accountId !== self.accountId)
  const foes = athletes.filter((a) => a.team !== self.team)
  const robots = athletes.filter((a) => a.team === self.team && isRobot(a.accountId))
  return { brain, skill: GYM_ROBOT[brain.level], sight, dtS, team: self.team, mates, foes, robots }
}

function holder(sight: GymRobotSight): Athlete | null {
  return sight.athletes.find((a) => a.accountId === sight.game.owner) ?? null
}

function situationOf(sight: GymRobotSight): Situation {
  const { game, self } = sight
  if (game.owner === null) return 'free'
  if (game.owner === self.accountId) return 'mine'
  return holder(sight)?.team === self.team ? 'ours' : 'theirs'
}

function reacting(mind: Mind<GymRules>): boolean {
  const { brain, skill, sight } = mind
  const situation = situationOf(sight)
  if (situation !== brain.seen) Object.assign(brain, { seen: situation, noticedAt: sight.now })
  return sight.now - brain.noticedAt < skill.reactMs
}

function walk(mind: Mind<GymRules>, to: Spot): Spot {
  const { brain, skill, dtS, sight: { self, game } } = mind
  const field = fieldOf(game.court)
  const goal = { x: clamp(to.x, field.minX, field.maxX), z: clamp(to.z, field.minZ, field.maxZ) }
  const far = gap(self, goal)
  const share = far < 1e-6 ? 0 : Math.min(1, (skill.speedMps * dtS) / far)
  const here = { x: self.x + (goal.x - self.x) * share, z: self.z + (goal.z - self.z) * share }
  Object.assign(brain, { heading: { x: to.x, z: to.z }, vx: dtS > 0 ? (here.x - self.x) / dtS : 0, vz: dtS > 0 ? (here.z - self.z) / dtS : 0 })
  return here
}

function jog(mind: Mind<GymRules>, to: Spot): GymRobotStep {
  const { self, game } = mind.sight
  const here = walk(mind, to)
  return { ...here, ry: yawTo(self, here, yawTo(here, game.ball, self.ry)), acts: [] }
}

function slotOf(mind: Mind<GymRules>): number {
  return mind.robots.findIndex((r) => r.accountId === mind.sight.self.accountId)
}

function leads(mind: Mind<GymRules>): boolean {
  return nearest(mind.robots, mind.sight.game.ball).accountId === mind.sight.self.accountId
}

function barred(mind: Mind<GymRules>): boolean {
  const { restart } = mind.sight.game
  return restart !== null && mind.sight.now < restart.until && restart.team !== mind.team
}

function ballAhead(game: GymGame): Spot {
  return { x: game.ball.x + game.ball.vx * BALL_LEAD_S, z: game.ball.z + game.ball.vz * BALL_LEAD_S }
}

function releaseDue(brain: GymRobotBrain, now: number): GymRobotAct[] {
  if (!brain.shot || now < brain.shot.releaseAt) return []
  const at = brain.shot.releaseAt
  brain.shot = null
  return [{ kind: 'shot_release', at }]
}

function openMate(mind: Mind<GymRules>, from: Spot, target: Spot): Athlete | null {
  const { mates, foes, sight: { rules } } = mind
  let best: { mate: Athlete, gain: number } | null = null
  for (const mate of mates) {
    const reach = gap(from, mate)
    if (reach < SHORT_PASS_M || reach > rules.passAssist.maxM) continue
    if (foes.some((f) => gap(f, mate) < OPEN_M || inLane(from, mate, f))) continue
    const gain = gap(from, target) - gap(mate, target) + (isRobot(mate.accountId) ? 0 : HUMAN_MATE_BONUS_M)
    if (!best || gain > best.gain) best = { mate, gain }
  }
  const pressed = foes.some((f) => gap(f, from) < PRESSURE_M)
  return best && (pressed || best.gain >= PASS_GAIN_M) ? best.mate : null
}

function wayPast(mind: Mind<FootballRules>, mouth: Spot): Spot {
  const { self } = mind.sight
  const inWay = mind.foes.filter((f) => gap(f, self) < SWERVE_FROM_M && inLane(self, mouth, f))
  if (inWay.length === 0) return mouth
  const blocker = nearest(inWay, self)
  return { x: blocker.x, z: blocker.z + (self.z >= blocker.z ? SWERVE_M : -SWERVE_M) }
}

function shotAimZ(mind: Mind<FootballRules>, from: Spot): number | null {
  const goal = mind.sight.game.court.goals[mind.team]
  const middle = (goal.minZ + goal.maxZ) / 2
  const range = gap(from, { x: goal.lineX, z: middle })
  if (range > FOOTBALL_SHOOT_FROM_M) return null
  const clear = [middle, goal.minZ + AIM_INSIDE_POST_M, goal.maxZ - AIM_INSIDE_POST_M].find((z) => !mind.foes.some((f) => inLane(from, { x: goal.lineX, z }, f, SHOT_LANE_M)))
  return clear ?? (range <= POINT_BLANK_M ? middle : null)
}

function dribble(mind: Mind<FootballRules>): GymRobotStep {
  const { brain, skill, sight: { game, rules, self, now, random } } = mind
  const goal = game.court.goals[mind.team]
  const mouth = { x: goal.lineX, z: (goal.minZ + goal.maxZ) / 2 }
  const here = walk(mind, wayPast(mind, mouth))
  const ahead = yawTo(self, here, self.ry)
  if (brain.shot) {
    const aim = { x: goal.lineX, z: brain.shot.aimZ }
    const acts = releaseDue(brain, now)
    return { ...here, ry: acts.length === 0 ? ahead : yawTo(here, aim, ahead) + spread(random, skill.shotErrorRad), acts }
  }
  if (now < brain.nextChoiceAt) return { ...here, ry: ahead, acts: [] }
  brain.nextChoiceAt = now + skill.decideMs
  const mate = openMate(mind, here, mouth)
  if (mate && random() < skill.passChance) {
    const kind = mate.vx * goal.inward >= THROUGH_RUN_MPS ? 'through' : 'pass'
    return { ...here, ry: yawTo(here, mate, ahead) + spread(random, skill.passErrorRad), acts: [{ kind, at: now }] }
  }
  const aimZ = shotAimZ(mind, here)
  if (aimZ === null) return { ...here, ry: ahead, acts: [] }
  const charge = skill.shotCharge + (rules.overcharge.from - CHARGE_MARGIN - skill.shotCharge) * random()
  brain.shot = { releaseAt: now + charge * rules.shotChargeMs, aimZ }
  return { ...here, ry: ahead, acts: [{ kind: 'shot_start', at: now }] }
}

function footballSupport(mind: Mind<FootballRules>): Spot {
  const { game } = mind.sight
  const goal = game.court.goals[mind.team]
  const lines = game.court.court
  const slot = slotOf(mind)
  const wide = (slot % 2 === 0 ? 1 : -1) * SUPPORT_WIDE_M * (1 + Math.floor(slot / 2))
  const z = game.ball.z + wide > lines.maxZ || game.ball.z + wide < lines.minZ ? game.ball.z - wide : game.ball.z + wide
  const x = game.ball.x + goal.inward * SUPPORT_AHEAD_M
  const deepest = goal.lineX - goal.inward * SUPPORT_OFF_LINE_M
  return { x: goal.inward > 0 ? Math.min(x, deepest) : Math.max(x, deepest), z }
}

function footballCover(mind: Mind<FootballRules>): Spot {
  const { game } = mind.sight
  const own = game.court.goals[otherTeam(mind.team)]
  const mouth = { x: own.lineX, z: (own.minZ + own.maxZ) / 2 }
  const { share, wideM } = COVER[slotOf(mind) % COVER.length]
  return { x: mouth.x + (game.ball.x - mouth.x) * share, z: mouth.z + (game.ball.z - mouth.z) * share + wideM }
}

function press(mind: Mind<FootballRules>): GymRobotStep {
  const { brain, skill, sight: { game, rules, self, now, random } } = mind
  const here = walk(mind, game.ball)
  const acts: GymRobotAct[] = []
  const reach = Math.hypot(brain.vx, brain.vz) >= rules.tackle.slideFromMps ? rules.tackle.reachM : rules.standingTackle.reachM
  if (gap(here, game.ball) <= reach && now >= brain.nextChoiceAt && now >= (game.cooldownUntil.get(self.accountId) ?? 0)) {
    brain.nextChoiceAt = now + TRY_EVERY_MS
    if (random() < skill.tackleChance) acts.push({ kind: 'tackle', at: now })
  }
  return { ...here, ry: yawTo(here, game.ball, self.ry), acts }
}

export function thinkFootballer(brain: GymRobotBrain, sight: GymRobotSight<FootballRules>): GymRobotStep {
  const mind = wake(brain, sight)
  if (!mind) return still(sight.self)
  if (reacting(mind)) return jog(mind, brain.heading ?? sight.self)
  if (sight.game.owner === sight.self.accountId) return dribble(mind)
  const owner = holder(sight)
  if (owner?.team === mind.team) return jog(mind, footballSupport(mind))
  if (!leads(mind) || (!owner && barred(mind))) return jog(mind, footballCover(mind))
  return owner ? press(mind) : jog(mind, ballAhead(sight.game))
}

function attackRim(mind: Mind<BasketballRules>): GymRobotStep {
  const { brain, skill, sight: { game, rules, self, now, random } } = mind
  const rim = basketsOf(game.court)[mind.team]
  if (brain.shot) return { ...walk(mind, self), ry: yawTo(self, rim, self.ry), acts: releaseDue(brain, now) }
  const underRim = gap(self, rim) < UNDER_RIM_M
  const here = walk(mind, underRim ? { x: rim.x + Math.sign(game.court.centre.x - rim.x) * BACK_OUT_M, z: rim.z } : rim)
  const ahead = yawTo(self, here, self.ry)
  const toRim = gap(here, rim)
  const speed = Math.hypot(brain.vx, brain.vz)
  const finishFromM = dunkRange(rules, speed) || (speed >= rules.layup.speedMps ? rules.layup.rangeM : 0)
  if (toRim <= finishFromM) return { ...here, ry: ahead, acts: [{ kind: 'shot_start', at: now }, { kind: 'shot_release', at: now }] }
  if (now >= brain.nextChoiceAt) {
    brain.nextChoiceAt = now + skill.decideMs
    const mate = openMate(mind, here, rim)
    if (mate && random() < skill.passChance) return { ...here, ry: yawTo(here, mate, ahead) + spread(random, skill.passErrorRad), acts: [{ kind: 'pass', at: now }] }
  }
  brain.shootFromM ??= random() < skill.rimChance ? 0 : JUMPER_FROM_M[0] + (JUMPER_FROM_M[1] - JUMPER_FROM_M[0]) * random()
  if (toRim > brain.shootFromM || toRim < UNDER_RIM_M) return { ...here, ry: ahead, acts: [] }
  brain.shot = { releaseAt: now + rules.shotMeter.riseMs + spread(random, skill.shotErrorMs), aimZ: rim.z }
  return { ...here, ry: yawTo(here, rim, ahead), acts: [{ kind: 'shot_start', at: now }] }
}

function spacing(mind: Mind<BasketballRules>): Spot {
  const { court } = mind.sight.game
  const rim = basketsOf(court)[mind.team]
  const angle = SPACING_RAD[slotOf(mind) % SPACING_RAD.length]
  return { x: rim.x - Math.sign(rim.x - court.centre.x) * Math.cos(angle) * SPACING_M, z: rim.z + Math.sin(angle) * SPACING_M }
}

function manOf(mind: Mind<BasketballRules>, owner: Athlete | null): Athlete | null {
  const { foes, robots, sight: { self } } = mind
  const onBall = owner ? nearest(robots, owner) : null
  if (onBall?.accountId === self.accountId) return owner
  const marks = foes.filter((f) => f.accountId !== owner?.accountId)
  const free = robots.filter((r) => r.accountId !== onBall?.accountId)
  return marks.length === 0 ? owner : marks[free.findIndex((r) => r.accountId === self.accountId) % marks.length]
}

function guardSpot(man: Spot, rim: Spot, halfwayX: number): Spot {
  const off = gap(man, rim)
  const tight = off < 1e-6 ? 0 : Math.min(1, GUARD_GAP_M / off)
  const backcourt = (man.x - halfwayX) * (rim.x - halfwayX) < 0
  const share = backcourt ? Math.max(tight, (halfwayX - man.x) / (rim.x - man.x)) : tight
  return { x: man.x + (rim.x - man.x) * share, z: man.z + (rim.z - man.z) * share }
}

function guard(mind: Mind<BasketballRules>, owner: Athlete | null): GymRobotStep {
  const { brain, skill, sight: { game, rules, self, now, random } } = mind
  const man = manOf(mind, owner)
  if (!man) return jog(mind, self)
  const rim = basketsOf(game.court)[otherTeam(mind.team)]
  const here = walk(mind, guardSpot(man, rim, game.court.centre.x))
  const near = gap(here, man)
  const acts: GymRobotAct[] = []
  const started = game.shotStartedAt.get(man.accountId)
  if (started === undefined) brain.jumpAt = null
  else if (started !== brain.blockSeen) {
    brain.blockSeen = started
    brain.jumpAt = near <= rules.blockReachM && random() < skill.blockChance ? started + Math.max(skill.reactMs, rules.shotMeter.riseMs - rules.blockWindowMs / 2) : null
  }
  if (brain.jumpAt !== null && now >= brain.jumpAt) {
    acts.push({ kind: 'jump', at: brain.jumpAt })
    brain.jumpAt = null
  }
  if (man.accountId === game.owner && near <= rules.shove.reachM && now >= brain.nextChoiceAt && now >= (game.cooldownUntil.get(self.accountId) ?? 0)) {
    brain.nextChoiceAt = now + TRY_EVERY_MS
    if (random() < skill.tackleChance) acts.push({ kind: 'tackle', at: now })
  }
  return { ...here, ry: yawTo(here, man, self.ry), acts }
}

export function thinkBasketballer(brain: GymRobotBrain, sight: GymRobotSight<BasketballRules>): GymRobotStep {
  const mind = wake(brain, sight)
  if (!mind) return still(sight.self)
  if (reacting(mind)) return jog(mind, brain.heading ?? sight.self)
  if (sight.game.owner === sight.self.accountId) return attackRim(mind)
  const owner = holder(sight)
  if (owner?.team === mind.team) return jog(mind, spacing(mind))
  if (!owner && leads(mind) && !barred(mind)) return jog(mind, ballAhead(sight.game))
  return guard(mind, owner)
}

export function thinkGymRobot(brain: GymRobotBrain, sight: GymRobotSight): GymRobotStep {
  const { rules } = sight
  return rules.sport === 'football' ? thinkFootballer(brain, { ...sight, rules }) : thinkBasketballer(brain, { ...sight, rules })
}
