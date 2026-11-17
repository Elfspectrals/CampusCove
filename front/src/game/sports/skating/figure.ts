export type ElementKind = 'jump' | 'spin' | 'spiral'
export type FigureKey = 'jump' | 'left' | 'right' | 'hold'
export type FigureJudgement = 'perfect' | 'good' | 'miss'

interface FigureElement {
  kind: ElementKind
  atMs: number
  lengthMs: number
}

export interface FigureRoute {
  a: { x: number; z: number }
  b: { x: number; z: number }
  radius: number
  laneOffsetsM: number[]
  lapMs: number
}

export interface FigureRules {
  venue: string
  song: string
  bpm: number
  lengthMs: number
  route: FigureRoute
  elements: FigureElement[]
  airMs: number
  spinPresses: number
}

export interface FigureStartPayload {
  venue: string
  startAt: number
  serverNow: number
  skaters: { sessionId: string; name: string; lane: number }[]
}

export interface FigureSkaterState {
  sessionId: string
  score: number
  next: number
  air: { at: number; rotations: number } | null
  spinning: boolean
  holding: boolean
  out: boolean
}

export interface FigureStatePayload {
  venue: string
  serverNow: number
  startAt: number
  skaters: FigureSkaterState[]
}

export type FigureEventPayload = { venue: string; sessionId: string; score: number } & (
  | { type: 'judge'; index: number; element: ElementKind; judgement: FigureJudgement }
  | { type: 'rotation'; rotations: number }
  | { type: 'spin_press'; presses: number }
  | { type: 'hold'; index: number; judgement: FigureJudgement }
)

export interface FigureEndPayload {
  venue: string
  results: { sessionId: string; name: string; score: number; place: number | null; judged: FigureJudgement[] }[]
}

type Json = Record<string, unknown>

function num(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`figure skating rules: invalid ${what}`)
  return raw
}

function point(raw: unknown, what: string): { x: number; z: number } {
  if (!Array.isArray(raw) || raw.length !== 2) throw new Error(`figure skating rules: invalid ${what}`)
  return { x: num(raw[0], what), z: num(raw[1], what) }
}

export function parseFigureRules(raw: unknown): FigureRules {
  const f = (raw ?? {}) as Json
  const route = (f.route ?? {}) as Json
  if (f.status !== 'ready' || typeof f.venue !== 'string' || typeof f.song !== 'string' || !Array.isArray(f.elements) || !Array.isArray(route.laneOffsetsM)) {
    throw new Error('figure skating rules: not ready, or missing venue, song, elements or route')
  }
  const bpm = num(f.bpm, 'bpm')
  const beatMs = 60_000 / bpm
  return {
    venue: f.venue,
    song: f.song,
    bpm,
    lengthMs: Math.round(num(f.lengthBeats, 'lengthBeats') * beatMs),
    route: {
      a: point(route.a, 'route.a'),
      b: point(route.b, 'route.b'),
      radius: num(route.radius, 'route.radius'),
      laneOffsetsM: route.laneOffsetsM.map((o, i) => num(o, `route.laneOffsetsM[${i}]`)),
      lapMs: Math.round(num(route.lapBeats, 'route.lapBeats') * beatMs),
    },
    elements: f.elements.map((e: Json, i: number) => {
      if (e.kind !== 'jump' && e.kind !== 'spin' && e.kind !== 'spiral') throw new Error(`figure skating rules: invalid elements[${i}].kind`)
      return { kind: e.kind, atMs: Math.round(num(e.beat, `elements[${i}].beat`) * beatMs), lengthMs: e.kind === 'jump' ? 0 : Math.round(num(e.beats, `elements[${i}].beats`) * beatMs) }
    }),
    airMs: num((f.jump as Json | undefined)?.airMs, 'jump.airMs'),
    spinPresses: num((f.spin as Json | undefined)?.maxPresses, 'spin.maxPresses'),
  }
}

export function figurePosition(route: FigureRoute, lane: number, routineMs: number): { x: number; z: number; ry: number } {
  const r = route.radius + (route.laneOffsetsM[lane] ?? 0)
  const straight = Math.hypot(route.b.x - route.a.x, route.b.z - route.a.z)
  const bend = Math.PI * r
  const lap = 2 * straight + 2 * bend
  const fraction = (((Math.max(0, routineMs) / route.lapMs) % 1) + 1) % 1
  const s = fraction * lap
  const yaw = (dx: number, dz: number) => Math.atan2(-dx, -dz)
  if (s < straight) return { x: route.a.x + s, z: route.a.z + r, ry: yaw(1, 0) }
  if (s < straight + bend) {
    const t = (s - straight) / r
    return { x: route.b.x + r * Math.sin(t), z: route.b.z + r * Math.cos(t), ry: yaw(Math.cos(t), -Math.sin(t)) }
  }
  if (s < 2 * straight + bend) return { x: route.b.x - (s - straight - bend), z: route.b.z - r, ry: yaw(-1, 0) }
  const t = (s - 2 * straight - bend) / r
  return { x: route.a.x - r * Math.sin(t), z: route.a.z - r * Math.cos(t), ry: yaw(-Math.cos(t), Math.sin(t)) }
}

const JUMP_HEIGHT_M = 0.6
const SPIN_TURNS_PER_S = 2.2

export interface FigurePose {
  spin: number
  lift: number
}

export function figurePose(rules: FigureRules, skater: Pick<FigureSkaterState, 'air' | 'spinning' | 'next'>, routineMs: number): FigurePose | null {
  if (skater.air) {
    const p = (routineMs - skater.air.at) / rules.airMs
    if (p >= 0 && p <= 1) return { spin: 2 * Math.PI * (1 + skater.air.rotations) * p, lift: 4 * JUMP_HEIGHT_M * p * (1 - p) }
  }
  const element = rules.elements[skater.next]
  if (skater.spinning && element?.kind === 'spin' && routineMs >= element.atMs && routineMs <= element.atMs + element.lengthMs) {
    return { spin: (2 * Math.PI * SPIN_TURNS_PER_S * (routineMs - element.atMs)) / 1000, lift: 0 }
  }
  return null
}

export const PROMPT_LEAD_MS = 2500

export interface FigurePrompt {
  index: number
  kind: ElementKind
  phase: 'coming' | 'now'
  fill: number
}

export function figurePrompt(rules: FigureRules, next: number, routineMs: number): FigurePrompt | null {
  const element = rules.elements[next]
  if (!element || routineMs < element.atMs - PROMPT_LEAD_MS) return null
  if (routineMs < element.atMs) return { index: next, kind: element.kind, phase: 'coming', fill: 1 - (element.atMs - routineMs) / PROMPT_LEAD_MS }
  const fill = element.lengthMs > 0 ? Math.min(1, (routineMs - element.atMs) / element.lengthMs) : 1
  return { index: next, kind: element.kind, phase: 'now', fill }
}

export function figureKeyFor(code: string, matches: (action: 'jump' | 'moveLeft' | 'moveRight' | 'moveForward', code: string) => boolean): FigureKey | null {
  if (matches('jump', code)) return 'jump'
  if (code === 'ArrowLeft' || matches('moveLeft', code)) return 'left'
  if (code === 'ArrowRight' || matches('moveRight', code)) return 'right'
  return code === 'ArrowUp' || matches('moveForward', code) ? 'hold' : null
}
