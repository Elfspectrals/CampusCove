import { callRealtimeBackend, errorPayload } from './backend.ts'
import { toInterior, unitAt } from './movement.ts'
import type { ClientPayload, GameClient, GameRoom, HousingUnit, Player } from './types.ts'
import { worldHouse } from './world.ts'

export const STORAGE_REACH = 2.5
export const STORAGE_HEIGHT_REACH = 1.5
export const STORAGE_COOLDOWN_MS = 300
const EYE_HEIGHT = 1.6
const MAX_QUANTITY = 999

type StorageAction = 'open' | 'deposit' | 'take'

export function storageInReach(room: GameRoom, player: Player, objectId: string): HousingUnit | null {
  const unit = unitAt(room.housingUnits, player.x, player.z)
  const house = unit?.model_key ? worldHouse(unit.model_key) : null
  const object = room.houseFurniture.find((h) => h.model_key === unit?.model_key)?.objects.find((o) => o.objectId === objectId)
  if (!unit || !house || !object || unit.occupant_account_id === null) return null
  const p = toInterior(house, player.x, player.z)
  const feetY = player.y - EYE_HEIGHT - house.position.y - house.interiorOffset.y
  const near = Math.hypot(object.x - p.x, object.z - p.z) <= STORAGE_REACH && Math.abs(object.y - feetY) <= STORAGE_HEIGHT_REACH
  return near ? unit : null
}

function readMove(payload: ClientPayload): { code: string, quantity: number } | null {
  const code = payload?.code
  const quantity = payload?.quantity
  if (typeof code !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(code)) return null
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null
  return { code, quantity }
}

function sendError(client: GameClient, message: string, code: string): void {
  client.send('storage_error', { message, code })
}

export async function onStorage(room: GameRoom, client: GameClient, action: StorageAction, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return
  if (now - player.lastStorageAt < STORAGE_COOLDOWN_MS) {
    sendError(client, 'One thing at a time.', 'storage_busy')
    return
  }
  const objectId = payload?.objectId
  if (typeof objectId !== 'string' || objectId.length === 0 || objectId.length > 64) {
    sendError(client, 'There is nothing to open here.', 'storage_not_found')
    return
  }
  const move = action === 'open' ? null : readMove(payload)
  if (action !== 'open' && !move) {
    sendError(client, 'That is not a valid amount.', 'storage_bad_request')
    return
  }
  const unit = storageInReach(room, player, objectId)
  if (!unit) {
    sendError(client, 'Get closer to open it.', 'storage_too_far')
    return
  }
  player.lastStorageAt = now
  try {
    const screen = await callRealtimeBackend(player.token, `/furniture-storage/${action}`, 'POST', {
      ...move,
      object_id: objectId,
      owner_account_id: unit.occupant_account_id
    })
    client.send('storage_screen', screen)
  } catch (error) {
    client.send('storage_error', errorPayload(error, 'It will not open.', 'storage_failed'))
  }
}
