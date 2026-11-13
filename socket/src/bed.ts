import { callRealtimeBackend, errorPayload } from './backend.ts'
import { bedWakeUp, placedObject, placedObjectInReach } from './houseObjects.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'

export interface RespawnBed {
  ownerAccountId: number
  objectId: string
}

function warn(context: string, error: unknown): void {
  console.warn(`[bed] ${context}:`, error instanceof Error ? error.message : error)
}

export async function onBedSet(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return
  const objectId = payload?.objectId
  const unit = typeof objectId === 'string' && objectId.length <= 64 ? placedObjectInReach(room, player, objectId)?.unit : undefined
  if (!unit) {
    client.send('bed_error', { message: 'Get closer to the bed.', code: 'bed_too_far' })
    return
  }
  try {
    await callRealtimeBackend(player.token, '/respawn-bed', 'POST', { object_id: objectId, owner_account_id: unit.occupant_account_id })
    client.send('bed_set_done', { objectId })
  } catch (error) {
    client.send('bed_error', errorPayload(error, 'You cannot sleep here.', 'bed_failed'))
  }
}

export async function fetchRespawnBed(player: Player): Promise<RespawnBed | null> {
  try {
    const bed = (await callRealtimeBackend(player.token, '/respawn-bed', 'GET'))?.bed
    if (!Number.isInteger(bed?.owner_account_id) || typeof bed?.object_id !== 'string') return null
    return { ownerAccountId: bed.owner_account_id, objectId: bed.object_id }
  } catch (error) {
    warn('respawn bed lookup failed', error)
    return null
  }
}

export function homeWakeUp(room: GameRoom, bed: RespawnBed | null): { position: Vec3, bed: Vec3 } | null {
  if (!bed) return null
  const unit = room.housingUnits.find((u) => u.status === 'occupied' && u.occupant_account_id === bed.ownerAccountId)
  const placed = placedObject(room, unit, bed.objectId)
  return placed ? bedWakeUp(placed) : null
}
