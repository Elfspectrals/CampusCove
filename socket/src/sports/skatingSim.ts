import type { Bounds } from '../types.ts'

export interface SkateRules {
  pushGain: number
  goodPushGain: number
  earlyPushGain: number
  rhythmMs: number
  toleranceMs: number
  serverAllowanceMs: number
  friction: number
  brake: number
  maxSpeed: number
  moveMarginM: number
}

export interface RaceOval {
  a: [number, number]
  b: [number, number]
  radius: number
  startLineX: number
  grid: [number, number][]
}

export interface CrashRules {
  speedThreshold: number
  contactRadius: number
  fallMs: number
  immuneMs: number
  bumpDistanceM: number
  bumpSpeedLoss: number
  bumpCooldownMs: number
  boardMarginM: number
}

export interface BalanceRules {
  carveLimit: number
  carveDrainPerUnit: number
  brakeSpeed: number
  brakeDrainPerS: number
  earlyPushLoss: number
  bumpLoss: number
  recoverPerS: number
  minMoveM: number
  reportStep: number
}

export interface SkatingRules {
  rink: Bounds
  oval: RaceOval
  laps: number[]
  maxPlayers: number
  cutPenaltyMs: number
  startCountdownMs: number
  timeLimit: { base: number, perLap: number }
  skate: SkateRules
  crash: CrashRules
  balance: BalanceRules
}

type Json = Record<string, unknown>

function num(value: unknown, what: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new Error(`skating rules: invalid ${what}`)
  return value
}

function point(value: unknown, what: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`skating rules: invalid ${what}`)
  return [num(value[0], what, -Infinity), num(value[1], what, -Infinity)]
}

function obj(value: unknown, what: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`skating rules: missing ${what}`)
  return value as Json
}

export function parseSkatingRules(raw: unknown): SkatingRules {
  const r = obj(raw, 'rules')
  if (r.status !== 'ready') throw new Error('skating rules: status is not ready')
  const b = obj(obj(r.rink, 'rink').bounds, 'rink.bounds')
  const rink = { minX: num(b.minX, 'rink.minX', -Infinity), maxX: num(b.maxX, 'rink.maxX', -Infinity), minZ: num(b.minZ, 'rink.minZ', -Infinity), maxZ: num(b.maxZ, 'rink.maxZ', -Infinity) }
  if (rink.minX >= rink.maxX || rink.minZ >= rink.maxZ) throw new Error('skating rules: empty rink')
  const o = obj(r.raceOval, 'raceOval')
  if (!Array.isArray(o.grid) || o.grid.length === 0) throw new Error('skating rules: missing raceOval.grid')
  const oval: RaceOval = {
    a: point(o.a, 'raceOval.a'),
    b: point(o.b, 'raceOval.b'),
    radius: num(o.radius, 'raceOval.radius', 0.1),
    startLineX: num(o.startLineX, 'raceOval.startLineX', -Infinity),
    grid: o.grid.map((p, i) => point(p, `raceOval.grid[${i}]`))
  }
  const maxPlayers = num(r.maxPlayers, 'maxPlayers', 1)
  if (oval.grid.length < maxPlayers) throw new Error('skating rules: fewer grid spots than maxPlayers')
  if (!Array.isArray(r.lapsChoices) || r.lapsChoices.length === 0) throw new Error('skating rules: missing lapsChoices')
  const s = obj(r.skate, 'skate')
  const c = obj(r.crash, 'crash')
  const t = obj(r.raceTimeLimitMs, 'raceTimeLimitMs')
  const bal = obj(r.balance, 'balance')
  return {
    rink,
    oval,
    laps: r.lapsChoices.map((n) => num(n, 'lapsChoices', 1)),
    maxPlayers,
    cutPenaltyMs: num(r.cutPenaltyMs, 'cutPenaltyMs'),
    startCountdownMs: num(r.startCountdownMs, 'startCountdownMs'),
    timeLimit: { base: num(t.base, 'raceTimeLimitMs.base', 1), perLap: num(t.perLap, 'raceTimeLimitMs.perLap', 1) },
    skate: {
      pushGain: num(s.pushGain, 'skate.pushGain'),
      goodPushGain: num(s.goodPushGain, 'skate.goodPushGain'),
      earlyPushGain: num(s.earlyPushGain, 'skate.earlyPushGain'),
      rhythmMs: num(s.rhythmMs, 'skate.rhythmMs', 1),
      toleranceMs: num(s.toleranceMs, 'skate.toleranceMs'),
      serverAllowanceMs: num(s.serverAllowanceMs, 'skate.serverAllowanceMs'),
      friction: num(s.friction, 'skate.friction'),
      brake: num(s.brake, 'skate.brake', 0.1),
      maxSpeed: num(s.maxSpeed, 'skate.maxSpeed', 0.1),
      moveMarginM: num(s.moveMarginM, 'skate.moveMarginM')
    },
    crash: {
      speedThreshold: num(c.speedThreshold, 'crash.speedThreshold'),
      contactRadius: num(c.contactRadius, 'crash.contactRadius', 0.1),
      fallMs: num(c.fallMs, 'crash.fallMs'),
      immuneMs: num(c.immuneMs, 'crash.immuneMs'),
      bumpDistanceM: num(c.bumpDistanceM, 'crash.bumpDistanceM'),
      bumpSpeedLoss: num(c.bumpSpeedLoss, 'crash.bumpSpeedLoss'),
      bumpCooldownMs: num(c.bumpCooldownMs, 'crash.bumpCooldownMs'),
      boardMarginM: num(c.boardMarginM, 'crash.boardMarginM')
    },
    balance: {
      carveLimit: num(bal.carveLimit, 'balance.carveLimit'),
      carveDrainPerUnit: num(bal.carveDrainPerUnit, 'balance.carveDrainPerUnit'),
      brakeSpeed: num(bal.brakeSpeed, 'balance.brakeSpeed'),
      brakeDrainPerS: num(bal.brakeDrainPerS, 'balance.brakeDrainPerS'),
      earlyPushLoss: num(bal.earlyPushLoss, 'balance.earlyPushLoss'),
      bumpLoss: num(bal.bumpLoss, 'balance.bumpLoss'),
      recoverPerS: num(bal.recoverPerS, 'balance.recoverPerS'),
      minMoveM: num(bal.minMoveM, 'balance.minMoveM'),
      reportStep: num(bal.reportStep, 'balance.reportStep', 0.001)
    }
  }
}

export type PushKind = 'good' | 'normal' | 'early'

export function pushKind(skate: SkateRules, sinceLastPushMs: number | null, toleranceMs: number): PushKind {
  if (sinceLastPushMs === null || sinceLastPushMs > skate.rhythmMs + toleranceMs) return 'normal'
  if (sinceLastPushMs < skate.rhythmMs - toleranceMs) return 'early'
  return 'good'
}

export function pushGain(skate: SkateRules, kind: PushKind): number {
  if (kind === 'good') return skate.goodPushGain
  if (kind === 'early') return skate.earlyPushGain
  return skate.pushGain
}

export interface SpeedState {
  speed: number
  at: number
  braking: boolean
  lastPushAt: number | null
  distance: number
}

export function newSpeedState(now: number): SpeedState {
  return { speed: 0, at: now, braking: false, lastPushAt: null, distance: 0 }
}

export function advanceSpeed(skate: SkateRules, state: SpeedState, now: number): void {
  const dt = Math.max(0, now - state.at) / 1000
  const decel = state.braking ? skate.brake : skate.friction
  const stopAfter = decel > 0 ? state.speed / decel : Infinity
  const t = Math.min(dt, stopAfter)
  state.distance += state.speed * t - (decel * t * t) / 2
  state.speed = Math.max(0, state.speed - decel * t)
  state.at = Math.max(state.at, now)
}

export function applyPush(skate: SkateRules, state: SpeedState, now: number): PushKind {
  advanceSpeed(skate, state, now)
  const kind = pushKind(skate, state.lastPushAt === null ? null : now - state.lastPushAt, skate.toleranceMs + skate.serverAllowanceMs)
  state.speed = Math.min(skate.maxSpeed, state.speed + pushGain(skate, kind))
  state.lastPushAt = now
  return kind
}

export function setBraking(skate: SkateRules, state: SpeedState, braking: boolean, now: number): void {
  advanceSpeed(skate, state, now)
  state.braking = braking
}

export function insideRink(rink: Bounds, x: number, z: number): boolean {
  return x >= rink.minX && x <= rink.maxX && z >= rink.minZ && z <= rink.maxZ
}

export function distanceToSpine(oval: RaceOval, x: number, z: number): number {
  const [ax, az] = oval.a
  const [bx, bz] = oval.b
  const lx = bx - ax
  const lz = bz - az
  const t = Math.max(0, Math.min(1, ((x - ax) * lx + (z - az) * lz) / (lx * lx + lz * lz)))
  return Math.hypot(x - (ax + t * lx), z - (az + t * lz))
}

export function insideCones(oval: RaceOval, x: number, z: number): boolean {
  return distanceToSpine(oval, x, z) < oval.radius
}

function centre(oval: RaceOval): [number, number] {
  return [(oval.a[0] + oval.b[0]) / 2, (oval.a[1] + oval.b[1]) / 2]
}

export function ovalAngle(oval: RaceOval, x: number, z: number): number {
  const [cx, cz] = centre(oval)
  return Math.atan2(z - cz, x - cx)
}

export function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function startProgress(oval: RaceOval, x: number, z: number): number {
  return -wrapAngle(ovalAngle(oval, x, z) - ovalAngle(oval, oval.startLineX, z))
}

export function progressStep(oval: RaceOval, fromX: number, fromZ: number, toX: number, toZ: number): number {
  return -wrapAngle(ovalAngle(oval, toX, toZ) - ovalAngle(oval, fromX, fromZ))
}

export function boardImpactSpeed(rink: Bounds, fromX: number, fromZ: number, toX: number, toZ: number, dtMs: number, margin: number): number {
  if (dtMs <= 0) return 0
  const vx = ((toX - fromX) * 1000) / dtMs
  const vz = ((toZ - fromZ) * 1000) / dtMs
  const towards = [
    toX - rink.minX <= margin ? -vx : 0,
    rink.maxX - toX <= margin ? vx : 0,
    toZ - rink.minZ <= margin ? -vz : 0,
    rink.maxZ - toZ <= margin ? vz : 0
  ]
  return Math.max(0, ...towards)
}

export interface BalanceInput {
  speed: number
  lateral: number
  braking: boolean
}

export function lateralAcceleration(speed: number, fromAngle: number, toAngle: number, dtMs: number): number {
  if (dtMs <= 0) return 0
  return speed * Math.abs(wrapAngle(toAngle - fromAngle)) * 1000 / dtMs
}

export function balanceStep(b: BalanceRules, balance: number, input: BalanceInput, dtMs: number): number {
  const dt = Math.max(0, dtMs) / 1000
  const carve = Math.max(0, input.lateral - b.carveLimit) * b.carveDrainPerUnit
  const brake = input.braking && input.speed > b.brakeSpeed ? b.brakeDrainPerS : 0
  const drain = carve + brake
  return Math.min(1, Math.max(0, balance + (drain > 0 ? -drain : b.recoverPerS) * dt))
}

export const FULL_LAP = 2 * Math.PI

export function lapOf(progress: number, laps: number): number {
  return Math.min(laps, Math.max(1, Math.floor(progress / FULL_LAP) + 1))
}

export function raceTimeLimit(rules: SkatingRules, laps: number): number {
  return rules.timeLimit.base + rules.timeLimit.perLap * laps
}

export interface Finisher {
  accountId: number
  timeMs: number
  signedAt: number
}

export function rankFinishers<T extends Finisher>(finishers: readonly T[]): (T & { place: number })[] {
  return [...finishers].sort((a, b) => a.timeMs - b.timeMs || a.signedAt - b.signedAt).map((f, i) => ({ ...f, place: i + 1 }))
}
