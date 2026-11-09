import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'
import { worldCropPlants, type WorldCropPlant } from './world.ts'

export const PICK_MS = 3000
const PICK_LAG_MARGIN_MS = 250
const PLANT_REACH = 2
const EYE_HEIGHT = 1.6
const POINT_FLOOR_TOLERANCE = 2

function sendFarmError(client: GameClient, message: string, code: string): void {
  client.send('farm_error', { message, code })
}

function withinReach(player: Player, plant: WorldCropPlant): boolean {
  return Math.hypot(player.x - plant.x, player.z - plant.z) <= PLANT_REACH && Math.abs(player.y - EYE_HEIGHT - plant.y) <= POINT_FLOOR_TOLERANCE
}

function activePlayer(room: GameRoom, client: GameClient, now: number): Player | null {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return null
  return player
}

export function onFarmPickStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = activePlayer(room, client, now)
  if (!player) return
  const plantIndex = payload?.plant
  const plant = typeof plantIndex === 'number' && Number.isInteger(plantIndex) ? worldCropPlants()[plantIndex] : undefined
  if (typeof plantIndex !== 'number' || !plant) {
    sendFarmError(client, 'There is no such plant.', 'farm_unknown_plant')
    return
  }
  if (!withinReach(player, plant)) {
    sendFarmError(client, 'Get closer to the plant.', 'farm_too_far')
    return
  }
  player.farmPick = { plant: plantIndex, startedAt: now }
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
  const plant = worldCropPlants()[pick.plant]
  if (!plant || !withinReach(player, plant)) {
    sendFarmError(client, 'Get closer to the plant.', 'farm_too_far')
    return
  }
  try {
    client.send('farm_picked', await callRealtimeBackend(player.token, '/farm/pick', 'POST', { crop: plant.crop }))
  } catch (error) {
    console.warn('[farm] pick failed:', error instanceof Error ? error.message : error)
    client.send('farm_error', errorPayload(error, 'The crop slipped from your hand.', 'farm_pick_failed'))
  }
}
