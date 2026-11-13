import type { GameRoom } from './types.ts'

export interface TaskTierReached {
  accountId: number
  task: string
  tier: 1 | 2 | 3
  threshold: number
}

const isPositiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0

export function parseTaskTierReached(body: unknown): TaskTierReached | null {
  if (typeof body !== 'object' || body === null) return null
  const { accountId, task, tier, threshold } = body as Record<string, unknown>
  if (!isPositiveInteger(accountId) || !isPositiveInteger(threshold)) return null
  if (typeof task !== 'string' || !/^[a-z_]{1,40}$/.test(task)) return null
  if (tier !== 1 && tier !== 2 && tier !== 3) return null
  return { accountId, task, tier, threshold }
}

export function sendTaskTierReached(room: GameRoom, reached: TaskTierReached): void {
  const { accountId, ...payload } = reached
  for (const client of room.clients) {
    if (room.players.get(client.sessionId)?.accountId === accountId) client.send('task_done', payload)
  }
}
