import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { CashBag, ClientPayload, GameClient, GameRoom, Vec3 } from './types.ts'
import { reportCrime } from './wanted.ts'

export const CASH_BAG_REACH = 2
export const CASH_BAG_PICK_COOLDOWN_MS = 500

function isCodeList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((code) => typeof code === 'string')
}

function removeCashBag(room: GameRoom, id: number): void {
  if (room.cashBags.delete(id)) room.forEachClient((c) => c.send('cash_bag_removed', { id }))
}

export function publicCashBag({ id, x, y, z, expiresAt, tools }: CashBag) {
  return { id, x, y, z, expiresAt, tools }
}

export function dropCashBag(room: GameRoom, at: Vec3, drop: unknown, murderVictimAccountId: number | null = null): void {
  if (drop === null || drop === undefined) return
  const { id, expires_at: expiresAtIso, tools } = drop as { id?: unknown, expires_at?: unknown, tools?: unknown }
  const expiresAt = typeof expiresAtIso === 'string' ? Date.parse(expiresAtIso) : Number.NaN
  if (!Number.isSafeInteger(id) || (id as number) <= 0 || !Number.isFinite(expiresAt) || !isCodeList(tools)) {
    throw new Error(`invalid cash drop from the API: ${JSON.stringify(drop)}`)
  }
  const bag: CashBag = { id: id as number, x: at.x, y: at.y, z: at.z, expiresAt, tools, murderVictimAccountId }
  room.cashBags.set(bag.id, bag)
  room.forEachClient((c) => c.send('cash_bag_dropped', publicCashBag(bag)))
  room.clock.setTimeout(() => removeCashBag(room, bag.id), Math.max(0, expiresAt - Date.now()))
}

function sendCashBagError(client: GameClient, id: number | null, message: string, code: string): void {
  client.send('cash_bag_error', { id, message, code })
}

export async function onCashBagPick(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const rawId = payload?.id
  const id = Number.isSafeInteger(rawId) ? rawId as number : null
  if (!player?.token || now < player.knockedOutUntil || player.jail || player.cuffedBy) {
    sendCashBagError(client, id, 'You cannot pick that up right now.', 'cash_bag_cannot_pick')
    return
  }
  const bag = id === null ? undefined : room.cashBags.get(id)
  if (id === null || !bag) {
    sendCashBagError(client, id, 'This cash is gone.', 'cash_drop_gone')
    return
  }
  if (Math.hypot(bag.x - player.x, bag.z - player.z) > CASH_BAG_REACH || Math.abs(bag.y - player.y) > CASH_BAG_REACH) {
    sendCashBagError(client, id, 'Walk up to the cash.', 'cash_bag_too_far')
    return
  }
  if (now - player.lastCashBagPickAt < CASH_BAG_PICK_COOLDOWN_MS) return
  player.lastCashBagPickAt = now
  try {
    const data = await callRealtimeBackend(player.token, `/cash-drops/${id}/pick`, 'POST')
    removeCashBag(room, id)
    client.send('cash_bag_picked', { id, amount: data?.amount, cash: data?.cash, tools: isCodeList(data?.tools) ? data.tools : [], gear: isCodeList(data?.gear) ? data.gear : [] })
    if (bag.murderVictimAccountId !== null && bag.murderVictimAccountId !== player.accountId) reportCrime(room, player, 'bag_theft', bag.murderVictimAccountId)
  } catch (error) {
    const failure = errorPayload(error, 'You could not pick up the cash.', 'cash_bag_failed')
    if (failure.code === 'cash_drop_gone') removeCashBag(room, id)
    client.send('cash_bag_error', { id, ...failure })
  }
}
