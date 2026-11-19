import type { Bounds } from '../types.ts'
import { type Bout, type Boxer, type Hand, type PunchKind, HEAVY_PUNCHES, earliestThrowAt } from './boxingBout.ts'
import type { RobotLevel } from './robots.ts'

interface RobotSkill {
  reactMs: number
  restMs: number
  comboLength: number
  heavyShare: number
  parryChance: number
  dodgeChance: number
  guardChance: number
  breakGuardAfterMs: number
  speedMps: number
  getUpPressMs: number
  lateMs: number
}

export const BOXING_ROBOT: Record<RobotLevel, RobotSkill> = {
  easy: { reactMs: 650, restMs: 1600, comboLength: 1, heavyShare: 0.15, parryChance: 0, dodgeChance: 0.1, guardChance: 0.15, breakGuardAfterMs: 2500, speedMps: 2.2, getUpPressMs: 320, lateMs: 250 },
  normal: { reactMs: 420, restMs: 1000, comboLength: 2, heavyShare: 0.25, parryChance: 0.25, dodgeChance: 0.3, guardChance: 0.35, breakGuardAfterMs: 1400, speedMps: 3, getUpPressMs: 200, lateMs: 120 },
  hard: { reactMs: 260, restMs: 650, comboLength: 4, heavyShare: 0.3, parryChance: 0.45, dodgeChance: 0.4, guardChance: 0.1, breakGuardAfterMs: 800, speedMps: 3.8, getUpPressMs: 120, lateMs: 40 }
}

const STAND_OFF_M = 1.15
const PUNCH_FROM_M = 1.25
const BREATHER_M = 2.4
const REST_STEP_BACK_M = 0.3
const RING_EDGE_M = 0.5
const TAP_MS = 60
const WIND_UP_EXTRA_MS = 120
const PARRY_HOLD_MS = 240
const GUARD_AFTER_CHARGE_MS = 300
const STRAFE_SHARE = 0.35
const STRAFE_SWITCH_MS = 2000
const SPARE_ENDURANCE = 15
const HANDS_OF: Record<PunchKind, Hand> = { jab: 'left', hook: 'left', cross: 'right', uppercut: 'right' }

type Answer = 'parry' | 'dodge' | 'guard' | 'none'

export interface RobotBrain {
  level: RobotLevel
  thoughtAt: number
  plan: PunchKind[]
  held: { hand: Hand, until: number } | null
  restUntil: number
  guardUntil: number
  charge: { seenAt: number, answer: Answer, done: boolean } | null
  foeGuardSince: number | null
  nextGetUpAt: number
  strafe: 1 | -1
  strafeUntil: number
}

export type RobotAction =
  | { kind: 'move', x: number, z: number, ry: number }
  | { kind: 'press', hand: Hand }
  | { kind: 'release', hand: Hand }
  | { kind: 'guard', up: boolean }
  | { kind: 'dodge', side: 'left' | 'right' }
  | { kind: 'getup' }

export interface RobotSight {
  bout: Bout
  self: Boxer
  foe: Boxer
  at: { x: number, z: number }
  foeAt: { x: number, z: number }
  ring: Bounds
  now: number
  random: () => number
}

export function newRobotBrain(level: RobotLevel, now: number): RobotBrain {
  return { level, thoughtAt: now, plan: [], held: null, restUntil: 0, guardUntil: 0, charge: null, foeGuardSince: null, nextGetUpAt: 0, strafe: 1, strafeUntil: 0 }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function answerTo(skill: RobotSkill, roll: number): Answer {
  if (roll < skill.parryChance) return 'parry'
  if (roll < skill.parryChance + skill.dodgeChance) return 'dodge'
  if (roll < skill.parryChance + skill.dodgeChance + skill.guardChance) return 'guard'
  return 'none'
}

function step(brain: RobotBrain, skill: RobotSkill, sight: RobotSight, dtS: number): Extract<RobotAction, { kind: 'move' }> {
  const { at, foeAt, ring, now, random, self, bout } = sight
  const dx = at.x - foeAt.x
  const dz = at.z - foeAt.z
  const gap = Math.hypot(dx, dz)
  const ax = gap > 0.01 ? dx / gap : 1
  const az = gap > 0.01 ? dz / gap : 0
  if (now >= brain.strafeUntil) {
    brain.strafe = random() < 0.5 ? 1 : -1
    brain.strafeUntil = now + STRAFE_SWITCH_MS
  }
  const tired = self.endurance < bout.rules.lowEndurance
  const resting = now < brain.restUntil && now >= self.counterUntil
  const wanted = tired ? BREATHER_M : resting ? STAND_OFF_M + REST_STEP_BACK_M : STAND_OFF_M
  const goalX = foeAt.x + ax * wanted - az * brain.strafe * STRAFE_SHARE
  const goalZ = foeAt.z + az * wanted + ax * brain.strafe * STRAFE_SHARE
  const toX = goalX - at.x
  const toZ = goalZ - at.z
  const far = Math.hypot(toX, toZ)
  const reach = Math.min(far, skill.speedMps * dtS)
  const x = clamp(at.x + (far > 0.01 ? (toX / far) * reach : 0), ring.minX + RING_EDGE_M, ring.maxX - RING_EDGE_M)
  const z = clamp(at.z + (far > 0.01 ? (toZ / far) * reach : 0), ring.minZ + RING_EDGE_M, ring.maxZ - RING_EDGE_M)
  return { kind: 'move', x, z, ry: Math.atan2(-(foeAt.x - x), -(foeAt.z - z)) }
}

function defend(brain: RobotBrain, skill: RobotSkill, sight: RobotSight, actions: RobotAction[]): void {
  const { foe, self, now, random } = sight
  const charging = foe.charged.left || foe.charged.right
  if (!charging) {
    if (brain.charge && self.guard) brain.guardUntil = Math.min(brain.guardUntil || Infinity, now + GUARD_AFTER_CHARGE_MS)
    brain.charge = null
    return
  }
  brain.charge ??= { seenAt: now, answer: answerTo(skill, random()), done: false }
  const { charge } = brain
  if (now - charge.seenAt < skill.reactMs) return
  if (!charge.done) {
    charge.done = true
    if (charge.answer === 'dodge') actions.push({ kind: 'dodge', side: random() < 0.5 ? 'left' : 'right' })
    if (charge.answer === 'parry' || charge.answer === 'guard') {
      actions.push({ kind: 'guard', up: true })
      brain.guardUntil = charge.answer === 'parry' ? now + PARRY_HOLD_MS : Infinity
    }
    return
  }
  if (charge.answer === 'parry' && self.guard && now >= brain.guardUntil) {
    actions.push({ kind: 'guard', up: false }, { kind: 'dodge', side: random() < 0.5 ? 'left' : 'right' })
    brain.guardUntil = 0
  }
}

function nextPlan(skill: RobotSkill, sight: RobotSight, brain: RobotBrain): PunchKind[] {
  const { bout, foe, self, now, random } = sight
  if (now < self.counterUntil) return ['cross']
  if (foe.guard && brain.foeGuardSince !== null && now - brain.foeGuardSince >= skill.breakGuardAfterMs) return ['hook']
  if (random() < skill.heavyShare) return [random() < 0.5 ? 'hook' : 'uppercut']
  const combos = bout.rules.combo.list.filter((c) => c.sequence.length <= skill.comboLength)
  const pick = combos.length > 0 ? combos[Math.floor(random() * combos.length)] : undefined
  const plan: PunchKind[] = pick ? [...pick.sequence] : [random() < 0.6 ? 'jab' : 'cross']
  const cost = plan.reduce((sum, kind) => sum + bout.rules.punches[kind].enduranceCost, 0)
  return cost + SPARE_ENDURANCE <= self.endurance ? plan : []
}

function attack(brain: RobotBrain, skill: RobotSkill, sight: RobotSight, gap: number, actions: RobotAction[]): void {
  const { bout, self, now, random } = sight
  if (brain.held) {
    if (now < brain.held.until) return
    actions.push({ kind: 'release', hand: brain.held.hand })
    brain.held = null
    if (brain.plan.length === 0) brain.restUntil = now + skill.restMs * (0.7 + 0.6 * random())
    return
  }
  if (self.guard || gap > PUNCH_FROM_M) return
  const countering = now < self.counterUntil
  if (brain.plan.length === 0) {
    if (now < self.nextPunchAt || (now < brain.restUntil && !countering)) return
    brain.plan = nextPlan(skill, sight, brain)
    if (brain.plan.length === 0) {
      brain.restUntil = now + skill.restMs
      if (random() < skill.guardChance) {
        actions.push({ kind: 'guard', up: true })
        brain.guardUntil = now + skill.restMs
      }
      return
    }
  }
  const kind = brain.plan[0] as PunchKind
  const holdMs = HEAVY_PUNCHES.includes(kind) ? bout.rules.holdMs + WIND_UP_EXTRA_MS : TAP_MS
  const releaseAt = now + holdMs
  if (releaseAt < earliestThrowAt(bout.rules, self, kind, releaseAt, holdMs) + skill.lateMs) return
  brain.plan.shift()
  const hand = HANDS_OF[kind]
  actions.push({ kind: 'press', hand })
  brain.held = { hand, until: releaseAt }
}

export function thinkBoxer(brain: RobotBrain, sight: RobotSight): RobotAction[] {
  const { bout, self, foe, now } = sight
  const skill = BOXING_ROBOT[brain.level]
  const dtS = Math.max(0, now - brain.thoughtAt) / 1000
  brain.thoughtAt = now
  const actions: RobotAction[] = []
  if (self.down) {
    if (now >= brain.nextGetUpAt) {
      brain.nextGetUpAt = now + skill.getUpPressMs
      actions.push({ kind: 'getup' })
    }
    return actions
  }
  if (bout.phase !== 'round' || foe.down) {
    if (self.guard) actions.push({ kind: 'guard', up: false })
    if (brain.held) actions.push({ kind: 'release', hand: brain.held.hand })
    Object.assign(brain, { plan: [], held: null, charge: null, guardUntil: 0 })
    return actions
  }
  if (now < self.stunnedUntil) {
    Object.assign(brain, { plan: [], held: null, guardUntil: 0 })
    return actions
  }
  brain.foeGuardSince = foe.guard ? (brain.foeGuardSince ?? now) : null
  const moved = step(brain, skill, sight, dtS)
  actions.push(moved)
  defend(brain, skill, sight, actions)
  if (self.guard && brain.guardUntil !== 0 && now >= brain.guardUntil && !brain.charge) {
    actions.push({ kind: 'guard', up: false })
    brain.guardUntil = 0
  }
  attack(brain, skill, sight, Math.hypot(moved.x - sight.foeAt.x, moved.z - sight.foeAt.z), actions)
  return actions
}
