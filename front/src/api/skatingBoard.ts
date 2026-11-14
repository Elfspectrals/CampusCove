import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

export interface SkatingBoardEntry {
  name: string
  timeMs: number
}

export interface SkatingBoard {
  week: string
  boards: { laps: number; entries: SkatingBoardEntry[] }[]
  champions: ({ laps: number } & SkatingBoardEntry)[]
}

function parseEntry(raw: unknown): SkatingBoardEntry {
  if (!isRecord(raw) || typeof raw.name !== 'string' || typeof raw.timeMs !== 'number') throw new Error('Invalid skating board entry')
  return { name: raw.name, timeMs: raw.timeMs }
}

function laps(raw: unknown): number {
  if (!isRecord(raw) || typeof raw.laps !== 'number' || !Number.isInteger(raw.laps)) throw new Error('Invalid skating board lap count')
  return raw.laps
}

export function parseSkatingBoard(data: unknown): SkatingBoard {
  if (!isRecord(data) || typeof data.week !== 'string' || !Array.isArray(data.boards) || !Array.isArray(data.champions)) throw new Error('Invalid skating board')
  return {
    week: data.week,
    boards: data.boards.map((board) => {
      if (!isRecord(board) || !Array.isArray(board.entries)) throw new Error('Invalid skating board')
      return { laps: laps(board), entries: board.entries.map(parseEntry) }
    }),
    champions: data.champions.map((champion) => ({ laps: laps(champion), ...parseEntry(champion) })),
  }
}

export async function fetchSkatingBoard(): Promise<SkatingBoard> {
  return parseSkatingBoard(await apiRequest('/sports/skating/board', { token: getStoredAuth()?.token ?? null, errorMessage: 'Could not load the skating board' }))
}
