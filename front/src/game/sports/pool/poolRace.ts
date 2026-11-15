import { yawTowards } from '../../camera/sportsCamera.ts'

export type SwimmerPhase = 'marks' | 'swimming' | 'finished' | 'disqualified' | 'dnf'
export type StrokeResult = 'perfect' | 'good' | 'miss' | 'stray' | 'false_start' | 'started'
export type Trick = 'twist' | 'somersault' | 'cannonball'

export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface PoolRaceStart {
  venue: string
  distanceM: number
  lengthM: number
  lanes: { sessionId: string; name: string; lane: number }[]
  serverNow: number
}

export interface PoolSwimmerView {
  sessionId: string
  lane: number
  phase: SwimmerPhase
  distanceM: number
  x: number
  z: number
  length: number
  lengths: number
  speedMps: number
  reactionMs: number | null
  timeMs: number | null
}

export interface PoolRaceState {
  venue: string
  clockMs: number | null
  swimmers: PoolSwimmerView[]
}

export interface PoolRaceResultRow {
  sessionId: string
  name: string
  lane: number
  status: SwimmerPhase
  place: number | null
  timeMs: number | null
  reactionMs: number | null
}

export interface PoolRaceResult {
  venue: string
  distanceM: number
  results: PoolRaceResultRow[]
}

export interface PoolDive {
  sessionId: string
  board: string
  heightM: number
  airMs: number
}

export type NoteKind = 'left' | 'right' | 'breath'

export interface RhythmRules {
  leadInMs: number
  intervalMs: [number, number]
  fasterPerNoteMs: number
  breathEvery: number
}

export interface FallingStroke {
  index: number
  kind: NoteKind
  progress: number
}

export interface DiveBoard {
  id: string
  heightM: number
  edgeZone: Rect
}

export interface WaterRect extends Rect {
  floorY: number
}

export interface SwimRules {
  speedMps: number
  fastSpeedMps: number
  verticalMps: number
  floatEyeAboveWaterM: number
  swimEyeMaxAboveWaterM: number
  underwaterEyeBelowWaterM: number
  minEyeAboveFloorM: number
}

export interface PoolRules {
  rhythm: RhythmRules
  startX: number
  turnX: number
  waterY: number
  wadeY: number
  water: WaterRect[]
  exits: Rect[]
  swim: SwimRules
  breathMaxMs: number
  boards: DiveBoard[]
}

export const RESULTS_SHOWN_MS = 10_000
export const SWIMSUIT_WEAR_URL = '/assets/wear/bottom/swimsuit/model.glb'
const SWIMMING_FEET_BELOW = -0.5

export function swimwearOutfit<T extends { top: string | null; bottom: string | null; shoes: string | null; head_accessory: string | null }>(models: T): T {
  return { ...models, top: null, bottom: SWIMSUIT_WEAR_URL, shoes: null, head_accessory: null }
}

export function swimmingAt(rules: PoolRules, x: number, feetY: number, z: number): boolean {
  return feetY < SWIMMING_FEET_BELOW && inWater(rules, x, z)
}
export const EDGE_FEET_TOLERANCE_M = 0.4
const STROKE_LEAD_MS = 1200
const STROKE_TAIL_MS = 270
export const STROKE_SHOWN_MS = 600
export const STROKE_LANE_FLASH_MS = 120

type Json = Record<string, unknown>

function finite(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`pool rules: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

function rect(raw: unknown, what: string): Rect {
  const r = raw as Json | null
  return { minX: finite(r?.minX, `${what}.minX`), maxX: finite(r?.maxX, `${what}.maxX`), minZ: finite(r?.minZ, `${what}.minZ`), maxZ: finite(r?.maxZ, `${what}.maxZ`) }
}

export const TRICK_ACTIONS = { diveTwist: 'twist', diveSomersault: 'somersault', diveCannonball: 'cannonball' } as const
const CANNONBALL_SPLASH = 1.8

export function trickForKey(code: string, matches: (action: keyof typeof TRICK_ACTIONS, code: string) => boolean): Trick | null {
  const action = (Object.keys(TRICK_ACTIONS) as (keyof typeof TRICK_ACTIONS)[]).find((a) => matches(a, code))
  return action ? TRICK_ACTIONS[action] : null
}

export function splashScale(heightM: number, trick: Trick | null): number {
  return (1 + heightM / 5) * (trick === 'cannonball' ? CANNONBALL_SPLASH : 1)
}

export function parsePoolRules(swimming: unknown, diving: unknown): PoolRules {
  const s = swimming as Json | null
  const d = diving as Json | null
  const pool = s?.pool as Json | undefined
  const rhythm = s?.rhythm as Json | undefined
  const interval = rhythm?.intervalMs
  const swim = s?.swim as Json | undefined
  const breath = s?.breath as Json | undefined
  if (s?.status !== 'ready' || d?.status !== 'ready' || !pool || !rhythm || !swim || !breath) throw new Error('pool rules: swimming or diving rules are not ready')
  if (!Array.isArray(pool.waterVolume) || !Array.isArray(pool.exits) || !Array.isArray(d.boards)) throw new Error('pool rules: missing water, exits or boards')
  if (!Array.isArray(interval) || interval.length !== 2) throw new Error('pool rules: invalid rhythm.intervalMs')
  return {
    rhythm: {
      leadInMs: finite(rhythm.leadInMs, 'rhythm.leadInMs'),
      intervalMs: [finite(interval[0], 'rhythm.intervalMs'), finite(interval[1], 'rhythm.intervalMs')],
      fasterPerNoteMs: finite(rhythm.fasterPerNoteMs, 'rhythm.fasterPerNoteMs'),
      breathEvery: finite(rhythm.breathEvery, 'rhythm.breathEvery'),
    },
    startX: finite(pool.startX, 'startX'),
    turnX: finite(pool.turnX, 'turnX'),
    waterY: finite(pool.waterY, 'waterY'),
    wadeY: finite(pool.wadeY, 'wadeY'),
    water: pool.waterVolume.map((w, i) => ({ ...rect(w, `waterVolume[${i}]`), floorY: finite((w as Json).floorY, `waterVolume[${i}].floorY`) })),
    exits: pool.exits.map((e, i) => rect(e, `exits[${i}]`)),
    swim: {
      speedMps: finite(swim.speedMps, 'swim.speedMps'),
      fastSpeedMps: finite(swim.fastSpeedMps, 'swim.fastSpeedMps'),
      verticalMps: finite(swim.verticalMps, 'swim.verticalMps'),
      floatEyeAboveWaterM: finite(swim.floatEyeAboveWaterM, 'swim.floatEyeAboveWaterM'),
      swimEyeMaxAboveWaterM: finite(swim.swimEyeMaxAboveWaterM, 'swim.swimEyeMaxAboveWaterM'),
      underwaterEyeBelowWaterM: finite(swim.underwaterEyeBelowWaterM, 'swim.underwaterEyeBelowWaterM'),
      minEyeAboveFloorM: finite(swim.minEyeAboveFloorM, 'swim.minEyeAboveFloorM'),
    },
    breathMaxMs: finite(breath.maxMs, 'breath.maxMs'),
    boards: d.boards.map((b: Json, i: number) => ({ id: String(b.id), heightM: finite(b.heightM, `boards[${i}].heightM`), edgeZone: rect(b.edgeZone, `boards[${i}].edgeZone`) })),
  }
}

function inside(r: Rect, x: number, z: number): boolean {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ
}

export function inWater(rules: PoolRules, x: number, z: number): boolean {
  return rules.water.some((r) => inside(r, x, z))
}

export function boardEdgeAt(rules: PoolRules, x: number, z: number, feetY: number): DiveBoard | null {
  return rules.boards.find((b) => inside(b.edgeZone, x, z) && Math.abs(feetY - b.heightM) <= EDGE_FEET_TOLERANCE_M) ?? null
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

export function fallingStrokes(rhythm: RhythmRules, raceMs: number, judged: ReadonlySet<number>): FallingStroke[] {
  const shown: FallingStroke[] = []
  for (let index = 0; ; index += 1) {
    const t = noteTimeMs(rhythm, index)
    if (t > raceMs + STROKE_LEAD_MS) return shown
    if (judged.has(index) || t < raceMs - STROKE_TAIL_MS) continue
    shown.push({ index, kind: noteKind(rhythm, index), progress: 1 - (t - raceMs) / STROKE_LEAD_MS })
  }
}

export function swimYaw(rules: Pick<PoolRules, 'startX' | 'turnX'>, length: number): number {
  const outbound = length % 2 === 1
  return yawTowards({ x: outbound ? rules.startX : rules.turnX, z: 0 }, { x: outbound ? rules.turnX : rules.startX, z: 0 })
}

export function noteForKey(code: string, matches: (action: 'moveLeft' | 'moveRight' | 'jump', code: string) => boolean): NoteKind | null {
  if (code === 'ArrowLeft' || matches('moveLeft', code)) return 'left'
  if (code === 'ArrowRight' || matches('moveRight', code)) return 'right'
  return matches('jump', code) ? 'breath' : null
}

export function formatRaceTime(ms: number | null): string {
  if (ms === null) return '--'
  const total = Math.max(0, ms) / 1000
  const minutes = Math.floor(total / 60)
  const seconds = (total - minutes * 60).toFixed(2).padStart(5, '0')
  return minutes > 0 ? `${minutes}:${seconds}` : total.toFixed(2)
}

export function mySwimmer(state: PoolRaceState | null, sessionId: string | null): PoolSwimmerView | null {
  return state?.swimmers.find((s) => s.sessionId === sessionId) ?? null
}

export function racingPhase(phase: SwimmerPhase | null | undefined): boolean {
  return phase === 'marks' || phase === 'swimming'
}

export function approach(current: number, target: number, maxStep: number): number {
  const delta = target - current
  return Math.abs(delta) <= maxStep ? target : current + Math.sign(delta) * maxStep
}
