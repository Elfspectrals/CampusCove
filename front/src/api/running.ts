import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

interface RunningBoardEntry {
  accountId: number
  name: string
  timeMs: number
}

export interface RunningBoards {
  week: string
  boards: Record<string, RunningBoardEntry[]>
}

export interface RunningBoardId {
  id: string
  distanceM: number
}

interface SportsBoard {
  week: string
  entries: RunningBoardEntry[]
}

function parseEntry(raw: unknown): RunningBoardEntry {
  if (!isRecord(raw) || typeof raw.accountId !== 'number' || typeof raw.name !== 'string' || typeof raw.value !== 'number') {
    throw new Error('Invalid sports board entry')
  }
  return { accountId: raw.accountId, name: raw.name, timeMs: raw.value }
}

export function parseSportsBoard(raw: unknown): SportsBoard {
  const board = isRecord(raw) ? raw.board : null
  if (!isRecord(board) || typeof board.week !== 'string' || !Array.isArray(board.entries)) throw new Error('Invalid sports board response')
  return { week: board.week, entries: board.entries.map(parseEntry) }
}

export async function fetchRunningBoards(ids: readonly RunningBoardId[]): Promise<RunningBoards> {
  const token = getStoredAuth()?.token ?? null
  const boards = await Promise.all(ids.map(async ({ id }) => parseSportsBoard(await apiRequest(`/sports/boards/${id}`, { token, errorMessage: 'Could not load the running boards' }))))
  const week = boards[0]?.week
  if (week === undefined) throw new Error('No running board to load')
  return { week, boards: Object.fromEntries(ids.map(({ distanceM }, i) => [String(distanceM), boards[i]!.entries])) }
}
