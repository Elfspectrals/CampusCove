// Interiors: entering / leaving work buildings, and decorating one's own house from the town. Houses are
// backed by the Laravel API (ownership, placed objects, inventory); work buildings are public and have no DB row.
import { callBackendJson, errorPayload } from './backend.js'
import {
  APARTMENT_SPAWN,
  APARTMENT_SPAWN_RADIUS,
  CITY_SPAWN_RADIUS,
  WORK_EXIT_RADIUS
} from './config.js'
import { spawnNear } from './players.js'
import { citySpawn, workDoor } from './world.js'

export async function sendInventory(room, client) {
  const player = room.players.get(client.sessionId)
  if (!player) return
  if (!player.token) {
    client.send('apartment_inventory_error', { message: 'Missing auth token', code: 'missing_token' })
    return
  }
  try {
    const response = await callBackendJson(player.token, '/apartments/assets', 'GET')
    client.send('apartment_inventory', { items: Array.isArray(response?.items) ? response.items : [] })
  } catch (error) {
    client.send('apartment_inventory_error', errorPayload(error, 'Inventory request failed', 'inventory_error'))
  }
}

// Public business-district building: no backend call, anyone can walk in. The zone stays 'apartment' on
// the wire so the client reuses the house flow; visibility is per building (players.visibilityKey).
export function enterWork(room, client, payload) {
  const player = room.players.get(client.sessionId)
  if (!player || player.zone !== 'city') return
  const workKey = typeof payload?.workKey === 'string' ? payload.workKey : ''
  if (!workDoor(workKey)) {
    client.send('apartment_error', { message: 'Unknown building', code: 'unknown_work' })
    return
  }
  room.moveToZone(client, player, () => {
    Object.assign(player, {
      zone: 'apartment',
      apartmentOwnerId: null,
      apartmentTemplateKey: null,
      workKey,
      ...spawnNear(APARTMENT_SPAWN, APARTMENT_SPAWN_RADIUS)
    })
    client.send('apartment_init', {
      ownerAccountId: null,
      templateKey: `work_${workKey}`,
      workKey,
      canEdit: false,
      objects: []
    })
  })
}

// Back to the town: in front of the work building's door, or on the plaza after a house.
export function exitBuilding(room, client) {
  const player = room.players.get(client.sessionId)
  if (!player || player.zone === 'city') return
  const exitDoor = player.workKey ? workDoor(player.workKey) : null
  room.moveToZone(client, player, () => {
    Object.assign(player, {
      zone: 'city',
      apartmentOwnerId: null,
      apartmentTemplateKey: null,
      workKey: null,
      ...(exitDoor
        ? spawnNear({ x: exitDoor.x, y: 1.6, z: exitDoor.z }, WORK_EXIT_RADIUS)
        : spawnNear(citySpawn(), CITY_SPAWN_RADIUS))
    })
  })
  client.send('housing_units_sync', { units: room.housingUnits })
}

// The house being decorated by this player: their own house, decorated from the town. Null if they have none.
function decoratedHouse(room, client) {
  const player = room.players.get(client.sessionId)
  if (!player || player.zone !== 'city' || !player.token) return null
  const unit = room.housingUnits.find((u) => u.occupant_account_id === player.accountId)
  if (!unit?.template_key) return null
  return { player, ownerAccountId: player.accountId, templateKey: unit.template_key }
}

// Place a new item (spawn) or move a placed one (transform); the town gets the updated house furniture.
export async function saveObject(room, client, payload, isSpawn) {
  const house = decoratedHouse(room, client)
  const objectId = typeof payload?.objectId === 'string' ? payload.objectId.trim() : ''
  if (!house || !objectId) return
  try {
    const response = await callBackendJson(
      house.player.token,
      isSpawn ? '/apartments/spawn' : '/apartments/transform',
      isSpawn ? 'POST' : 'PATCH',
      { ...payload, owner_account_id: house.ownerAccountId, template_key: house.templateKey }
    )
    const saved = response?.object
    if (!saved || typeof saved.objectId !== 'string') return
    await room.refreshHouseFurniture(house.player.token)
  } catch (error) {
    client.send('apartment_action_error', errorPayload(error, 'Could not update apartment object', 'apartment_object_error'))
  }
}

// Put a placed item back into the owner's inventory.
export async function pickupObject(room, client, payload) {
  const house = decoratedHouse(room, client)
  const objectId = typeof payload?.objectId === 'string' ? payload.objectId : ''
  if (!house || !objectId) return
  try {
    await callBackendJson(house.player.token, '/apartments/pickup', 'POST', {
      owner_account_id: house.ownerAccountId,
      template_key: house.templateKey,
      objectId
    })
    await room.refreshHouseFurniture(house.player.token)
    await sendInventory(room, client)
  } catch (error) {
    client.send('apartment_action_error', errorPayload(error, 'Could not pickup apartment object', 'apartment_pickup_error'))
  }
}
