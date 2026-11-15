import type { Bounds } from '../types.ts'
import { pressError } from './danceGame.ts'

export type NoteKind = 'left' | 'right' | 'breath'
export type SwimmerPhase = 'marks' | 'swimming' | 'finished' | 'disqualified' | 'dnf'
export type StrokeResult = 'perfect' | 'good' | 'miss' | 'stray' | 'false_start' | 'ignored'

export interface StrokeRules {
  boostMps: { perfect: number, good: number }
  missFactor: number
  strayFactor: number
  maxSpeedMps: number
  dragPerS: number
}

export interface RhythmRules {
  leadInMs: number
  intervalMs: [number, number]
  fasterPerNoteMs: number
  breathEvery: number
  windowsMs: { perfect: number, good: number }
  allowanceMs: number
}

export interface StrokeOutcome {
  result: StrokeResult
  index: number | null
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
  rhythm: RhythmRules
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
  nextNote: number
  hit: Set<number>
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

function parseRhythm(raw: unknown): RhythmRules {
  const r = raw as Json | null
  const interval = r?.intervalMs
  const windows = r?.windowsMs as Json | undefined
  if (!Array.isArray(interval) || interval.length !== 2) throw new Error('swimming rules: invalid rhythm.intervalMs')
  const rhythm: RhythmRules = {
    leadInMs: num(r?.leadInMs, 'rhythm.leadInMs'),
    intervalMs: [num(interval[0], 'rhythm.intervalMs', 1), num(interval[1], 'rhythm.intervalMs', 1)],
    fasterPerNoteMs: num(r?.fasterPerNoteMs, 'rhythm.fasterPerNoteMs'),
    breathEvery: num(r?.breathEvery, 'rhythm.breathEvery', 2),
    windowsMs: { perfect: num(windows?.perfect, 'rhythm.windowsMs.perfect'), good: num(windows?.good, 'rhythm.windowsMs.good') },
    allowanceMs: num(r?.allowanceMs, 'rhythm.allowanceMs')
  }
  if (!Number.isInteger(rhythm.breathEvery)) throw new Error('swimming rules: rhythm.breathEvery is not a whole number')
  if (rhythm.intervalMs[0] < rhythm.intervalMs[1]) throw new Error('swimming rules: the rhythm must not slow down')
  if (rhythm.windowsMs.perfect > rhythm.windowsMs.good) throw new Error('swimming rules: the perfect window is wider than the good one')
  if (2 * rhythm.intervalMs[1] <= 2 * rhythm.windowsMs.good + rhythm.allowanceMs) throw new Error('swimming rules: two notes of the same arm can be hit by one press')
  return rhythm
}

export function parsePoolRules(raw: unknown): PoolRules {
  const rules = raw as Json | null
  if (rules?.status !== 'ready') throw new Error('swimming rules: status is not ready')
  const pool = rules.pool as Json | undefined
  const stroke = rules.stroke as Json | undefined
  const boost = stroke?.boostMps as Json | undefined
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
      boostMps: { perfect: num(boost?.perfect, 'boostMps.perfect'), good: num(boost?.good, 'boostMps.good') },
      missFactor: num(stroke.missFactor, 'missFactor'),
      strayFactor: num(stroke.strayFactor, 'strayFactor'),
      maxSpeedMps: num(stroke.maxSpeedMps, 'maxSpeedMps', 0.1),
      dragPerS: num(stroke.dragPerS, 'dragPerS', 0.01),
    },
    rhythm: parseRhythm(rules.rhythm),
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
      nextNote: 0,
      hit: new Set<number>(),
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
  while (noteTimeMs(rules.rhythm, s.nextNote) < (s.reactionMs as number)) s.nextNote += 1
  return 'started'
}

export function noteTimeMs(rhythm: RhythmRules, index: number): number {
  const [first, last] = rhythm.intervalMs
  const shrinking = rhythm.fasterPerNoteMs > 0 ? Math.ceil((first - last) / rhythm.fasterPerNoteMs) : Infinity
  const n = Math.min(index, shrinking)
  return rhythm.leadInMs + n * first - (rhythm.fasterPerNoteMs * n * (n - 1)) / 2 + (index - n) * last
}

export function noteKind(rhythm: RhythmRules, index: number): NoteKind {
  if ((index + 1) % rhythm.breathEvery === 0) return 'breath'
  return (index - Math.floor((index + 1) / rhythm.breathEvery)) % 2 === 0 ? 'left' : 'right'
}

const IGNORED: StrokeOutcome = { result: 'ignored', index: null }

export function pressStroke(race: Race, s: Swimmer, kind: NoteKind, now: number, rules: PoolRules): StrokeOutcome {
  if (s.phase === 'marks') return falseStart(race, s) ? { result: 'false_start', index: null } : IGNORED
  if (s.phase !== 'swimming') return IGNORED
  glide(race, s, now, rules.stroke)
  if (s.phase !== 'swimming') return IGNORED
  const raceMs = now - (race.beepAt as number)
  const { windowsMs, allowanceMs } = rules.rhythm
  for (let index = s.nextNote; noteTimeMs(rules.rhythm, index) - raceMs <= windowsMs.good; index += 1) {
    if (s.hit.has(index) || noteKind(rules.rhythm, index) !== kind) continue
    const error = pressError(noteTimeMs(rules.rhythm, index), raceMs, allowanceMs)
    if (error > windowsMs.good) continue
    const result = error <= windowsMs.perfect ? 'perfect' : 'good'
    s.hit.add(index)
    s.speedMps = Math.min(rules.stroke.maxSpeedMps, s.speedMps + rules.stroke.boostMps[result])
    return { result, index }
  }
  s.speedMps *= rules.stroke.strayFactor
  return { result: 'stray', index: null }
}

function expireNotes(race: Race, s: Swimmer, now: number, rules: PoolRules): number[] {
  if (s.phase !== 'swimming') return []
  const deadline = now - (race.beepAt as number) - rules.rhythm.allowanceMs - rules.rhythm.windowsMs.good
  const missed: number[] = []
  while (noteTimeMs(rules.rhythm, s.nextNote) < deadline) {
    if (!s.hit.delete(s.nextNote)) {
      s.speedMps *= rules.stroke.missFactor
      missed.push(s.nextNote)
    }
    s.nextNote += 1
  }
  return missed
}

export function advanceRace(race: Race, now: number, rules: PoolRules): { swimmer: Swimmer, index: number }[] {
  for (const s of race.swimmers) glide(race, s, now, rules.stroke)
  if (race.beepAt === null) return []
  const missed = race.swimmers.flatMap((s) => expireNotes(race, s, now, rules).map((index) => ({ swimmer: s, index })))
  const limit = race.beepAt + (race.distanceM / rules.lengthM) * rules.timeLimitPerLengthMs
  if (now >= limit) for (const s of race.swimmers) if (s.phase === 'swimming' || s.phase === 'marks') s.phase = 'dnf'
  return missed
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
