import type { BallSpec } from './gymBall.ts'

export interface FootballRules {
  sport: 'football'
  ball: BallSpec
  carryAheadM: number
  dribbleReachM: number
  pickupHeightM: number
  passSpeed: number
  passLift: number
  shotSpeed: [number, number]
  shotLift: [number, number]
  shotChargeMs: number
  tackle: { reachM: number, coneDeg: number, cooldownMs: number, groundMs: number }
  kickIgnoreMs: number
  restartMs: number
  halvesByDurationSec: Record<string, number>
}

export interface BasketballRules {
  sport: 'basketball'
  ball: BallSpec
  carryAheadM: number
  carryHeightM: number
  catchReachM: number
  catchHeightM: number
  releaseHeightM: number
  passSpeed: number
  passLift: number
  shotMeter: { riseMs: number, windowNear: number, windowFar: number, farDistanceM: number }
  shotAngleDeg: number
  aimAssistMax: number
  dunkRangeM: number
  dunkSpeed: number
  dunkChance: number
  steal: { reachM: number, chance: number, cooldownMs: number }
  blockReachM: number
  blockWindowMs: number
  kickIgnoreMs: number
  restartMs: number
  halvesByDurationSec: Record<string, number>
}

export type GymRules = FootballRules | BasketballRules

type Raw = Record<string, unknown>

function positive(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) throw new Error(`${what}: expected a positive number, got ${JSON.stringify(raw)}`)
  return raw
}

function fraction(raw: unknown, what: string): number {
  const value = positive(raw, what)
  if (value > 1) throw new Error(`${what}: expected a fraction up to 1, got ${value}`)
  return value
}

function range(raw: unknown, what: string): [number, number] {
  if (!Array.isArray(raw) || raw.length !== 2) throw new Error(`${what}: expected [min, max]`)
  const [min, max] = [positive(raw[0], `${what}[0]`), positive(raw[1], `${what}[1]`)]
  if (min >= max) throw new Error(`${what}: min must be below max`)
  return [min, max]
}

function block(raw: Raw, key: string, sport: string): Raw {
  const value = raw[key]
  if (typeof value !== 'object' || value === null) throw new Error(`${sport}.json: missing ${key}`)
  return value as Raw
}

function ballSpec(raw: Raw, sport: string): BallSpec {
  const b = block(raw, 'ball', sport)
  return {
    radius: positive(b.radiusM, `${sport}.ball.radiusM`),
    floorRestitution: fraction(b.restitution, `${sport}.ball.restitution`),
    wallRestitution: fraction(b.wallRestitution, `${sport}.ball.wallRestitution`),
    rimRestitution: fraction(b.rimRestitution, `${sport}.ball.rimRestitution`),
    rollDecel: positive(b.friction, `${sport}.ball.friction`)
  }
}

function halves(raw: Raw, sport: string): Record<string, number> {
  const h = block(raw, 'halvesByDurationSec', sport)
  for (const [k, v] of Object.entries(h)) {
    if (!Number.isInteger(v) || (v as number) < 1 || !/^\d+$/.test(k)) throw new Error(`${sport}.halvesByDurationSec: invalid ${k}`)
  }
  return h as Record<string, number>
}

export function parseFootballRules(raw: unknown): FootballRules {
  const r = (raw ?? {}) as Raw
  const tackle = block(r, 'tackle', 'football')
  return {
    sport: 'football',
    ball: ballSpec(r, 'football'),
    carryAheadM: positive(r.carryAheadM, 'football.carryAheadM'),
    dribbleReachM: positive(r.dribbleReachM, 'football.dribbleReachM'),
    pickupHeightM: positive(r.pickupHeightM, 'football.pickupHeightM'),
    passSpeed: positive(r.passPower, 'football.passPower'),
    passLift: positive(r.passLift, 'football.passLift'),
    shotSpeed: range(r.shotPowerRange, 'football.shotPowerRange'),
    shotLift: range(r.shotLiftRange, 'football.shotLiftRange'),
    shotChargeMs: positive(r.shotChargeMs, 'football.shotChargeMs'),
    tackle: {
      reachM: positive(tackle.reachM, 'football.tackle.reachM'),
      coneDeg: positive(tackle.coneDeg, 'football.tackle.coneDeg'),
      cooldownMs: positive(tackle.cooldownMs, 'football.tackle.cooldownMs'),
      groundMs: positive(tackle.groundMs, 'football.tackle.groundMs')
    },
    kickIgnoreMs: positive(r.kickIgnoreMs, 'football.kickIgnoreMs'),
    restartMs: positive(r.restartMs, 'football.restartMs'),
    halvesByDurationSec: halves(r, 'football')
  }
}

export function parseBasketballRules(raw: unknown): BasketballRules {
  const r = (raw ?? {}) as Raw
  const meter = block(r, 'shotMeter', 'basketball')
  const steal = block(r, 'steal', 'basketball')
  return {
    sport: 'basketball',
    ball: ballSpec(r, 'basketball'),
    carryAheadM: positive(r.carryAheadM, 'basketball.carryAheadM'),
    carryHeightM: positive(r.carryHeightM, 'basketball.carryHeightM'),
    catchReachM: positive(r.catchReachM, 'basketball.catchReachM'),
    catchHeightM: positive(r.catchHeightM, 'basketball.catchHeightM'),
    releaseHeightM: positive(r.releaseHeightM, 'basketball.releaseHeightM'),
    passSpeed: positive(r.passPower, 'basketball.passPower'),
    passLift: positive(r.passLift, 'basketball.passLift'),
    shotMeter: {
      riseMs: positive(meter.riseMs, 'basketball.shotMeter.riseMs'),
      windowNear: fraction(meter.windowNear, 'basketball.shotMeter.windowNear'),
      windowFar: fraction(meter.windowFar, 'basketball.shotMeter.windowFar'),
      farDistanceM: positive(meter.farDistanceM, 'basketball.shotMeter.farDistanceM')
    },
    shotAngleDeg: positive(r.shotAngleDeg, 'basketball.shotAngleDeg'),
    aimAssistMax: fraction(r.aimAssistMax, 'basketball.aimAssistMax'),
    dunkRangeM: positive(r.dunkRangeM, 'basketball.dunkRangeM'),
    dunkSpeed: positive(r.dunkSpeed, 'basketball.dunkSpeed'),
    dunkChance: fraction(r.dunkChance, 'basketball.dunkChance'),
    steal: {
      reachM: positive(steal.reachM, 'basketball.steal.reachM'),
      chance: fraction(steal.chance, 'basketball.steal.chance'),
      cooldownMs: positive(steal.cooldownMs, 'basketball.steal.cooldownMs')
    },
    blockReachM: positive(r.blockReachM, 'basketball.blockReachM'),
    blockWindowMs: positive(r.blockWindowMs, 'basketball.blockWindowMs'),
    kickIgnoreMs: positive(r.kickIgnoreMs, 'basketball.kickIgnoreMs'),
    restartMs: positive(r.restartMs, 'basketball.restartMs'),
    halvesByDurationSec: halves(r, 'basketball')
  }
}

export function halvesOf(rules: GymRules, durationSec: number): number {
  return rules.halvesByDurationSec[String(durationSec)] ?? 1
}

export interface GymPlayerRules {
  minPlayers: number
  rejoinGraceMs: number
  coachId: string
}

export function gymPlayerRules(raw: unknown, sport: string): GymPlayerRules {
  const r = (raw ?? {}) as Raw
  if (!Number.isInteger(r.minPlayers) || (r.minPlayers as number) < 2) throw new Error(`${sport}.json: minPlayers must be an integer of at least 2`)
  if (!Number.isInteger(r.rejoinGraceSec) || (r.rejoinGraceSec as number) < 0) throw new Error(`${sport}.json: invalid rejoinGraceSec`)
  if (typeof r.coachId !== 'string' || !/^[a-z0-9_]+$/.test(r.coachId)) throw new Error(`${sport}.json: invalid coachId`)
  return { minPlayers: r.minPlayers as number, rejoinGraceMs: (r.rejoinGraceSec as number) * 1000, coachId: r.coachId }
}
