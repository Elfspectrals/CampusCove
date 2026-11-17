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
  tackle: { reachM: number, coneDeg: number, cooldownMs: number, groundMs: number, slideFromMps: number }
  standingTackle: { reachM: number, coneDeg: number, cooldownMs: number }
  through: { leadM: number, speed: number }
  passAssist: PassAssist
  lob: { holdMs: number, chargeMs: number, angleDeg: number, rangeM: [number, number] }
  sprintCarry: { extraM: number, speedMps: [number, number] }
  shotAssist: { maxOffM: number, insidePostM: number }
  overcharge: { from: number, lift: number }
  kickIgnoreMs: number
  restartMs: number
  halvesByDurationSec: Record<string, number>
}

export interface PassAssist {
  coneDeg: number
  maxM: number
  speedPerM: number
  maxSpeed: number
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
  shotMeter: { riseMs: number, windowNear: number, windowFar: number, farDistanceM: number, perfectShare: number }
  shotAngleDeg: number
  aimAssistMax: number
  missAimAssist: number
  missReachError: number
  dunkRangeM: number
  dunkSpeed: number
  dunkChance: number
  passAssist: PassAssist
  contest: { reachM: number, tightM: number, minShare: number }
  layup: { rangeM: number, speedMps: number, chance: number, contestedChance: number }
  turboDunk: { rangeM: number, speedMps: number }
  shove: { reachM: number, coneDeg: number, downMs: number, cooldownMs: number, ballSpeed: number }
  fire: { baskets: number, windowFactor: number }
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

function passAssist(raw: Raw, sport: string): PassAssist {
  const assist = block(raw, 'passAssist', sport)
  return {
    coneDeg: positive(assist.coneDeg, `${sport}.passAssist.coneDeg`),
    maxM: positive(assist.maxM, `${sport}.passAssist.maxM`),
    speedPerM: positive(assist.speedPerM, `${sport}.passAssist.speedPerM`),
    maxSpeed: positive(assist.maxSpeed, `${sport}.passAssist.maxSpeed`)
  }
}

export function parseFootballRules(raw: unknown): FootballRules {
  const r = (raw ?? {}) as Raw
  const tackle = block(r, 'tackle', 'football')
  const standing = block(r, 'standingTackle', 'football')
  const through = block(r, 'through', 'football')
  const lob = block(r, 'lob', 'football')
  const sprintCarry = block(r, 'sprintCarry', 'football')
  const shotAssist = block(r, 'shotAssist', 'football')
  const overcharge = block(r, 'overcharge', 'football')
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
      groundMs: positive(tackle.groundMs, 'football.tackle.groundMs'),
      slideFromMps: positive(tackle.slideFromMps, 'football.tackle.slideFromMps')
    },
    standingTackle: {
      reachM: positive(standing.reachM, 'football.standingTackle.reachM'),
      coneDeg: positive(standing.coneDeg, 'football.standingTackle.coneDeg'),
      cooldownMs: positive(standing.cooldownMs, 'football.standingTackle.cooldownMs')
    },
    through: { leadM: positive(through.leadM, 'football.through.leadM'), speed: positive(through.speed, 'football.through.speed') },
    passAssist: passAssist(r, 'football'),
    lob: {
      holdMs: positive(lob.holdMs, 'football.lob.holdMs'),
      chargeMs: positive(lob.chargeMs, 'football.lob.chargeMs'),
      angleDeg: positive(lob.angleDeg, 'football.lob.angleDeg'),
      rangeM: range(lob.rangeM, 'football.lob.rangeM')
    },
    sprintCarry: { extraM: positive(sprintCarry.extraM, 'football.sprintCarry.extraM'), speedMps: range(sprintCarry.speedMps, 'football.sprintCarry.speedMps') },
    shotAssist: { maxOffM: positive(shotAssist.maxOffM, 'football.shotAssist.maxOffM'), insidePostM: positive(shotAssist.insidePostM, 'football.shotAssist.insidePostM') },
    overcharge: { from: fraction(overcharge.from, 'football.overcharge.from'), lift: positive(overcharge.lift, 'football.overcharge.lift') },
    kickIgnoreMs: positive(r.kickIgnoreMs, 'football.kickIgnoreMs'),
    restartMs: positive(r.restartMs, 'football.restartMs'),
    halvesByDurationSec: halves(r, 'football')
  }
}

export function parseBasketballRules(raw: unknown): BasketballRules {
  const r = (raw ?? {}) as Raw
  const meter = block(r, 'shotMeter', 'basketball')
  const shove = block(r, 'shove', 'basketball')
  const turboDunk = block(r, 'turboDunk', 'basketball')
  const fire = block(r, 'fire', 'basketball')
  const contest = block(r, 'contest', 'basketball')
  const layup = block(r, 'layup', 'basketball')
  const contestReachM = positive(contest.reachM, 'basketball.contest.reachM')
  const contestTightM = positive(contest.tightM, 'basketball.contest.tightM')
  if (contestTightM >= contestReachM) throw new Error('basketball.contest.tightM must be under contest.reachM')
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
      farDistanceM: positive(meter.farDistanceM, 'basketball.shotMeter.farDistanceM'),
      perfectShare: fraction(meter.perfectShare, 'basketball.shotMeter.perfectShare')
    },
    shotAngleDeg: positive(r.shotAngleDeg, 'basketball.shotAngleDeg'),
    aimAssistMax: fraction(r.aimAssistMax, 'basketball.aimAssistMax'),
    missAimAssist: fraction(r.missAimAssist, 'basketball.missAimAssist'),
    missReachError: fraction(r.missReachError, 'basketball.missReachError'),
    dunkRangeM: positive(r.dunkRangeM, 'basketball.dunkRangeM'),
    dunkSpeed: positive(r.dunkSpeed, 'basketball.dunkSpeed'),
    dunkChance: fraction(r.dunkChance, 'basketball.dunkChance'),
    passAssist: passAssist(r, 'basketball'),
    contest: { reachM: contestReachM, tightM: contestTightM, minShare: fraction(contest.minShare, 'basketball.contest.minShare') },
    layup: {
      rangeM: positive(layup.rangeM, 'basketball.layup.rangeM'),
      speedMps: positive(layup.speedMps, 'basketball.layup.speedMps'),
      chance: fraction(layup.chance, 'basketball.layup.chance'),
      contestedChance: fraction(layup.contestedChance, 'basketball.layup.contestedChance')
    },
    turboDunk: { rangeM: positive(turboDunk.rangeM, 'basketball.turboDunk.rangeM'), speedMps: positive(turboDunk.speedMps, 'basketball.turboDunk.speedMps') },
    fire: { baskets: positive(fire.baskets, 'basketball.fire.baskets'), windowFactor: positive(fire.windowFactor, 'basketball.fire.windowFactor') },
    shove: {
      reachM: positive(shove.reachM, 'basketball.shove.reachM'),
      coneDeg: positive(shove.coneDeg, 'basketball.shove.coneDeg'),
      downMs: positive(shove.downMs, 'basketball.shove.downMs'),
      cooldownMs: positive(shove.cooldownMs, 'basketball.shove.cooldownMs'),
      ballSpeed: positive(shove.ballSpeed, 'basketball.shove.ballSpeed')
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
