export const DANCE_LANES = 4
export const NOTE_LEAD_MS = 1600
export const NOTE_TAIL_MS = 250
export const JUDGEMENT_SHOW_MS = 600
export const LANE_FLASH_MS = 120

export type DanceMode = 'solo' | 'team' | 'duel'
export type Judgement = 'perfect' | 'good' | 'miss'
export type MoveAction = 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight'

export interface DanceNote {
  index: number
  t: number
  lane: number
}

export interface DanceStart {
  venue: string
  mode: DanceMode
  song: string
  difficulty: string
  bpm: number
  lengthMs: number
  startAt: number
  serverNow: number
  notes: DanceNote[]
  dancers: { sessionId: string; name: string }[]
}

export interface DanceJudge {
  sessionId: string
  index: number
  lane: number
  judgement: Judgement
  score: number
  combo: number
  synced: boolean
  teamScore: number | null
}

const ARROW_LANES: Readonly<Record<string, number>> = { ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 }
const MOVE_LANES: ReadonlyArray<[MoveAction, number]> = [
  ['moveLeft', 0],
  ['moveBack', 1],
  ['moveForward', 2],
  ['moveRight', 3],
]

export function laneOfKey(code: string, isMoveKey: (action: MoveAction, code: string) => boolean): number | null {
  const arrow = ARROW_LANES[code]
  if (arrow !== undefined) return arrow
  return MOVE_LANES.find(([action]) => isMoveKey(action, code))?.[1] ?? null
}

function finite(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`dance_start: invalid ${what}`)
  return v
}

export function parseDanceStart(raw: unknown): DanceStart {
  const p = raw as Record<string, unknown> | null
  if (!p || typeof p.venue !== 'string' || typeof p.song !== 'string' || typeof p.difficulty !== 'string') throw new Error('dance_start: invalid venue, song or difficulty')
  if (p.mode !== 'solo' && p.mode !== 'team' && p.mode !== 'duel') throw new Error('dance_start: invalid mode')
  if (!Array.isArray(p.notes) || !Array.isArray(p.dancers)) throw new Error('dance_start: invalid notes or dancers')
  const notes = p.notes.map((n, index) => {
    if (!Array.isArray(n) || n.length !== 2) throw new Error(`dance_start: invalid note ${index}`)
    const lane = finite(n[1], `note ${index} lane`)
    if (!Number.isInteger(lane) || lane < 0 || lane >= DANCE_LANES) throw new Error(`dance_start: invalid note ${index} lane`)
    return { index, t: finite(n[0], `note ${index} time`), lane }
  })
  const dancers = p.dancers.map((d, i) => {
    const dancer = d as { sessionId?: unknown; name?: unknown }
    if (typeof dancer.sessionId !== 'string' || typeof dancer.name !== 'string') throw new Error(`dance_start: invalid dancer ${i}`)
    return { sessionId: dancer.sessionId, name: dancer.name }
  })
  return {
    venue: p.venue,
    mode: p.mode,
    song: p.song,
    difficulty: p.difficulty,
    bpm: finite(p.bpm, 'bpm'),
    lengthMs: finite(p.lengthMs, 'lengthMs'),
    startAt: finite(p.startAt, 'startAt'),
    serverNow: finite(p.serverNow, 'serverNow'),
    notes,
    dancers,
  }
}

export function songTimeMs(start: DanceStart, clientNow: number, clockOffset: number): number {
  return clientNow + clockOffset - start.startAt
}

export interface FallingNote extends DanceNote {
  progress: number
}

export function fallingNotes(notes: readonly DanceNote[], songMs: number, judged: ReadonlySet<number>): FallingNote[] {
  const shown: FallingNote[] = []
  for (const note of notes) {
    if (note.t > songMs + NOTE_LEAD_MS) break
    if (judged.has(note.index) || note.t < songMs - NOTE_TAIL_MS) continue
    shown.push({ ...note, progress: 1 - (note.t - songMs) / NOTE_LEAD_MS })
  }
  return shown
}

export const CLIP_BEATS_PER_LOOP = 4
export const CLIP_LOOP_S = 2

export function danceTimeScale(bpm: number): number {
  return (bpm * CLIP_LOOP_S) / (60 * CLIP_BEATS_PER_LOOP)
}

export interface DanceEndRow {
  sessionId: string
  name: string
  score: number
  maxCombo: number
  fullCombo: boolean
  counts: Record<Judgement, number>
  result: 'win' | 'loss' | 'draw' | 'finished' | 'dnf'
  place: number | null
}

export interface DanceEnd {
  venue: string
  mode: DanceMode
  teamScore: number | null
  dancers: DanceEndRow[]
}
