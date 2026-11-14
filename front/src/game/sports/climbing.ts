export type ClimbFace = 'east' | 'north' | 'south'
export type ClimbPhase = 'climbing' | 'lowering' | 'ended'
export type ClimbResult = 'topped' | 'fell' | 'let_go' | 'cancelled' | 'won' | 'beaten'
export type ClimbEvent = 'start' | 'hold' | 'miss' | 'fall' | 'top' | 'end'

export interface ClimbLine {
  id: string
  kind: 'route' | 'boulder'
  name: string
  colour: string
  hex: string
  base: { x: number; z: number }
  face: ClimbFace
  holds: { u: number; y: number }[]
}

export interface ClimbingSpec {
  floorY: number
  standoffM: number
  startReachM: number
  lines: ClimbLine[]
}

export interface ClimbStatePayload {
  sessionId: string
  line: string
  event: ClimbEvent
  phase: ClimbPhase
  next: number
  holds: number
  grip: number
  gripMax: number
  litAt: number
  opensAt: number
  closesAt: number
  startedAt: number | null
  serverNow: number
  duel: boolean
  result?: ClimbResult
  timeMs?: number
}

export interface ClimbErrorPayload {
  code: string
  message: string
}

const NORMALS: Record<ClimbFace, { x: number; z: number }> = {
  east: { x: 1, z: 0 },
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
}
const HOLD_DEPTH = 0.06

type Json = Record<string, unknown>

function fail(what: string): never {
  throw new Error(`sports/rules/climbing.json: ${what}`)
}

function num(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) fail(`${what} must be a number`)
  return raw
}

function parseLine(raw: unknown, colours: Json): ClimbLine {
  const r = (raw ?? {}) as Json
  if (typeof r.id !== 'string' || typeof r.name !== 'string') fail('a line needs an id and a name')
  if (r.kind !== 'route' && r.kind !== 'boulder') fail(`${r.id}: invalid kind`)
  const colour = typeof r.colour === 'string' ? (colours[r.colour] as Json | undefined) : undefined
  if (!colour || typeof colour.hex !== 'string') fail(`${r.id}: unknown colour`)
  if (r.face !== 'east' && r.face !== 'north' && r.face !== 'south') fail(`${r.id}: invalid face`)
  if (!Array.isArray(r.base) || !Array.isArray(r.holds) || r.holds.length < 2) fail(`${r.id}: invalid base or holds`)
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    colour: r.colour as string,
    hex: colour.hex,
    base: { x: num(r.base[0], `${r.id} base`), z: num(r.base[1], `${r.id} base`) },
    face: r.face,
    holds: r.holds.map((h: unknown) => {
      if (!Array.isArray(h)) fail(`${r.id}: a hold must be [u, y]`)
      return { u: num(h[0], `${r.id} hold`), y: num(h[1], `${r.id} hold`) }
    }),
  }
}

export function parseClimbingSpec(raw: unknown): ClimbingSpec {
  const r = (raw ?? {}) as Json
  if (r.sport !== 'climbing' || !Array.isArray(r.lines) || !r.colours || typeof r.colours !== 'object') fail('missing lines or colours')
  return {
    floorY: num(r.floorY, 'floorY'),
    standoffM: num(r.standoffM, 'standoffM'),
    startReachM: num(r.startReachM, 'startReachM'),
    lines: r.lines.map((line) => parseLine(line, r.colours as Json)),
  }
}

export function holdPosition(spec: ClimbingSpec, line: ClimbLine, index: number): { x: number; y: number; z: number } {
  const n = NORMALS[line.face]
  const hold = line.holds[index]
  if (!hold) throw new Error(`climbing: ${line.id} has no hold ${index}`)
  const { u, y } = hold
  return { x: line.base.x + n.z * u + n.x * HOLD_DEPTH, y: spec.floorY + y, z: line.base.z - n.x * u + n.z * HOLD_DEPTH }
}

export function wallNormal(line: ClimbLine): { x: number; z: number } {
  return NORMALS[line.face]
}

export function startSpot(spec: ClimbingSpec, line: ClimbLine): { x: number; z: number } {
  const n = NORMALS[line.face]
  return { x: line.base.x + n.x * spec.standoffM * 2, z: line.base.z + n.z * spec.standoffM * 2 }
}

export function nearestStart(spec: ClimbingSpec, x: number, z: number): ClimbLine | null {
  let best: ClimbLine | null = null
  let bestDistance = spec.startReachM
  for (const line of spec.lines) {
    const spot = startSpot(spec, line)
    const distance = Math.hypot(x - spot.x, z - spot.z)
    if (distance <= bestDistance) {
      best = line
      bestDistance = distance
    }
  }
  return best
}

export function isOnWall(state: ClimbStatePayload | null | undefined): state is ClimbStatePayload {
  return !!state && state.phase !== 'ended'
}

export type RingStage = 'waiting' | 'closing' | 'open' | 'late'

export function ringStage(state: ClimbStatePayload, serverNow: number): { stage: RingStage; scale: number } {
  if (serverNow < state.litAt) return { stage: 'waiting', scale: 0 }
  if (serverNow < state.opensAt) return { stage: 'closing', scale: 1 + (2 * (state.opensAt - serverNow)) / (state.opensAt - state.litAt) }
  if (serverNow <= state.closesAt) return { stage: 'open', scale: 1 }
  return { stage: 'late', scale: 1 }
}

export function climbSeconds(state: ClimbStatePayload, serverNow: number): number {
  if (state.timeMs !== undefined) return state.timeMs / 1000
  if (state.startedAt === null) return 0
  return Math.max(0, serverNow - state.startedAt) / 1000
}

export function gripShare(state: ClimbStatePayload): number {
  return state.gripMax > 0 ? Math.max(0, Math.min(1, state.grip / state.gripMax)) : 0
}

export const DUEL_BOARD = 'climbing_duel'

export interface BoardRow {
  id: string
  name: string | null
  hex: string
  entries: { name: string; timeMs: number }[]
  champion: { name: string; timeMs: number } | null
}

export function boardRows(
  spec: ClimbingSpec,
  board: { boards: { venue: string; entries: { name: string; timeMs: number }[] }[]; champions: { venue: string; name: string; timeMs: number }[] },
): BoardRow[] {
  const entriesOf = (id: string) => board.boards.find((b) => b.venue === id)?.entries ?? []
  const championOf = (id: string) => {
    const found = board.champions.find((c) => c.venue === id)
    return found ? { name: found.name, timeMs: found.timeMs } : null
  }
  const lines = spec.lines.map((line) => ({ id: line.id, name: line.name, hex: line.hex, entries: entriesOf(line.id), champion: championOf(line.id) }))
  return [...lines, { id: DUEL_BOARD, name: null, hex: '#e07a2f', entries: entriesOf(DUEL_BOARD), champion: championOf(DUEL_BOARD) }]
}

export type ClimbPose = 'hang' | 'lower' | null
export type ClimbMove = 'reachL' | 'reachR' | 'top' | 'fall'

export function climbAnimation(state: ClimbStatePayload, line: ClimbLine | null): { pose: ClimbPose; move: ClimbMove | null } {
  if (state.phase === 'ended') {
    const dropped = state.result === 'fell' || state.result === 'let_go'
    return { pose: null, move: dropped && line?.kind === 'boulder' ? 'fall' : null }
  }
  const pose: ClimbPose = state.phase === 'lowering' ? 'lower' : 'hang'
  if (state.event === 'top') return { pose, move: 'top' }
  if (state.event !== 'hold' || !line || state.next < 1) return { pose, move: null }
  const reached = line.holds[state.next - 1]
  const before = state.next >= 2 ? line.holds[state.next - 2] : { u: 0 }
  return { pose, move: reached && reached.u > before!.u ? 'reachR' : 'reachL' }
}
