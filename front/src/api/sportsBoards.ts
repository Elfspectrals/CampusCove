import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

export interface SportsBoardEntry {
  rank: number
  accountId: number
  name: string
  value: number
}

export interface SportsBoard {
  board: string
  week: string
  entries: SportsBoardEntry[]
  champion: { week: string; accountId: number; name: string; value: number } | null
}

function int(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) throw new Error(`Invalid sports board ${what}`)
  return raw
}

function parseChampion(raw: unknown): NonNullable<SportsBoard['champion']> {
  if (!isRecord(raw) || typeof raw.week !== 'string' || typeof raw.name !== 'string') throw new Error('Invalid sports board champion')
  return { week: raw.week, name: raw.name, accountId: int(raw.accountId, 'champion account'), value: int(raw.value, 'champion value') }
}

export function parseSportsBoard(data: unknown): SportsBoard {
  const board = isRecord(data) ? data.board : null
  if (!isRecord(board) || typeof board.board !== 'string' || typeof board.week !== 'string' || !Array.isArray(board.entries)) {
    throw new Error('Invalid sports board response')
  }
  const champion = board.champion === null ? null : parseChampion(board.champion)
  return {
    board: board.board,
    week: board.week,
    entries: board.entries.map((row) => {
      if (!isRecord(row) || typeof row.name !== 'string') throw new Error('Invalid sports board entry')
      return { rank: int(row.rank, 'rank'), accountId: int(row.accountId, 'account'), name: row.name, value: int(row.value, 'value') }
    }),
    champion,
  }
}

export async function fetchSportsBoard(board: string): Promise<SportsBoard> {
  const data = await apiRequest(`/sports/boards/${encodeURIComponent(board)}`, { token: getStoredAuth()?.token ?? null, errorMessage: 'Could not load the board' })
  return parseSportsBoard(data)
}
