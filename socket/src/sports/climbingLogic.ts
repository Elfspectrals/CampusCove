import { type SignupRules, parseSignupRules } from './signup.ts'

export type Face = 'east' | 'north' | 'south'
export type LineKind = 'route' | 'boulder'

export interface Hold {
  u: number
  y: number
}

export interface ClimbLine {
  id: string
  kind: LineKind
  colour: string
  base: { x: number, z: number }
  face: Face
  holds: Hold[]
}

export interface ColourRule {
  drainPerSec: number
  lossPerMiss: number
  zoneDeg: number
  turnMs: number
}

export interface CheckRules {
  minStartDeg: number
  endMarginDeg: number
  greatShare: number
  greatGrip: number
  strainZoneCut: number
  allowanceMs: number
}

export interface Check {
  hold: number
  startedAt: number
  turnMs: number
  zoneStart: number
  zoneSize: number
  greatSize: number
}

export interface ClimbingRules {
  zone: string
  floorY: number
  eyeHeightM: number
  standoffM: number
  reachBelowM: number
  startReachM: number
  duelStartDelayMs: number
  belayLowerMs: number
  gripMax: number
  restReachM: number
  strainReachM: number
  regenPerSec: number
  maxClimbMs: number
  check: CheckRules
  minPlayers: number
  maxPlayers: number
  colours: Map<string, ColourRule>
  lines: Map<string, ClimbLine>
  twins: [string, string]
  signup: SignupRules
}

export type ClimbPhase = 'climbing' | 'lowering'

export interface Climb {
  line: ClimbLine
  next: number
  grip: number
  gripAt: number
  readyAt: number
  check: Check | null
  startedAt: number | null
  phase: ClimbPhase
  lowerFrom: number
  lowerStartedAt: number
  duel: string | null
}

export type ReachOutcome = 'reach' | 'ignored'
export type CheckOutcome = 'hold' | 'great' | 'top' | 'miss' | 'fall' | 'ignored'

export interface Pose {
  x: number
  y: number
  z: number
  ry: number
}

const NORMALS: Record<Face, { x: number, z: number }> = {
  east: { x: 1, z: 0 },
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 }
}
const ID_PATTERN = /^[a-z0-9_]+$/

type Json = Record<string, unknown>

function fail(what: string): never {
  throw new Error(`sports/rules/climbing.json: ${what}`)
}

function positive(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) fail(`${what} must be a positive number`)
  return raw
}

function finite(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(`${what} must be a number`)
  return raw
}

function integer(raw: unknown, what: string): number {
  if (!Number.isInteger(raw) || (raw as number) < 1) fail(`${what} must be a positive integer`)
  return raw as number
}

function parseColours(raw: unknown): Map<string, ColourRule> {
  if (!raw || typeof raw !== 'object') fail('missing colours')
  const colours = new Map<string, ColourRule>()
  for (const [name, rule] of Object.entries(raw as Json)) {
    const r = (rule ?? {}) as Json
    colours.set(name, {
      drainPerSec: positive(r.drainPerSec, `colours.${name}.drainPerSec`),
      lossPerMiss: positive(r.lossPerMiss, `colours.${name}.lossPerMiss`),
      zoneDeg: positive(r.zoneDeg, `colours.${name}.zoneDeg`),
      turnMs: positive(r.turnMs, `colours.${name}.turnMs`)
    })
  }
  if (colours.size === 0) fail('no colours')
  return colours
}

function parseHold(raw: unknown, what: string): Hold {
  if (!Array.isArray(raw) || raw.length !== 2) fail(`${what} must be [u, y]`)
  return { u: finite(raw[0], `${what} u`), y: positive(raw[1], `${what} y`) }
}

function parseLine(raw: unknown, colours: Map<string, ColourRule>): ClimbLine {
  const r = (raw ?? {}) as Json
  const id = typeof r.id === 'string' && ID_PATTERN.test(r.id) ? r.id : fail(`invalid line id ${JSON.stringify(r.id)}`)
  if (r.kind !== 'route' && r.kind !== 'boulder') fail(`${id}: kind must be route or boulder`)
  if (typeof r.colour !== 'string' || !colours.has(r.colour)) fail(`${id}: unknown colour ${JSON.stringify(r.colour)}`)
  if (typeof r.face !== 'string' || !(r.face in NORMALS)) fail(`${id}: invalid face ${JSON.stringify(r.face)}`)
  if (!Array.isArray(r.base) || r.base.length !== 2) fail(`${id}: base must be [x, z]`)
  if (!Array.isArray(r.holds) || r.holds.length < 2) fail(`${id}: needs at least 2 holds`)
  const holds = r.holds.map((h, i) => parseHold(h, `${id} hold ${i}`))
  if (holds.some((h, i) => i > 0 && h.y <= holds[i - 1].y)) fail(`${id}: holds must go up`)
  return {
    id,
    kind: r.kind,
    colour: r.colour,
    base: { x: finite(r.base[0], `${id} base x`), z: finite(r.base[1], `${id} base z`) },
    face: r.face as Face,
    holds
  }
}

export function parseClimbingRules(raw: unknown): ClimbingRules {
  const r = (raw ?? {}) as Json
  if (r.sport !== 'climbing' || r.status !== 'ready') fail('sport must be climbing with status ready')
  if (typeof r.zone !== 'string') fail('missing zone')
  const colours = parseColours(r.colours)
  if (!Array.isArray(r.lines)) fail('missing lines')
  const lines = new Map<string, ClimbLine>()
  for (const line of r.lines.map((l) => parseLine(l, colours))) {
    if (lines.has(line.id)) fail(`duplicate line ${line.id}`)
    lines.set(line.id, line)
  }
  const twins = r.twinRoutes
  if (!Array.isArray(twins) || twins.length !== 2 || twins.some((id) => lines.get(id)?.kind !== 'route')) fail('twinRoutes must name 2 routes')
  const [a, b] = twins.map((id) => lines.get(id) as ClimbLine)
  if (a.colour !== b.colour || JSON.stringify(a.holds) !== JSON.stringify(b.holds)) fail('twinRoutes must be identical')
  const grip = (r.grip ?? {}) as Json
  const check = (r.check ?? {}) as Json
  const restReachM = positive(grip.restReachM, 'grip.restReachM')
  const strainReachM = positive(grip.strainReachM, 'grip.strainReachM')
  if (strainReachM <= restReachM) fail('grip.strainReachM must be above grip.restReachM')
  const strainZoneCut = finite(check.strainZoneCut, 'check.strainZoneCut')
  if (strainZoneCut < 0 || strainZoneCut >= 1) fail('check.strainZoneCut must be from 0 to under 1')
  const greatShare = positive(check.greatShare, 'check.greatShare')
  if (greatShare > 1) fail('check.greatShare must be at most 1')
  const minStartDeg = positive(check.minStartDeg, 'check.minStartDeg')
  const endMarginDeg = positive(check.endMarginDeg, 'check.endMarginDeg')
  for (const [name, rule] of colours) if (minStartDeg + rule.zoneDeg + endMarginDeg > 360) fail(`colours.${name}.zoneDeg does not fit after check.minStartDeg`)
  return {
    zone: r.zone,
    floorY: finite(r.floorY, 'floorY'),
    eyeHeightM: positive(r.eyeHeightM, 'eyeHeightM'),
    standoffM: positive(r.standoffM, 'standoffM'),
    reachBelowM: positive(r.reachBelowM, 'reachBelowM'),
    startReachM: positive(r.startReachM, 'startReachM'),
    duelStartDelayMs: positive(r.duelStartDelayMs, 'duelStartDelayMs'),
    belayLowerMs: positive(r.belayLowerSec, 'belayLowerSec') * 1000,
    gripMax: positive(grip.max, 'grip.max'),
    restReachM,
    strainReachM,
    regenPerSec: positive(grip.regenPerSec, 'grip.regenPerSec'),
    maxClimbMs: positive(grip.maxClimbSec, 'grip.maxClimbSec') * 1000,
    check: { minStartDeg, endMarginDeg, greatShare, greatGrip: positive(check.greatGrip, 'check.greatGrip'), strainZoneCut, allowanceMs: positive(check.allowanceMs, 'check.allowanceMs') },
    minPlayers: integer(r.minPlayers, 'minPlayers'),
    maxPlayers: integer(r.maxPlayers, 'maxPlayers'),
    colours,
    lines,
    twins: [a.id, b.id],
    signup: parseSignupRules(r, 'sports/rules/climbing.json')
  }
}

function colourOf(rules: ClimbingRules, line: ClimbLine): ColourRule {
  return rules.colours.get(line.colour) as ColourRule
}

export function startClimb(rules: ClimbingRules, line: ClimbLine, now: number, duel: string | null = null, delayMs = 0): Climb {
  return { line, next: 0, grip: rules.gripMax, gripAt: now + delayMs, readyAt: now + delayMs, check: null, startedAt: null, phase: 'climbing', lowerFrom: 0, lowerStartedAt: 0, duel }
}

export function reachTo(line: ClimbLine, hold: number): number {
  if (hold <= 0) return 0
  const from = line.holds[hold - 1]
  const to = line.holds[hold]
  return Math.hypot(to.u - from.u, to.y - from.y)
}

export function strainOf(rules: ClimbingRules, reachM: number): number {
  return Math.min(1, Math.max(0, (reachM - rules.restReachM) / (rules.strainReachM - rules.restReachM)))
}

export function gripRate(rules: ClimbingRules, climb: Climb): number {
  if (climb.phase !== 'climbing' || climb.next === 0) return 0
  const strain = strainOf(rules, reachTo(climb.line, climb.next - 1))
  return strain === 0 ? rules.regenPerSec : -colourOf(rules, climb.line).drainPerSec * (0.4 + 0.6 * strain)
}

export function gripNow(rules: ClimbingRules, climb: Climb, now: number): number {
  const elapsed = Math.max(0, now - climb.gripAt) / 1000
  return Math.min(rules.gripMax, Math.max(0, climb.grip + gripRate(rules, climb) * elapsed))
}

function settle(rules: ClimbingRules, climb: Climb, now: number): void {
  climb.grip = gripNow(rules, climb, now)
  climb.gripAt = Math.max(climb.gripAt, now)
}

export function reachHold(rules: ClimbingRules, climb: Climb, hold: number, now: number, rng: () => number): ReachOutcome {
  if (climb.phase !== 'climbing' || now < climb.readyAt || climb.check || hold !== climb.next) return 'ignored'
  const colour = colourOf(rules, climb.line)
  const zoneSize = colour.zoneDeg * (1 - rules.check.strainZoneCut * strainOf(rules, reachTo(climb.line, hold)))
  const latest = 360 - rules.check.endMarginDeg - zoneSize
  const zoneStart = rules.check.minStartDeg + rng() * (latest - rules.check.minStartDeg)
  climb.check = { hold, startedAt: now, turnMs: colour.turnMs, zoneStart, zoneSize, greatSize: zoneSize * rules.check.greatShare }
  return 'reach'
}

export function needleAngle(check: Check, now: number): number {
  return ((now - check.startedAt) / check.turnMs) * 360
}

function failCheck(rules: ClimbingRules, climb: Climb, now: number): 'miss' | 'fall' {
  settle(rules, climb, now)
  climb.check = null
  climb.grip = Math.max(0, climb.grip - colourOf(rules, climb.line).lossPerMiss)
  return climb.grip === 0 ? 'fall' : 'miss'
}

export function pressCheck(rules: ClimbingRules, climb: Climb, now: number): CheckOutcome {
  const check = climb.check
  if (climb.phase !== 'climbing' || !check) return 'ignored'
  const angle = needleAngle(check, now)
  const allowance = (rules.check.allowanceMs / check.turnMs) * 360
  if (angle < check.zoneStart || angle > check.zoneStart + check.zoneSize + allowance) return failCheck(rules, climb, now)
  const great = angle <= check.zoneStart + check.greatSize + allowance
  settle(rules, climb, now)
  if (great) climb.grip = Math.min(rules.gripMax, climb.grip + rules.check.greatGrip)
  if (climb.next === 0) climb.startedAt = now
  climb.next += 1
  climb.check = null
  if (climb.next === climb.line.holds.length) return 'top'
  return great ? 'great' : 'hold'
}

export function expire(rules: ClimbingRules, climb: Climb, now: number): 'miss' | 'fall' | null {
  if (climb.phase !== 'climbing') return null
  if (climb.check && now > climb.check.startedAt + climb.check.turnMs + rules.check.allowanceMs) return failCheck(rules, climb, now)
  if (climb.startedAt !== null && now - climb.startedAt > rules.maxClimbMs) return 'fall'
  return gripNow(rules, climb, now) === 0 ? 'fall' : null
}

export function climbTime(climb: Climb, toppedAt: number): number {
  return toppedAt - (climb.startedAt ?? toppedAt)
}

export function startLowering(climb: Climb, fromY: number, now: number): void {
  climb.phase = 'lowering'
  climb.lowerFrom = fromY
  climb.lowerStartedAt = now
}

export function loweredY(rules: ClimbingRules, climb: Climb, now: number): { y: number, done: boolean } {
  const t = Math.min(1, (now - climb.lowerStartedAt) / rules.belayLowerMs)
  const ground = rules.floorY + rules.eyeHeightM
  return t >= 1 ? { y: ground, done: true } : { y: climb.lowerFrom + (ground - climb.lowerFrom) * t, done: false }
}

function facingYaw(face: Face): number {
  const n = NORMALS[face]
  return Math.atan2(n.x, n.z)
}

export function climberPose(rules: ClimbingRules, line: ClimbLine, reached: number): Pose {
  const n = NORMALS[line.face]
  const hold = reached > 0 ? line.holds[reached - 1] : { u: 0, y: 0 }
  const y = rules.floorY + Math.max(rules.eyeHeightM, hold.y - rules.reachBelowM)
  return {
    x: line.base.x + n.z * hold.u + n.x * rules.standoffM,
    y,
    z: line.base.z - n.x * hold.u + n.z * rules.standoffM,
    ry: facingYaw(line.face)
  }
}

export function standingPose(rules: ClimbingRules, line: ClimbLine): Pose {
  const n = NORMALS[line.face]
  const out = rules.standoffM * 2
  return { x: line.base.x + n.x * out, y: rules.floorY + rules.eyeHeightM, z: line.base.z + n.z * out, ry: facingYaw(line.face) }
}

export function nearStart(rules: ClimbingRules, line: ClimbLine, x: number, z: number): boolean {
  const start = standingPose(rules, line)
  return Math.hypot(x - start.x, z - start.z) <= rules.startReachM
}
