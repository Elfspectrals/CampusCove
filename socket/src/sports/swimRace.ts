import type { Bounds } from '../types.ts'

export type StrokeSide = 'left' | 'right'
export type SwimmerPhase = 'marks' | 'swimming' | 'finished' | 'disqualified' | 'dnf'
export type StrokeResult = 'good' | 'slow' | 'off' | 'false_start' | 'ignored'

export interface StrokeRules {
  goodCadenceMs: number
  toleranceMs: number
  boostMps: number
  slowBoostMps: number
  offStepFactor: number
  maxSpeedMps: number
  dragPerS: number
}

export interface DiveRules {
  glideM: number
  speedMps: number
}

export interface Lane {
  lane: number
  z: number
  block: [number, number, number]
}

export interface WaterRect extends Bounds {
  floorY: number
}

export interface PoolRules {
  lengthM: number
  startX: number
  turnX: number
  lanes: Lane[]
  water: WaterRect[]
  exits: Bounds[]
  waterY: number
  deckY: number
  wadeY: number
  distancesM: number[]
  beepDelayMs: [number, number]
  stroke: StrokeRules
  dive: DiveRules
  timeLimitPerLengthMs: number
}

export interface Swimmer {
  accountId: number
  sessionId: string
  name: string
  lane: number
  phase: SwimmerPhase
  distanceM: number
  speedMps: number
  at: number
  lastStrokeAt: number | null
  lastSide: StrokeSide | null
  reactionMs: number | null
  timeMs: number | null
}

export interface Race {
  distanceM: number
  marksAt: number
  beepDueAt: number
  beepAt: number | null
  swimmers: Swimmer[]
}

type Json = Record<string, unknown>

function num(raw: unknown, what: string, min = 0): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < min) throw new Error(`swimming rules: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

function bounds(raw: unknown, what: string): Bounds {
  const b = raw as Json | null
  const out = { minX: num(b?.minX, `${what}.minX`, -Infinity), maxX: num(b?.maxX, `${what}.maxX`, -Infinity), minZ: num(b?.minZ, `${what}.minZ`, -Infinity), maxZ: num(b?.maxZ, `${what}.maxZ`, -Infinity) }
  if (out.minX >= out.maxX || out.minZ >= out.maxZ) throw new Error(`swimming rules: ${what} is empty`)
  return out
}

export function parsePoolRules(raw: unknown): PoolRules {
  const rules = raw as Json | null
  if (rules?.status !== 'ready') throw new Error('swimming rules: status is not ready')
  const pool = rules.pool as Json | undefined
  const stroke = rules.stroke as Json | undefined
  const dive = rules.dive as Json | undefined
  const delay = rules.startBeepDelayRangeMs
  if (!pool || !stroke || !dive) throw new Error('swimming rules: missing pool, stroke or dive block')
  if (!Array.isArray(delay) || delay.length !== 2 || num(delay[0], 'beep delay', 0) > num(delay[1], 'beep delay', 0)) throw new Error('swimming rules: invalid startBeepDelayRangeMs')
  if (!Array.isArray(pool.lanePositions) || !Array.isArray(pool.blockPositions) || pool.lanePositions.length !== pool.blockPositions.length || pool.lanePositions.length === 0) {
    throw new Error('swimming rules: lane and block positions do not match')
  }
  const lanes = pool.lanePositions.map((l: Json, i: number): Lane => {
    const block = (pool.blockPositions as unknown[])[i]
    if (!Array.isArray(block) || block.length !== 3) throw new Error(`swimming rules: invalid block ${i}`)
    return { lane: num(l.lane, 'lane', 1), z: num(l.z, 'lane z', -Infinity), block: block.map((v) => num(v, 'block', -Infinity)) as [number, number, number] }
  })
  if (!Array.isArray(pool.waterVolume) || pool.waterVolume.length === 0) throw new Error('swimming rules: missing waterVolume')
  if (!Array.isArray(rules.distancesM) || rules.distancesM.length === 0) throw new Error('swimming rules: missing distancesM')
  const lengthM = num(pool.lengthM, 'lengthM', 1)
  const distancesM = rules.distancesM.map((d) => num(d, 'distance', lengthM))
  if (distancesM.some((d) => d % lengthM !== 0)) throw new Error('swimming rules: a distance is not a whole number of lengths')
  const waterY = num(pool.waterY, 'waterY', -Infinity)
  if (pool.waterVolume.some((b) => num((b as Json).floorY, 'floorY', -Infinity) >= waterY)) throw new Error('swimming rules: a pool floor is not under the water')
  const startX = num(pool.startX, 'startX', -Infinity)
  const turnX = num(pool.turnX, 'turnX', -Infinity)
  if (Math.abs(Math.abs(startX - turnX) - lengthM) > 1e-6) throw new Error('swimming rules: startX and turnX are not one length apart')
  return {
    lengthM,
    startX,
    turnX,
    lanes,
    water: pool.waterVolume.map((b, i) => ({ ...bounds(b, `waterVolume[${i}]`), floorY: num((b as Json).floorY, `waterVolume[${i}].floorY`, -Infinity) })),
    exits: Array.isArray(pool.exits) ? pool.exits.map((b, i) => bounds(b, `exits[${i}]`)) : [],
    waterY,
    deckY: num(pool.deckY, 'deckY', -Infinity),
    wadeY: num(pool.wadeY, 'wadeY', -Infinity),
    distancesM,
    beepDelayMs: [delay[0] as number, delay[1] as number],
    stroke: {
      goodCadenceMs: num(stroke.goodCadenceMs, 'goodCadenceMs', 1),
      toleranceMs: num(stroke.toleranceMs, 'toleranceMs'),
      boostMps: num(stroke.boostMps, 'boostMps'),
      slowBoostMps: num(stroke.slowBoostMps, 'slowBoostMps'),
      offStepFactor: num(stroke.offStepFactor, 'offStepFactor'),
      maxSpeedMps: num(stroke.maxSpeedMps, 'maxSpeedMps', 0.1),
      dragPerS: num(stroke.dragPerS, 'dragPerS', 0.01),
    },
    dive: { glideM: num(dive.glideM, 'glideM'), speedMps: num(dive.speedMps, 'speedMps') },
    timeLimitPerLengthMs: num(rules.timeLimitPerLengthMs, 'timeLimitPerLengthMs', 1000),
  }
}

export function createRace(entrants: { accountId: number, sessionId: string, name: string }[], distanceM: number, now: number, beepDelayMs: number): Race {
  return {
    distanceM,
    marksAt: now,
    beepDueAt: now + beepDelayMs,
    beepAt: null,
    swimmers: entrants.map((e, i) => ({
      ...e,
      lane: i + 1,
      phase: 'marks',
      distanceM: 0,
      speedMps: 0,
      at: now,
      lastStrokeAt: null,
      lastSide: null,
      reactionMs: null,
      timeMs: null,
    })),
  }
}

export function swimmerOf(race: Race, accountId: number): Swimmer | null {
  return race.swimmers.find((s) => s.accountId === accountId) ?? null
}

function finishTimeMs(race: Race, s: Swimmer, rules: StrokeRules): number | null {
  const left = race.distanceM - s.distanceM
  if (left <= 0) return 0
  const k = rules.dragPerS
  const reach = s.speedMps / k
  if (reach <= left) return null
  return (-Math.log(1 - left / reach) / k) * 1000
}

function glide(race: Race, s: Swimmer, until: number, rules: StrokeRules): void {
  if (s.phase !== 'swimming' || until <= s.at) return
  const toFinish = finishTimeMs(race, s, rules)
  const dtMs = until - s.at
  if (toFinish !== null && toFinish <= dtMs) {
    s.distanceM = race.distanceM
    s.speedMps *= Math.exp(-rules.dragPerS * toFinish / 1000)
    s.phase = 'finished'
    s.timeMs = Math.round(s.at + toFinish - (race.beepAt as number))
    s.at = until
    return
  }
  const k = rules.dragPerS
  const decay = Math.exp(-k * dtMs / 1000)
  s.distanceM += (s.speedMps * (1 - decay)) / k
  s.speedMps *= decay
  s.at = until
}

export function fireBeep(race: Race, now: number): boolean {
  if (race.beepAt !== null || now < race.beepDueAt) return false
  race.beepAt = now
  return true
}

function falseStart(race: Race, s: Swimmer): boolean {
  if (race.beepAt !== null) return false
  s.phase = 'disqualified'
  return true
}

export function pressDive(race: Race, s: Swimmer, now: number, rules: PoolRules): 'started' | 'false_start' | 'ignored' {
  if (s.phase !== 'marks') return 'ignored'
  if (falseStart(race, s)) return 'false_start'
  s.phase = 'swimming'
  s.reactionMs = now - (race.beepAt as number)
  s.distanceM = Math.min(rules.dive.glideM, race.distanceM)
  s.speedMps = rules.dive.speedMps
  s.at = now
  return 'started'
}

export function pressStroke(race: Race, s: Swimmer, side: StrokeSide, now: number, rules: PoolRules): StrokeResult {
  if (s.phase === 'marks') return falseStart(race, s) ? 'false_start' : 'ignored'
  if (s.phase !== 'swimming') return 'ignored'
  glide(race, s, now, rules.stroke)
  if (s.phase !== 'swimming') return 'ignored'
  const { goodCadenceMs, toleranceMs, boostMps, slowBoostMps, offStepFactor, maxSpeedMps } = rules.stroke
  const gap = s.lastStrokeAt === null ? goodCadenceMs : now - s.lastStrokeAt
  const sameSide = s.lastSide === side
  s.lastStrokeAt = now
  s.lastSide = side
  if (sameSide || gap < goodCadenceMs - toleranceMs) {
    s.speedMps *= offStepFactor
    return 'off'
  }
  const slow = gap > goodCadenceMs + toleranceMs
  s.speedMps = Math.min(maxSpeedMps, s.speedMps + (slow ? slowBoostMps : boostMps))
  return slow ? 'slow' : 'good'
}

export function advanceRace(race: Race, now: number, rules: PoolRules): void {
  for (const s of race.swimmers) glide(race, s, now, rules.stroke)
  if (race.beepAt === null) return
  const limit = race.beepAt + (race.distanceM / rules.lengthM) * rules.timeLimitPerLengthMs
  if (now < limit) return
  for (const s of race.swimmers) if (s.phase === 'swimming' || s.phase === 'marks') s.phase = 'dnf'
}

export function dropSwimmer(race: Race, accountId: number): void {
  const s = swimmerOf(race, accountId)
  if (s && (s.phase === 'marks' || s.phase === 'swimming')) s.phase = 'dnf'
}

export function raceOver(race: Race): boolean {
  return race.swimmers.every((s) => s.phase !== 'marks' && s.phase !== 'swimming')
}

export function places(race: Race): Map<number, number> {
  const done = race.swimmers.filter((s) => s.phase === 'finished').sort((a, b) => (a.timeMs as number) - (b.timeMs as number))
  const out = new Map<number, number>()
  done.forEach((s, i) => {
    const prev = done[i - 1]
    out.set(s.accountId, prev && prev.timeMs === s.timeMs ? (out.get(prev.accountId) as number) : i + 1)
  })
  return out
}

export function lanePosition(rules: PoolRules, distanceM: number): { x: number, length: number } {
  const L = rules.lengthM
  const length = Math.min(Math.floor(distanceM / L), Math.max(0, Math.ceil(distanceM / L) - 1))
  const within = distanceM - length * L
  const dir = Math.sign(rules.turnX - rules.startX)
  const outbound = length % 2 === 0
  const x = outbound ? rules.startX + dir * within : rules.turnX - dir * within
  return { x, length: length + 1 }
}
