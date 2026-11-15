import type { RunningBoardId, RunningBoards } from '../../api/running'
import type { SportsRunResultPayload, SportsRunStatePayload, SportsRunner, SportsRunnerState } from '../../types/gameRealtime'

export type Foot = 'left' | 'right'

export const RESULT_SHOWN_MS = 10_000

export function myRunner(state: SportsRunStatePayload | null, sessionId: string | null): SportsRunner | null {
  if (!state || sessionId === null) return null
  return state.runners.find((r) => r.sessionId === sessionId) ?? null
}

export function isRacing(runner: SportsRunner | null): boolean {
  return runner !== null && (runner.state === 'set' || runner.state === 'running')
}

export function footOfButton(button: number): Foot | null {
  if (button === 0) return 'left'
  if (button === 2) return 'right'
  return null
}

export function raceClockMs(state: SportsRunStatePayload, serverNow: number): number | null {
  return state.beepAt === null ? null : Math.max(0, serverNow - state.beepAt)
}

export function formatRaceTime(ms: number): string {
  const hundredths = Math.floor(ms / 10)
  const minutes = Math.floor(hundredths / 6000)
  const seconds = (hundredths % 6000) / 100
  const fixed = seconds.toFixed(2)
  return minutes === 0 ? fixed : `${minutes}:${fixed.padStart(5, '0')}`
}

export interface CadenceBar {
  marker: number
  windowStart: number
  windowEnd: number
  inWindow: boolean
}

export function cadenceBar(goodStepMs: number, toleranceMs: number, sinceStepMs: number | null): CadenceBar {
  const span = 2 * goodStepMs
  const windowStart = (goodStepMs - toleranceMs) / span
  const windowEnd = (goodStepMs + toleranceMs) / span
  const marker = sinceStepMs === null ? 0 : Math.min(1, Math.max(0, sinceStepMs / span))
  return { marker, windowStart, windowEnd, inWindow: sinceStepMs !== null && marker >= windowStart && marker <= windowEnd }
}

export function relativeBearing(fromX: number, fromZ: number, yaw: number, toX: number, toZ: number): number {
  const target = Math.atan2(-(toX - fromX), -(toZ - fromZ))
  return Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw))
}

export function predictPosition(runner: SportsRunner, aheadMs: number): { x: number; z: number } {
  const t = Math.min(aheadMs, 250) / 1000
  return { x: runner.x - Math.sin(runner.ry) * runner.speed * t, z: runner.z - Math.cos(runner.ry) * runner.speed * t }
}

export const BOARD_RANGE_M = 140

export interface ScoreboardSpot {
  x: number
  z: number
  heightM: number
}

export function parseBoardIds(rules: unknown): RunningBoardId[] {
  const boards = (rules as { boards?: unknown } | null)?.boards
  if (!Array.isArray(boards) || boards.length === 0) throw new Error(`running.json: invalid boards ${JSON.stringify(boards)}`)
  return boards.map((id) => {
    const match = typeof id === 'string' ? /^run_(\d+)$/.exec(id) : null
    if (!match) throw new Error(`running.json: invalid board id ${JSON.stringify(id)}`)
    return { id, distanceM: Number(match[1]) }
  })
}

export function parseScoreboard(rules: unknown): ScoreboardSpot {
  const b = (rules as { scoreboard?: Record<string, unknown> } | null)?.scoreboard
  const ok = b && [b.x, b.z, b.heightM].every((v) => typeof v === 'number' && Number.isFinite(v))
  if (!ok) throw new Error(`running.json: invalid scoreboard ${JSON.stringify(b)}`)
  return { x: b.x as number, z: b.z as number, heightM: b.heightM as number }
}

type BoardStatus = { kind: 'time'; ms: number } | { kind: 'progress'; percent: number } | { kind: 'dnf'; dnf: string }

export interface BoardRow {
  sessionId: string
  name: string
  place: number | null
  status: BoardStatus
}

function rank(runner: SportsRunner): number {
  if (runner.state === 'finished') return 0
  return runner.state === 'dnf' ? 2 : 1
}

export function liveBoardRows(state: SportsRunStatePayload): BoardRow[] {
  const sorted = [...state.runners].sort((a, b) => rank(a) - rank(b) || (a.timeMs ?? 0) - (b.timeMs ?? 0) || b.gate - a.gate || a.lane - b.lane)
  return sorted.map((r, i) => ({
    sessionId: r.sessionId,
    name: r.name,
    place: r.state === 'dnf' ? null : i + 1,
    status:
      r.state === 'finished' && r.timeMs !== null
        ? { kind: 'time', ms: r.timeMs }
        : r.state === 'dnf'
          ? { kind: 'dnf', dnf: r.dnf ?? 'left' }
          : { kind: 'progress', percent: Math.round((100 * r.gate) / Math.max(1, state.gateCount)) },
  }))
}

export function resultBoardRows(result: SportsRunResultPayload): BoardRow[] {
  return [...result.results]
    .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
    .map((r) => ({
      sessionId: r.sessionId,
      name: r.name,
      place: r.place ?? null,
      status: r.timeMs !== undefined ? { kind: 'time', ms: r.timeMs } : { kind: 'dnf', dnf: r.dnf ?? 'left' },
    }))
}

export const WEEK_BOARD_RANGE_M = 40
const WEEK_BOARD_TOP = 3
export const WEEK_BOARD_REFRESH_MS = 60_000

export interface BoardSection {
  distanceM: number
  rows: BoardRow[]
}

export function weekBoardSections(boards: RunningBoards): BoardSection[] {
  return Object.entries(boards.boards)
    .map(([distance, entries]) => ({
      distanceM: Number(distance),
      rows: entries.slice(0, WEEK_BOARD_TOP).map((e, i) => ({ sessionId: String(e.accountId), name: e.name, place: i + 1, status: { kind: 'time' as const, ms: e.timeMs } })),
    }))
    .sort((a, b) => a.distanceM - b.distanceM)
}

export function weekNumber(week: string): number {
  const match = /^\d{4}-W(\d{2})$/.exec(week)
  if (!match) throw new Error(`Invalid week ${week}`)
  return Number(match[1])
}

export const LEAN_MS = 900
export const BREATHLESS_MS = 6000

export type PoseChange = 'set' | 'lean' | 'clear' | null

export function poseChange(before: SportsRunnerState | undefined, after: SportsRunnerState): PoseChange {
  if (after === before) return null
  if (after === 'set') return 'set'
  if (after === 'finished') return before === 'running' ? 'lean' : 'clear'
  return 'clear'
}
