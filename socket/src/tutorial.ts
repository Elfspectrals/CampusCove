import type { GameRoom } from './types.ts'

const STEPS = ['pick_apples', 'eat_apple', 'sell_apples', 'deposit_cash', 'play_darts'] as const
const NEW_CITIZEN = 'new_citizen'

export type TutorialChange =
  | { accountId: number, status: 'done', step: null }
  | { accountId: number, status: 'active' | 'skipped', step: (typeof STEPS)[number] }

export function parseTutorialChange(body: unknown): TutorialChange | null {
  if (typeof body !== 'object' || body === null) return null
  const { accountId, status, step } = body as Record<string, unknown>
  if (!Number.isInteger(accountId) || (accountId as number) <= 0) return null
  if (status === 'done' && step === null) return { accountId: accountId as number, status, step }
  if ((status === 'active' || status === 'skipped') && (STEPS as readonly unknown[]).includes(step)) {
    return { accountId: accountId as number, status, step: step as (typeof STEPS)[number] }
  }
  return null
}

export function applyTutorialChange(room: GameRoom, change: TutorialChange): void {
  const { accountId, ...state } = change
  for (const client of room.clients) {
    const player = room.players.get(client.sessionId)
    if (player?.accountId !== accountId) continue
    client.send('tutorial_state', state)
    if (change.status !== 'done' || player.badges.includes(NEW_CITIZEN)) continue
    player.badges = [...player.badges, NEW_CITIZEN]
    const payload = { sessionId: player.sessionId, badges: [...player.badges] }
    room.forEachClient((other) => other.send('user_badges', payload), client)
  }
}
