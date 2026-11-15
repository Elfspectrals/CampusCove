import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

export interface SportsBoardEntry {
  name: string
  value: number
}

export interface SportsBoard {
  board: string
  week: string
  entries: SportsBoardEntry[]
  champion: SportsBoardEntry | null
}

function parseEntry(raw: unknown): SportsBoardEntry {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.value !== 'number') throw new Error('Invalid sports board entry')
  return { name: raw.name, value: raw.value }
}

export function parseSportsBoard(data: unknown): SportsBoard {
  const board = isRecord(data) ? data.board : null
  if (!isRecord(board) || typeof board.board !== 'string' || typeof board.week !== 'string' || !Array.isArray(board.entries)) throw new Error('Invalid sports board')
  return { board: board.board, week: board.week, entries: board.entries.map(parseEntry), champion: board.champion == null ? null : parseEntry(board.champion) }
}

export async function fetchSportsBoard(board: string): Promise<SportsBoard> {
  const data = await apiRequest(`/sports/boards/${encodeURIComponent(board)}`, { token: getStoredAuth()?.token ?? null, errorMessage: 'Could not load the board' })
  return parseSportsBoard(data)
}
