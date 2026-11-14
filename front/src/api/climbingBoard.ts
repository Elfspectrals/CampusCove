import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

export interface ClimbingBoardEntry {
  name: string
  timeMs: number
}

export interface ClimbingBoard {
  week: string
  boards: { venue: string; entries: ClimbingBoardEntry[] }[]
  champions: ({ venue: string } & ClimbingBoardEntry)[]
}

function parseEntry(raw: unknown): ClimbingBoardEntry {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.timeMs !== 'number') throw new Error('Invalid climbing board entry')
  return { name: raw.name, timeMs: raw.timeMs }
}

export function parseClimbingBoard(data: unknown): ClimbingBoard {
  if (!isRecord(data) || typeof data.week !== 'string' || !Array.isArray(data.boards) || !Array.isArray(data.champions)) throw new Error('Invalid climbing board')
  return {
    week: data.week,
    boards: data.boards.map((board) => {
      if (!isRecord(board) || typeof board.venue !== 'string' || !Array.isArray(board.entries)) throw new Error('Invalid climbing board')
      return { venue: board.venue, entries: board.entries.map(parseEntry) }
    }),
    champions: data.champions.map((champion) => {
      if (!isRecord(champion) || typeof champion.venue !== 'string') throw new Error('Invalid climbing champion')
      return { venue: champion.venue, ...parseEntry(champion) }
    }),
  }
}

export async function fetchClimbingBoard(): Promise<ClimbingBoard> {
  return parseClimbingBoard(await apiRequest('/sports/climbing/board', { token: getStoredAuth()?.token ?? null, errorMessage: 'Could not load the climbing board' }))
}
