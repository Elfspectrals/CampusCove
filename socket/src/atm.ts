import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'
import { worldAtms } from './world.ts'

export const ATM_REACH = 2.5
export const ATM_COOLDOWN_MS = 500
export const ATM_MAX_AMOUNT = 1_000_000
const ACTIONS = ['deposit', 'withdraw', 'transfer'] as const
type AtmAction = (typeof ACTIONS)[number]
const REF = /^[A-Za-z0-9-]{8,40}$/

function sendAtmError(client: GameClient, request: number | null, message: string, code: string): void {
  client.send('atm_error', { message, code, request })
}

export function atmInReach(player: Pick<Player, 'x' | 'z'>): boolean {
  return worldAtms().some((atm) => Math.hypot(atm.x - player.x, atm.z - player.z) <= ATM_REACH)
}

function amountOf(raw: unknown): number | null {
  return Number.isInteger(raw) && (raw as number) >= 1 && (raw as number) <= ATM_MAX_AMOUNT ? raw as number : null
}

function recipientOf(payload: ClientPayload): { username: string, tag: number } | null {
  const { username, tag } = payload ?? {}
  if (typeof username !== 'string' || username.trim().length === 0 || username.length > 64) return null
  if (typeof tag !== 'number' || !Number.isInteger(tag) || tag < 0 || tag > 9999) return null
  return { username: username.trim(), tag }
}

export async function onAtm(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const raw = payload?.request
  const request = Number.isSafeInteger(raw) ? raw as number : null
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) {
    sendAtmError(client, request, 'You cannot use the ATM right now.', 'atm_cannot_use')
    return
  }
  if (!atmInReach(player)) {
    sendAtmError(client, request, 'Walk up to an ATM.', 'atm_too_far')
    return
  }
  const action = payload?.action as AtmAction
  const amount = amountOf(payload?.amount)
  const ref = typeof payload?.ref === 'string' && REF.test(payload.ref) ? payload.ref : null
  const recipient = action === 'transfer' ? recipientOf(payload) : null
  if (!ACTIONS.includes(action) || amount === null || ref === null || (action === 'transfer' && recipient === null)) {
    sendAtmError(client, request, 'This operation is not valid.', 'atm_bad_request')
    return
  }
  if (now - player.lastAtmAt < ATM_COOLDOWN_MS) {
    sendAtmError(client, request, 'The ATM is still busy.', 'atm_busy')
    return
  }
  player.lastAtmAt = now
  try {
    const body = { ref: `${player.accountId}-${ref}`, amount, ...recipient }
    client.send('atm_done', { action, ...await callRealtimeBackend(player.token, `/bank/${action}`, 'POST', body), request })
  } catch (error) {
    console.warn('[atm] operation failed:', error instanceof Error ? error.message : error)
    client.send('atm_error', { ...errorPayload(error, 'The ATM could not complete the operation.', 'atm_failed'), request })
  }
}
