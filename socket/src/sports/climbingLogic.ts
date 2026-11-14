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
  windowMs: number
  lossPerMiss: number
}

export interface ClimbingRules {
  zone: string
  floorY: number
  eyeHeightM: number
  standoffM: number
  reachBelowM: number
  startReachM: number
  leadMs: number
  allowanceMs: number
  duelStartDelayMs: number
  belayLowerMs: number
  gripMax: number
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
  litAt: number
  startedAt: number | null
  phase: ClimbPhase
  lowerFrom: number
  lowerStartedAt: number
  duel: string | null
}

export type ClickOutcome = 'hold' | 'top' | 'miss' | 'fall' | 'ignored'

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
    colours.set(name, { windowMs: positive(r.windowMs, `colours.${name}.windowMs`), lossPerMiss: positive(r.lossPerMiss, `colours.${name}.lossPerMiss`) })
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
  return {
    zone: r.zone,
    floorY: finite(r.floorY, 'floorY'),
    eyeHeightM: positive(r.eyeHeightM, 'eyeHeightM'),
    standoffM: positive(r.standoffM, 'standoffM'),
    reachBelowM: positive(r.reachBelowM, 'reachBelowM'),
    startReachM: positive(r.startReachM, 'startReachM'),
    leadMs: positive(r.leadMs, 'leadMs'),
    allowanceMs: positive(r.allowanceMs, 'allowanceMs'),
    duelStartDelayMs: positive(r.duelStartDelayMs, 'duelStartDelayMs'),
    belayLowerMs: positive(r.belayLowerSec, 'belayLowerSec') * 1000,
    gripMax: positive(grip.max, 'grip.max'),
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
  return { line, next: 0, grip: rules.gripMax, litAt: now + delayMs, startedAt: null, phase: 'climbing', lowerFrom: 0, lowerStartedAt: 0, duel }
}

export function windowOf(rules: ClimbingRules, climb: Climb): { opensAt: number, closesAt: number } {
  const opensAt = climb.litAt + rules.leadMs
  return { opensAt, closesAt: opensAt + colourOf(rules, climb.line).windowMs }
}

function miss(rules: ClimbingRules, climb: Climb, now: number): 'miss' | 'fall' {
  climb.grip = Math.max(0, climb.grip - colourOf(rules, climb.line).lossPerMiss)
  climb.litAt = now
  return climb.grip === 0 ? 'fall' : 'miss'
}

export function clickHold(rules: ClimbingRules, climb: Climb, hold: number, now: number): ClickOutcome {
  if (climb.phase !== 'climbing' || now < climb.litAt) return 'ignored'
  const { opensAt, closesAt } = windowOf(rules, climb)
  if (hold !== climb.next || now < opensAt || now > closesAt + rules.allowanceMs) return miss(rules, climb, now)
  if (climb.next === 0) climb.startedAt = now
  climb.next += 1
  climb.litAt = now
  return climb.next === climb.line.holds.length ? 'top' : 'hold'
}

export function expire(rules: ClimbingRules, climb: Climb, now: number): 'miss' | 'fall' | null {
  if (climb.phase !== 'climbing' || now <= windowOf(rules, climb).closesAt + rules.allowanceMs) return null
  return miss(rules, climb, now)
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
