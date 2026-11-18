import type { BagCombo, BagRules } from './boxingBag.ts'

export const PUNCH_KINDS = ['jab', 'cross', 'hook', 'uppercut'] as const
export type PunchKind = typeof PUNCH_KINDS[number]
export const BAG_MOVES = [...PUNCH_KINDS, 'dodge_left', 'dodge_right', 'guard'] as const
export type BagMove = typeof BAG_MOVES[number]
export const HANDS = ['left', 'right'] as const
export type Hand = typeof HANDS[number]

export interface Combo {
  id: string
  sequence: PunchKind[]
  bonusDamage: number
  bonusPoints: number
}

export interface PunchRules {
  damage: number
  enduranceCost: number
  cooldownMs: number
  cancelMs: number
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
  punchBags: { x: number, z: number }[]
  bag: BagRules
  bagCombos: BagCombo[]
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
  holdMs: number
  bufferMs: number
  cancel: { damageFactor: number, heavyChargeMs: number }
  combo: { windowMs: number, list: Combo[] }
  guard: { damageFactor: number, drainPerSec: number }
  flurry: { freePunches: number, restMs: number, costStep: number, damageStep: number, minDamage: number }
  parry: { windowMs: number, rearmMs: number, stunMs: number }
  counter: { windowMs: number, damageFactor: number, bonusPoints: number }
  guardBreak: { staggerMs: number, damageFactor: number }
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
  guardSince: number
  parryArmed: boolean
  parryReadyAt: number
  stunnedUntil: number
  counterUntil: number
  countered: boolean
  row: number
  rowUntil: number
  nextPunchAt: number
  cancelAt: number
  nextDodgeAt: number
  dodgeUntil: number
  knockdowns: number
  getUpsThisRound: number
  down: { since: number, presses: number, lastPressAt: number } | null
  points: number
  pressedAt: Record<Hand, number | null>
  charged: Record<Hand, boolean>
  queued: QueuedPunch | null
  chain: PunchKind[]
  chainUntil: number
  combo: string | null
  cancelled: boolean
}

export interface QueuedPunch {
  kind: PunchKind
  at: number
  heldMs: number
}

export interface Released {
  kind: PunchKind
  heldMs: number
  timing: 'now' | 'queued' | 'early'
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

export const HEAVY_PUNCHES: readonly PunchKind[] = ['hook', 'uppercut']
export type PunchOutcome = 'landed' | 'blocked' | 'parried' | 'guard_broken' | 'dodged' | 'missed'
export type PunchRefusal = 'not_fighting' | 'cooldown' | 'tired' | 'guarding' | 'stunned'
export interface PunchTiming {
  at?: number
  heldMs?: number
}
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
    guardSince: 0,
    parryArmed: false,
    parryReadyAt: 0,
    stunnedUntil: 0,
    counterUntil: 0,
    countered: false,
    row: 0,
    rowUntil: 0,
    nextPunchAt: 0,
    cancelAt: 0,
    nextDodgeAt: 0,
    dodgeUntil: 0,
    knockdowns: 0,
    getUpsThisRound: 0,
    down: null,
    points: 0,
    pressedAt: { left: null, right: null },
    charged: { left: false, right: false },
    queued: null,
    chain: [],
    chainUntil: 0,
    combo: null,
    cancelled: false
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

function slowed(rules: BoxingRules, boxer: Boxer, ms: number): number {
  return boxer.endurance < rules.lowEndurance ? Math.round(ms * rules.lowEnduranceSlowdown) : ms
}

export function punchCooldownMs(rules: BoxingRules, boxer: Boxer, kind: PunchKind): number {
  return slowed(rules, boxer, rules.punches[kind].cooldownMs)
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

const MAX_COMBO_LENGTH = 4

export function comboOf(list: Combo[], chain: PunchKind[]): Combo | null {
  return list.find((combo) => combo.sequence.length === chain.length && combo.sequence.every((kind, i) => chain[i] === kind)) ?? null
}

export function continuesString(list: Combo[], chain: PunchKind[], kind: PunchKind): boolean {
  if (chain.length === 0) return false
  const next = [...chain, kind]
  return list.some((combo) => combo.sequence.length >= next.length && next.every((k, i) => combo.sequence[i] === k))
}

function linkOpen(boxer: Boxer, at: number): boolean {
  return boxer.chain.length > 0 && at <= boxer.chainUntil
}

function mayCancel(rules: BoxingRules, boxer: Boxer, kind: PunchKind, at: number, heldMs: number): boolean {
  const charged = !HEAVY_PUNCHES.includes(kind) || heldMs >= rules.holdMs + rules.cancel.heavyChargeMs
  return charged && linkOpen(boxer, at) && continuesString(rules.combo.list, boxer.chain, kind)
}

export function earliestThrowAt(rules: BoxingRules, boxer: Boxer, kind: PunchKind, at: number, heldMs: number): number {
  return mayCancel(rules, boxer, kind, at, heldMs) ? Math.min(boxer.cancelAt, boxer.nextPunchAt) : boxer.nextPunchAt
}

function extendChain(rules: BoxingRules, attacker: Boxer, kind: PunchKind, at: number): Combo | null {
  const links = linkOpen(attacker, at) && continuesString(rules.combo.list, attacker.chain, kind)
  attacker.chain = links ? [...attacker.chain, kind] : [kind]
  return comboOf(rules.combo.list, attacker.chain)
}

export function weariness(rules: BoxingRules, boxer: Boxer, now: number): number {
  const row = now > boxer.rowUntil ? 1 : boxer.row + 1
  return Math.max(0, row - rules.flurry.freePunches)
}

function dropString(boxer: Boxer): void {
  boxer.chain = []
  boxer.queued = null
}

function stun(boxer: Boxer, until: number): void {
  boxer.stunnedUntil = until
  boxer.guard = false
  boxer.chain = []
  boxer.queued = null
  boxer.pressedAt = { left: null, right: null }
}

export function punch(bout: Bout, attacker: Boxer, kind: PunchKind, reach: PunchReach, now: number, timing: PunchTiming = {}): PunchOutcome | PunchRefusal {
  const { rules } = bout
  const at = timing.at ?? now
  attacker.combo = null
  attacker.countered = false
  attacker.cancelled = false
  if (!fighting(bout, attacker)) return 'not_fighting'
  if (now < attacker.stunnedUntil) return 'stunned'
  if (attacker.guard) return 'guarding'
  const cancelled = at < attacker.nextPunchAt && at >= attacker.cancelAt && mayCancel(rules, attacker, kind, at, timing.heldMs ?? Infinity)
  if (at < attacker.nextPunchAt && !cancelled) return 'cooldown'
  const spec = rules.punches[kind]
  const weary = weariness(rules, attacker, at)
  const cost = Math.round(spec.enduranceCost * (1 + rules.flurry.costStep * weary))
  if (attacker.endurance < cost) return 'tired'
  attacker.endurance -= cost
  attacker.nextPunchAt = at + punchCooldownMs(rules, attacker, kind)
  attacker.row = at > attacker.rowUntil ? 1 : attacker.row + 1
  attacker.rowUntil = attacker.nextPunchAt + rules.flurry.restMs
  const countering = now < attacker.counterUntil
  attacker.counterUntil = 0
  const combo = extendChain(rules, attacker, kind, at)
  attacker.cancelAt = at + slowed(rules, attacker, spec.cancelMs)
  attacker.chainUntil = attacker.cancelAt + rules.combo.windowMs
  attacker.cancelled = cancelled
  const target = opponentOf(bout, attacker)
  const outcome = !inReach(rules, kind, reach) ? 'missed' : now < target.dodgeUntil ? 'dodged' : null
  if (outcome) {
    attacker.chain = []
    if (outcome === 'dodged') target.counterUntil = now + rules.counter.windowMs
    return outcome
  }
  attacker.combo = combo?.id ?? null
  const strength = Math.max(rules.flurry.minDamage, 1 - rules.flurry.damageStep * weary) * (countering ? rules.counter.damageFactor : 1) * (cancelled ? rules.cancel.damageFactor : 1)
  const damage = Math.round((spec.damage + (combo?.bonusDamage ?? 0)) * strength)
  if (target.guard) {
    if (target.parryArmed && now - target.guardSince <= rules.parry.windowMs) {
      attacker.combo = null
      stun(attacker, now + rules.parry.stunMs)
      target.counterUntil = now + rules.counter.windowMs
      return 'parried'
    }
    if (HEAVY_PUNCHES.includes(kind)) {
      target.health = Math.max(1, target.health - Math.round(damage * rules.guardBreak.damageFactor))
      stun(target, now + rules.guardBreak.staggerMs)
      attacker.chain = []
      return 'guard_broken'
    }
    target.health = Math.max(1, target.health - Math.round(damage * rules.guard.damageFactor))
    return 'blocked'
  }
  attacker.countered = countering
  attacker.points += spec.points + (combo?.bonusPoints ?? 0) + (countering ? rules.counter.bonusPoints : 0)
  target.health -= damage
  dropString(target)
  if (target.health <= 0) knockDown(bout, target, now)
  return 'landed'
}

export function pressHand(bout: Bout, boxer: Boxer, hand: Hand, now: number): boolean {
  if (!fighting(bout, boxer) || now < boxer.stunnedUntil) return false
  boxer.pressedAt[hand] = now
  boxer.charged[hand] = false
  return true
}

export function releaseHand(bout: Bout, boxer: Boxer, hand: Hand, now: number): Released | null {
  const { rules } = bout
  const pressedAt = boxer.pressedAt[hand]
  if (pressedAt === null) return null
  boxer.pressedAt[hand] = null
  boxer.charged[hand] = false
  const heldMs = now - pressedAt
  const held = heldMs >= rules.holdMs
  const kind: PunchKind = hand === 'left' ? (held ? 'hook' : 'jab') : (held ? 'uppercut' : 'cross')
  const earliest = earliestThrowAt(rules, boxer, kind, now, heldMs)
  if (now >= earliest || !fighting(bout, boxer) || now < boxer.stunnedUntil || boxer.guard) return { kind, heldMs, timing: 'now' }
  if (earliest - now <= rules.bufferMs) {
    boxer.queued = { kind, at: earliest, heldMs }
    return { kind, heldMs, timing: 'queued' }
  }
  boxer.chain = []
  boxer.queued = null
  boxer.row = now > boxer.rowUntil ? 1 : boxer.row + 1
  boxer.rowUntil = Math.max(boxer.rowUntil, now + rules.flurry.restMs)
  return { kind, heldMs, timing: 'early' }
}

export function takeQueued(boxer: Boxer, now: number): QueuedPunch | null {
  const queued = boxer.queued
  if (queued === null || now < queued.at) return null
  boxer.queued = null
  return queued
}

export function newCharges(bout: Bout, now: number): { boxer: Boxer, hand: Hand }[] {
  const charges: { boxer: Boxer, hand: Hand }[] = []
  for (const boxer of bout.boxers) {
    for (const hand of HANDS) {
      const pressedAt = boxer.pressedAt[hand]
      if (pressedAt === null || boxer.charged[hand] || now - pressedAt < bout.rules.holdMs || !fighting(bout, boxer)) continue
      boxer.charged[hand] = true
      charges.push({ boxer, hand })
    }
  }
  return charges
}

export function setGuard(bout: Bout, boxer: Boxer, up: boolean, now: number): boolean {
  const next = up && fighting(bout, boxer) && boxer.endurance > 0 && now >= boxer.stunnedUntil
  if (boxer.guard === next) return false
  boxer.guard = next
  if (next) {
    dropString(boxer)
    boxer.guardSince = now
    boxer.parryArmed = now >= boxer.parryReadyAt
  } else {
    boxer.parryReadyAt = now + bout.rules.parry.rearmMs
  }
  return true
}

export function dodge(bout: Bout, boxer: Boxer, now: number): boolean {
  const spec = bout.rules.dodge
  if (!fighting(bout, boxer) || boxer.guard || now < boxer.stunnedUntil || now < boxer.nextDodgeAt || boxer.endurance < spec.enduranceCost) return false
  boxer.endurance -= spec.enduranceCost
  dropString(boxer)
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

function cancelMsOf(p: Json, path: string): number {
  const cancelMs = num(p, 'cancelMs', path, 1)
  if (cancelMs > num(p, 'cooldownMs', path, 1)) throw new Error(`boxing rules: ${path}.cancelMs must not exceed cooldownMs`)
  return cancelMs
}

function punchRules(raw: unknown, kind: PunchKind): PunchRules {
  const p = obj(raw, `punches.${kind}`)
  const path = `punches.${kind}`
  return {
    damage: num(p, 'damage', path, 1),
    enduranceCost: num(p, 'enduranceCost', path),
    cooldownMs: num(p, 'cooldownMs', path, 1),
    cancelMs: cancelMsOf(p, path),
    reachM: num(p, 'reachM', path, 0.1),
    points: num(p, 'points', path)
  }
}

function combosOf(raw: unknown): Combo[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('boxing rules: combo.list must list the combos')
  return raw.map((entry, i) => {
    const path = `combo.list.${i}`
    const c = obj(entry, path)
    const sequence = c.sequence
    if (!Array.isArray(sequence) || sequence.length < 2 || !sequence.every((k) => PUNCH_KINDS.includes(k as PunchKind))) {
      throw new Error(`boxing rules: ${path}.sequence must list at least two punch kinds`)
    }
    if (sequence.length > MAX_COMBO_LENGTH) throw new Error(`boxing rules: ${path}.sequence is longer than ${MAX_COMBO_LENGTH}`)
    return { id: str(c, 'id', path), sequence: sequence as PunchKind[], bonusDamage: num(c, 'bonusDamage', path), bonusPoints: num(c, 'bonusPoints', path) }
  })
}

function bagCombosOf(raw: unknown, bout: readonly Combo[]): BagCombo[] {
  if (!Array.isArray(raw)) throw new Error('boxing rules: bag.extra must list the training combos')
  const extra = raw.map((entry, i) => {
    const path = `bag.extra.${i}`
    const c = obj(entry, path)
    const sequence = c.sequence
    if (!Array.isArray(sequence) || sequence.length < 2 || !sequence.every((m) => BAG_MOVES.includes(m as BagMove))) {
      throw new Error(`boxing rules: ${path}.sequence must list at least two bag moves`)
    }
    return { id: str(c, 'id', path), sequence: sequence as BagMove[] }
  })
  const all = [...bout.map(({ id, sequence }) => ({ id, sequence: [...sequence] as BagMove[] })), ...extra]
  if (new Set(all.map((c) => c.id)).size !== all.length) throw new Error('boxing rules: a bag combo id is used twice')
  return all
}

function bagsOf(raw: unknown): { x: number, z: number }[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('boxing rules: punchBags must list the bags')
  return raw.map((bag, i) => point(bag, `punchBags.${i}`))
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
  const bag = obj(r.bag, 'bag')
  const guard = obj(r.guard, 'guard')
  const dodgeRules = obj(r.dodge, 'dodge')
  const flurry = obj(r.flurry, 'flurry')
  const parry = obj(r.parry, 'parry')
  const counter = obj(r.counter, 'counter')
  const guardBreak = obj(r.guardBreak, 'guardBreak')
  const knockdown = obj(r.knockdown, 'knockdown')
  const hit = obj(r.hit, 'hit')
  const hold = obj(r.hold, 'hold')
  const combo = obj(r.combo, 'combo')
  const cancel = obj(r.cancel, 'cancel')
  const boutCombos = combosOf(combo.list)
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
    punchBags: bagsOf(r.punchBags),
    bag: {
      roundSec: num(bag, 'roundSec', 'bag', 1),
      windowMs: num(bag, 'windowMs', 'bag', 1),
      leaveM: num(bag, 'leaveM', 'bag'),
      pointsPerPunch: num(bag, 'pointsPerPunch', 'bag', 1),
      streakForDouble: num(bag, 'streakForDouble', 'bag', 1)
    },
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
    punches: { jab: punchRules(punches.jab, 'jab'), cross: punchRules(punches.cross, 'cross'), hook: punchRules(punches.hook, 'hook'), uppercut: punchRules(punches.uppercut, 'uppercut') },
    holdMs: num(hold, 'ms', 'hold', 1),
    bufferMs: num(r, 'bufferMs', 'root'),
    cancel: { damageFactor: num(cancel, 'damageFactor', 'cancel'), heavyChargeMs: num(cancel, 'heavyChargeMs', 'cancel') },
    combo: { windowMs: num(combo, 'windowMs', 'combo'), list: boutCombos },
    bagCombos: bagCombosOf(bag.extra, boutCombos),
    guard: { damageFactor: num(guard, 'damageFactor', 'guard'), drainPerSec: num(guard, 'drainPerSec', 'guard') },
    flurry: {
      freePunches: num(flurry, 'freePunches', 'flurry', 1),
      restMs: num(flurry, 'restMs', 'flurry', 1),
      costStep: num(flurry, 'costStep', 'flurry'),
      damageStep: num(flurry, 'damageStep', 'flurry'),
      minDamage: num(flurry, 'minDamage', 'flurry')
    },
    parry: { windowMs: num(parry, 'windowMs', 'parry', 1), rearmMs: num(parry, 'rearmMs', 'parry'), stunMs: num(parry, 'stunMs', 'parry', 1) },
    counter: { windowMs: num(counter, 'windowMs', 'counter', 1), damageFactor: num(counter, 'damageFactor', 'counter', 1), bonusPoints: num(counter, 'bonusPoints', 'counter') },
    guardBreak: { staggerMs: num(guardBreak, 'staggerMs', 'guardBreak', 1), damageFactor: num(guardBreak, 'damageFactor', 'guardBreak') },
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
