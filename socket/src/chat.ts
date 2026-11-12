import { unitAt } from './movement.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'

export const CHAT_MAX_LENGTH = 120
export const CHAT_RANGE = 30
export const CHAT_COOLDOWN_MS = 1000

export function chatText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()
  const length = [...text].length
  return length > 0 && length <= CHAT_MAX_LENGTH ? text : null
}

function canHear(room: GameRoom, speaker: Player, listener: Player): boolean {
  return Math.hypot(speaker.x - listener.x, speaker.z - listener.z) <= CHAT_RANGE
    && unitAt(room.housingUnits, speaker.x, speaker.z) === unitAt(room.housingUnits, listener.x, listener.z)
}

export function onChat(room: GameRoom, client: GameClient, payload: ClientPayload): void {
  const speaker = room.players.get(client.sessionId)
  const text = chatText(payload?.text)
  const now = Date.now()
  if (!speaker || !text || now - speaker.lastChatAt < CHAT_COOLDOWN_MS) return
  speaker.lastChatAt = now
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && canHear(room, speaker, listener)) c.send('user_chat', { sessionId: client.sessionId, text })
  }, client)
}
