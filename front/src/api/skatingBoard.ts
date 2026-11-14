import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

export const SKATING_BOARD_LAPS = [1, 3, 5] as const
const SHOWN_ENTRIES = 5

export interface SkatingBoardEntry {
  name: string
  timeMs: number
}

export interface SkatingBoard {
  week: string
  boards: { laps: number; entries: SkatingBoardEntry[] }[]
  champions: ({ laps: number } & SkatingBoardEntry)[]
}

interface CoreBoard {
  week: string
  entries: SkatingBoardEntry[]
  champion: SkatingBoardEntry | null
}

function parseEntry(raw: unknown): SkatingBoardEntry {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.value !== 'number') throw new Error('Invalid skating board entry')
  return { name: raw.name, timeMs: raw.value }
}

export function parseCoreBoard(data: unknown): CoreBoard {
  const board = isRecord(data) ? data.board : null
  if (!isRecord(board) || typeof board.week !== 'string' || !Array.isArray(board.entries)) throw new Error('Invalid skating board')
  return { week: board.week, entries: board.entries.map(parseEntry), champion: board.champion === null ? null : parseEntry(board.champion) }
}

export function skatingBoard(boards: readonly CoreBoard[]): SkatingBoard {
  if (boards.length !== SKATING_BOARD_LAPS.length) throw new Error('Invalid skating board count')
  return {
    week: boards[0]!.week,
    boards: boards.map((board, i) => ({ laps: SKATING_BOARD_LAPS[i]!, entries: board.entries.slice(0, SHOWN_ENTRIES) })),
    champions: boards.flatMap((board, i) => (board.champion ? [{ laps: SKATING_BOARD_LAPS[i]!, ...board.champion }] : [])),
  }
}

export async function fetchSkatingBoard(): Promise<SkatingBoard> {
  const token = getStoredAuth()?.token ?? null
  const boards = await Promise.all(SKATING_BOARD_LAPS.map(async (laps) =>
    parseCoreBoard(await apiRequest(`/sports/boards/skate_${laps}`, { token, errorMessage: 'Could not load the skating board' }))))
  return skatingBoard(boards)
}
