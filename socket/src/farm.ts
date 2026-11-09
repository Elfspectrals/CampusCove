import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'
import { worldFarm, type WorldField } from './world.ts'

export const PICK_MS = 3000
const PICK_LAG_MARGIN_MS = 250
const FIELD_MARGIN = 0.5
const EYE_HEIGHT = 1.6
const GROUND_TOLERANCE = 2

function sendFarmError(client: GameClient, message: string, code: string): void {
  client.send('farm_error', { message, code })
}

function standsIn(player: Player, field: WorldField): boolean {
  return (
    player.x >= field.minX - FIELD_MARGIN &&
    player.x <= field.maxX + FIELD_MARGIN &&
    player.z >= field.minZ - FIELD_MARGIN &&
    player.z <= field.maxZ + FIELD_MARGIN &&
    Math.abs(player.y - EYE_HEIGHT) <= GROUND_TOLERANCE
  )
}

function activePlayer(room: GameRoom, client: GameClient, now: number): Player | null {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return null
  return player
}

export function onFarmPickStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = activePlayer(room, client, now)
  if (!player) return
  const fieldIndex = payload?.field
  const field = typeof fieldIndex === 'number' && Number.isInteger(fieldIndex) ? worldFarm()?.fields[fieldIndex] : undefined
  if (typeof fieldIndex !== 'number' || !field) {
    sendFarmError(client, 'There is no such field.', 'farm_unknown_field')
    return
  }
  if (!standsIn(player, field)) {
    sendFarmError(client, 'Step into the field first.', 'farm_too_far')
    return
  }
  player.farmPick = { field: fieldIndex, startedAt: now }
}

export async function onFarmPick(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = activePlayer(room, client, now)
  if (!player) return
  const pick = player.farmPick
  player.farmPick = null
  if (!pick) {
    sendFarmError(client, 'Start picking first.', 'farm_not_picking')
    return
  }
  if (now - pick.startedAt < PICK_MS - PICK_LAG_MARGIN_MS) {
    sendFarmError(client, 'Keep picking a little longer.', 'farm_too_fast')
    return
  }
  const field = worldFarm()?.fields[pick.field]
  if (!field || !standsIn(player, field)) {
    sendFarmError(client, 'Step into the field first.', 'farm_too_far')
    return
  }
  try {
    client.send('farm_picked', await callRealtimeBackend(player.token, '/farm/pick', 'POST', { crop: field.crop }))
  } catch (error) {
    console.warn('[farm] pick failed:', error instanceof Error ? error.message : error)
    client.send('farm_error', errorPayload(error, 'The crop slipped from your hand.', 'farm_pick_failed'))
  }
}
