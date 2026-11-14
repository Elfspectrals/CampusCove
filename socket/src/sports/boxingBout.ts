export const PUNCH_KINDS = ['jab', 'cross', 'hook'] as const
export type PunchKind = typeof PUNCH_KINDS[number]

export interface PunchRules {
  damage: number
  enduranceCost: number
  cooldownMs: number
  reachM: number
  points: number
}

export interface Point3 {
  x: number
  y: number
  z: number
}

export interface BoxingRules {
  zone: string
  coachId: string
  coach: { x: number, z: number }
  ringCentre: Point3
  ringHalfM: number
  corners: Record<Corner, Point3>
  exits: Record<Corner, Point3>
  minPlayers: number
  maxPlayers: number
  rejoinGraceSec: number
  gear: string
  roundsChoices: number[]
  introSec: number
  roundSec: number
  restSec: number
  health: number
  restHealth: number
  endurance: number
  enduranceRegenPerSec: number
  lowEndurance: number
  lowEnduranceSlowdown: number
  punches: Record<PunchKind, PunchRules>
  guard: { damageFactor: number, drainPerSec: number }
  dodge: { cooldownMs: number, windowMs: number, enduranceCost: number }
  knockdown: { countSec: number, maxPerFight: number, getUpPerRound: number, getUpPresses: number, getUpHealth: number, pressGapMs: number }
  hit: { facingCos: number, heightM: number }
}

export type Corner = 'red' | 'blue'
export type BoutPhase = 'intro' | 'round' | 'rest' | 'over'
export type BoutMethod = 'ko' | 'points' | 'draw' | 'forfeit'

export interface Boxer {
  accountId: number
  corner: Corner
  health: number
  endurance: number
  guard: boolean
  nextPunchAt: number
  nextDodgeAt: number
  dodgeUntil: number
  knockdowns: number
  getUpsThisRound: number
  down: { since: number, presses: number, lastPressAt: number } | null
  points: number
}

export interface BoutResult {
  winner: number | null
  method: BoutMethod
}

export interface Bout {
  rules: BoxingRules
  rounds: number
  round: number
  phase: BoutPhase
  phaseEndsAt: number
  updatedAt: number
  boxers: [Boxer, Boxer]
  result: BoutResult | null
}

export type PunchOutcome = 'landed' | 'blocked' | 'dodged' | 'missed'
export type PunchRefusal = 'not_fighting' | 'cooldown' | 'tired' | 'guarding'
export interface PunchReach {
  distM: number
  facingCos: number
  heightM: number
}

function newBoxer(accountId: number, corner: Corner, rules: BoxingRules): Boxer {
  return {
    accountId,
    corner,
    health: rules.health,
    endurance: rules.endurance,
    guard: false,
    nextPunchAt: 0,
    nextDodgeAt: 0,
    dodgeUntil: 0,
    knockdowns: 0,
    getUpsThisRound: 0,
    down: null,
    points: 0
  }
}

export function startBout(rules: BoxingRules, rounds: number, red: number, blue: number, now: number): Bout {
  if (!rules.roundsChoices.includes(rounds)) throw new Error(`boxing: ${rounds} rounds is not offered`)
  if (red === blue) throw new Error('boxing: a boxer cannot fight themself')
  return {
    rules,
    rounds,
    round: 1,
    phase: 'intro',
    phaseEndsAt: now + rules.introSec * 1000,
    updatedAt: now,
    boxers: [newBoxer(red, 'red', rules), newBoxer(blue, 'blue', rules)],
    result: null
  }
}

export function boxerOf(bout: Bout, accountId: number): Boxer | null {
  return bout.boxers.find((b) => b.accountId === accountId) ?? null
}

function opponentOf(bout: Bout, boxer: Boxer): Boxer {
  return bout.boxers[0] === boxer ? bout.boxers[1] : bout.boxers[0]
}

function finish(bout: Bout, result: BoutResult): void {
  bout.phase = 'over'
  bout.result = result
  for (const b of bout.boxers) b.guard = false
}

function decide(bout: Bout): void {
  const [red, blue] = bout.boxers
  if (red.points === blue.points) finish(bout, { winner: null, method: 'draw' })
  else finish(bout, { winner: red.points > blue.points ? red.accountId : blue.accountId, method: 'points' })
}

function someoneDown(bout: Bout): boolean {
  return bout.boxers.some((b) => b.down !== null)
}

function knockOut(bout: Bout, loser: Boxer): void {
  finish(bout, { winner: opponentOf(bout, loser).accountId, method: 'ko' })
}

function updateEndurance(bout: Bout, dtSec: number): void {
  const { rules } = bout
  for (const b of bout.boxers) {
    if (b.down) continue
    if (b.guard) {
      b.endurance = Math.max(0, b.endurance - rules.guard.drainPerSec * dtSec)
      if (b.endurance === 0) b.guard = false
    } else {
      b.endurance = Math.min(rules.endurance, b.endurance + rules.enduranceRegenPerSec * dtSec)
    }
  }
}

function countedOut(bout: Bout, now: number): Boxer | undefined {
  const countMs = bout.rules.knockdown.countSec * 1000
  return bout.boxers.find((b) => b.down && now - b.down.since >= countMs)
}

function startRound(bout: Bout, now: number): void {
  bout.phase = 'round'
  bout.phaseEndsAt = now + bout.rules.roundSec * 1000
  for (const b of bout.boxers) b.getUpsThisRound = 0
}

function startRest(bout: Bout, now: number): void {
  const { rules } = bout
  bout.phase = 'rest'
  bout.phaseEndsAt = now + rules.restSec * 1000
  for (const b of bout.boxers) {
    b.guard = false
    b.endurance = rules.endurance
    b.health = Math.min(rules.health, b.health + rules.restHealth)
  }
}

function advancePhase(bout: Bout, now: number): void {
  if (now < bout.phaseEndsAt || someoneDown(bout)) return
  if (bout.phase === 'intro') startRound(bout, now)
  else if (bout.phase === 'rest') {
    bout.round += 1
    startRound(bout, now)
  } else if (bout.phase === 'round') {
    if (bout.round >= bout.rounds) decide(bout)
    else startRest(bout, now)
  }
}

export function advanceBout(bout: Bout, now: number): void {
  if (bout.phase === 'over') return
  const dtSec = Math.max(0, now - bout.updatedAt) / 1000
  bout.updatedAt = now
  if (bout.phase === 'round') updateEndurance(bout, dtSec)
  const out = countedOut(bout, now)
  if (out) knockOut(bout, out)
  else advancePhase(bout, now)
}

function fighting(bout: Bout, boxer: Boxer): boolean {
  return bout.phase === 'round' && !someoneDown(bout) && boxer.down === null
}

export function punchCooldownMs(rules: BoxingRules, boxer: Boxer, kind: PunchKind): number {
  const base = rules.punches[kind].cooldownMs
  return boxer.endurance < rules.lowEndurance ? Math.round(base * rules.lowEnduranceSlowdown) : base
}

function inReach(rules: BoxingRules, kind: PunchKind, reach: PunchReach): boolean {
  return reach.distM <= rules.punches[kind].reachM && reach.facingCos >= rules.hit.facingCos && reach.heightM <= rules.hit.heightM
}

function knockDown(bout: Bout, boxer: Boxer, now: number): void {
  boxer.health = 0
  boxer.guard = false
  boxer.knockdowns += 1
  if (boxer.knockdowns >= bout.rules.knockdown.maxPerFight) {
    knockOut(bout, boxer)
    return
  }
  boxer.down = { since: now, presses: 0, lastPressAt: 0 }
  opponentOf(bout, boxer).guard = false
}

export function punch(bout: Bout, attacker: Boxer, kind: PunchKind, reach: PunchReach, now: number): PunchOutcome | PunchRefusal {
  if (!fighting(bout, attacker)) return 'not_fighting'
  if (attacker.guard) return 'guarding'
  if (now < attacker.nextPunchAt) return 'cooldown'
  const spec = bout.rules.punches[kind]
  if (attacker.endurance < spec.enduranceCost) return 'tired'
  attacker.endurance -= spec.enduranceCost
  attacker.nextPunchAt = now + punchCooldownMs(bout.rules, attacker, kind)
  const target = opponentOf(bout, attacker)
  if (!inReach(bout.rules, kind, reach)) return 'missed'
  if (now < target.dodgeUntil) return 'dodged'
  if (target.guard) {
    target.health = Math.max(1, target.health - Math.round(spec.damage * bout.rules.guard.damageFactor))
    return 'blocked'
  }
  attacker.points += spec.points
  target.health -= spec.damage
  if (target.health <= 0) knockDown(bout, target, now)
  return 'landed'
}

export function setGuard(bout: Bout, boxer: Boxer, up: boolean): boolean {
  const next = up && fighting(bout, boxer) && boxer.endurance > 0
  if (boxer.guard === next) return false
  boxer.guard = next
  return true
}

export function dodge(bout: Bout, boxer: Boxer, now: number): boolean {
  const spec = bout.rules.dodge
  if (!fighting(bout, boxer) || boxer.guard || now < boxer.nextDodgeAt || boxer.endurance < spec.enduranceCost) return false
  boxer.endurance -= spec.enduranceCost
  boxer.nextDodgeAt = now + spec.cooldownMs
  boxer.dodgeUntil = now + spec.windowMs
  return true
}

export function getUpPress(bout: Bout, boxer: Boxer, now: number): boolean {
  const { knockdown } = bout.rules
  if (bout.phase === 'over' || !boxer.down || boxer.getUpsThisRound >= knockdown.getUpPerRound) return false
  if (now - boxer.down.lastPressAt < knockdown.pressGapMs) return false
  boxer.down.lastPressAt = now
  boxer.down.presses += 1
  if (boxer.down.presses < knockdown.getUpPresses) return false
  const downFor = now - boxer.down.since
  boxer.down = null
  boxer.getUpsThisRound += 1
  boxer.health = knockdown.getUpHealth
  if (bout.phase === 'round') bout.phaseEndsAt += downFor
  return true
}

export function forfeitBout(bout: Bout, loserAccountId: number): void {
  if (bout.phase === 'over') return
  const loser = boxerOf(bout, loserAccountId)
  if (!loser) return
  finish(bout, { winner: opponentOf(bout, loser).accountId, method: 'forfeit' })
}

export function countEndsAt(bout: Bout, boxer: Boxer): number | null {
  return boxer.down ? boxer.down.since + bout.rules.knockdown.countSec * 1000 : null
}

export function canGetUp(bout: Bout, boxer: Boxer): boolean {
  return boxer.down !== null && boxer.getUpsThisRound < bout.rules.knockdown.getUpPerRound
}

type Json = Record<string, unknown>

function obj(raw: unknown, path: string): Json {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`boxing rules: ${path} must be an object`)
  return raw as Json
}

function num(raw: Json, key: string, path: string, min = 0): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error(`boxing rules: ${path}.${key} must be a number >= ${min}`)
  return value
}

function point(raw: unknown, path: string): { x: number, z: number } {
  const p = obj(raw, path)
  return { x: num(p, 'x', path, -Infinity), z: num(p, 'z', path, -Infinity) }
}

function point3(raw: unknown, path: string): Point3 {
  const p = obj(raw, path)
  return { x: num(p, 'x', path, -Infinity), y: num(p, 'y', path, -Infinity), z: num(p, 'z', path, -Infinity) }
}

function str(raw: Json, key: string, path: string): string {
  const value = raw[key]
  if (typeof value !== 'string' || value === '') throw new Error(`boxing rules: ${path}.${key} must be a string`)
  return value
}

function punchRules(raw: unknown, kind: PunchKind): PunchRules {
  const p = obj(raw, `punches.${kind}`)
  const path = `punches.${kind}`
  return {
    damage: num(p, 'damage', path, 1),
    enduranceCost: num(p, 'enduranceCost', path),
    cooldownMs: num(p, 'cooldownMs', path, 1),
    reachM: num(p, 'reachM', path, 0.1),
    points: num(p, 'points', path)
  }
}

function gearOf(raw: unknown): string {
  if (!Array.isArray(raw) || raw.length !== 1 || typeof raw[0] !== 'string' || raw[0] === '') throw new Error('boxing rules: gear must list one item code')
  return raw[0]
}

export function parseBoxingRules(raw: unknown): BoxingRules {
  const r = obj(raw, 'root')
  if (r.status !== 'ready') throw new Error('boxing rules: status is not ready')
  const ring = obj(r.ring, 'ring')
  const corners = obj(r.corners, 'corners')
  const exits = obj(r.exits, 'exits')
  const punches = obj(r.punches, 'punches')
  const guard = obj(r.guard, 'guard')
  const dodgeRules = obj(r.dodge, 'dodge')
  const knockdown = obj(r.knockdown, 'knockdown')
  const hit = obj(r.hit, 'hit')
  const roundsChoices = r.roundsChoices
  if (!Array.isArray(roundsChoices) || roundsChoices.length === 0 || !roundsChoices.every((n) => Number.isInteger(n) && n > 0)) {
    throw new Error('boxing rules: roundsChoices must be positive integers')
  }
  return {
    zone: str(r, 'zone', 'root'),
    coachId: str(r, 'coachId', 'root'),
    coach: point(r.coach, 'coach'),
    ringCentre: point3(ring.centre, 'ring.centre'),
    ringHalfM: num(ring, 'halfM', 'ring', 1),
    corners: { red: point3(corners.red, 'corners.red'), blue: point3(corners.blue, 'corners.blue') },
    exits: { red: point3(exits.red, 'exits.red'), blue: point3(exits.blue, 'exits.blue') },
    minPlayers: num(r, 'minPlayers', 'root', 2),
    maxPlayers: num(r, 'maxPlayers', 'root', 2),
    rejoinGraceSec: num(r, 'rejoinGraceSec', 'root'),
    gear: gearOf(r.gear),
    roundsChoices: roundsChoices as number[],
    introSec: num(r, 'introSec', 'root'),
    roundSec: num(r, 'roundSec', 'root', 1),
    restSec: num(r, 'restSec', 'root'),
    health: num(r, 'health', 'root', 1),
    restHealth: num(r, 'restHealth', 'root'),
    endurance: num(r, 'endurance', 'root', 1),
    enduranceRegenPerSec: num(r, 'enduranceRegenPerSec', 'root'),
    lowEndurance: num(r, 'lowEndurance', 'root'),
    lowEnduranceSlowdown: num(r, 'lowEnduranceSlowdown', 'root', 1),
    punches: { jab: punchRules(punches.jab, 'jab'), cross: punchRules(punches.cross, 'cross'), hook: punchRules(punches.hook, 'hook') },
    guard: { damageFactor: num(guard, 'damageFactor', 'guard'), drainPerSec: num(guard, 'drainPerSec', 'guard') },
    dodge: { cooldownMs: num(dodgeRules, 'cooldownMs', 'dodge', 1), windowMs: num(dodgeRules, 'windowMs', 'dodge'), enduranceCost: num(dodgeRules, 'enduranceCost', 'dodge') },
    knockdown: {
      countSec: num(knockdown, 'countSec', 'knockdown', 1),
      maxPerFight: num(knockdown, 'maxPerFight', 'knockdown', 1),
      getUpPerRound: num(knockdown, 'getUpPerRound', 'knockdown'),
      getUpPresses: num(knockdown, 'getUpPresses', 'knockdown', 1),
      getUpHealth: num(knockdown, 'getUpHealth', 'knockdown', 1),
      pressGapMs: num(knockdown, 'pressGapMs', 'knockdown')
    },
    hit: { facingCos: num(hit, 'facingCos', 'hit', -1), heightM: num(hit, 'heightM', 'hit') }
  }
}
