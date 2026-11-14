export type SwimmerPhase = 'marks' | 'swimming' | 'finished' | 'disqualified' | 'dnf'
export type StrokeResult = 'good' | 'slow' | 'off' | 'false_start' | 'started'
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

export interface StrokeWindow {
  goodCadenceMs: number
  toleranceMs: number
}

export interface DiveBoard {
  id: string
  heightM: number
  edgeZone: Rect
}

export interface PoolRules {
  stroke: StrokeWindow
  waterY: number
  wadeY: number
  water: Rect[]
  boards: DiveBoard[]
  trickKeys: Record<string, Trick>
}

export const RESULTS_SHOWN_MS = 10_000
export const EDGE_FEET_TOLERANCE_M = 0.4
const CADENCE_SPAN = 1.5

type Json = Record<string, unknown>

function finite(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`pool rules: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

function rect(raw: unknown, what: string): Rect {
  const r = raw as Json | null
  return { minX: finite(r?.minX, `${what}.minX`), maxX: finite(r?.maxX, `${what}.maxX`), minZ: finite(r?.minZ, `${what}.minZ`), maxZ: finite(r?.maxZ, `${what}.maxZ`) }
}

const TRICKS: readonly string[] = ['twist', 'somersault', 'cannonball']

export function parsePoolRules(swimming: unknown, diving: unknown): PoolRules {
  const s = swimming as Json | null
  const d = diving as Json | null
  const pool = s?.pool as Json | undefined
  const stroke = s?.stroke as Json | undefined
  if (s?.status !== 'ready' || d?.status !== 'ready' || !pool || !stroke) throw new Error('pool rules: swimming or diving rules are not ready')
  if (!Array.isArray(pool.waterVolume) || !Array.isArray(d.boards)) throw new Error('pool rules: missing water or boards')
  const keys = (d.trickKeys ?? {}) as Json
  const trickKeys: Record<string, Trick> = {}
  for (const [trick, code] of Object.entries(keys)) {
    if (!TRICKS.includes(trick) || typeof code !== 'string') throw new Error(`pool rules: invalid trick key ${trick}`)
    trickKeys[code] = trick as Trick
  }
  return {
    stroke: { goodCadenceMs: finite(stroke.goodCadenceMs, 'goodCadenceMs'), toleranceMs: finite(stroke.toleranceMs, 'toleranceMs') },
    waterY: finite(pool.waterY, 'waterY'),
    wadeY: finite(pool.wadeY, 'wadeY'),
    water: pool.waterVolume.map((w, i) => rect(w, `waterVolume[${i}]`)),
    boards: d.boards.map((b: Json, i: number) => ({ id: String(b.id), heightM: finite(b.heightM, `boards[${i}].heightM`), edgeZone: rect(b.edgeZone, `boards[${i}].edgeZone`) })),
    trickKeys,
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

export function cadenceMeter(sinceStrokeMs: number | null, stroke: StrokeWindow): { fill: number; windowFrom: number; windowTo: number; inWindow: boolean } {
  const span = (stroke.goodCadenceMs + stroke.toleranceMs) * CADENCE_SPAN
  const windowFrom = (stroke.goodCadenceMs - stroke.toleranceMs) / span
  const windowTo = (stroke.goodCadenceMs + stroke.toleranceMs) / span
  const fill = sinceStrokeMs === null ? 0 : Math.min(1, sinceStrokeMs / span)
  return { fill, windowFrom, windowTo, inWindow: fill >= windowFrom && fill <= windowTo }
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
