// Interiors: entering / leaving houses and work buildings, and decorating a house. Houses are backed by
// the Laravel API (ownership, placed objects, inventory); work buildings are public and have no DB row.
import { callBackendJson, errorPayload, parseAccountId } from './backend.js'
import {
  APARTMENT_SPAWN,
  APARTMENT_SPAWN_RADIUS,
  CITY_SPAWN,
  CITY_SPAWN_RADIUS,
  DEFAULT_TEMPLATE_KEY,
  WORK_DOORS,
  WORK_EXIT_RADIUS
} from './config.js'
import { spawnNear } from './players.js'

function nonEmptyString(raw) {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

// Clients currently inside this house.
function houseViewers(room, ownerAccountId, templateKey) {
  return room.clients.filter((c) => {
    const p = room.players.get(c.sessionId)
    return p?.zone === 'apartment' && p.apartmentOwnerId === ownerAccountId && p.apartmentTemplateKey === templateKey
  })
}

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

export async function enterHouse(room, client, payload) {
  const player = room.players.get(client.sessionId)
  if (!player) return
  if (!player.token) {
    client.send('apartment_error', { message: 'Missing auth token', code: 'missing_token' })
    return
  }
  const ownerAccountId = parseAccountId(payload?.ownerAccountId) ?? player.accountId
  const requestedTemplate = nonEmptyString(payload?.templateKey) ?? DEFAULT_TEMPLATE_KEY
  let state
  try {
    const response = await callBackendJson(player.token, '/apartments/state', 'POST', {
      owner_account_id: ownerAccountId,
      template_key: requestedTemplate
    })
    state = response?.apartment ?? {}
  } catch (error) {
    client.send('apartment_error', errorPayload(error, 'Could not enter apartment', 'apartment_enter_error'))
    return
  }
  const templateKey = nonEmptyString(state.template_key) ?? requestedTemplate
  room.moveToZone(client, player, () => {
    Object.assign(player, {
      zone: 'apartment',
      apartmentOwnerId: ownerAccountId,
      apartmentTemplateKey: templateKey,
      ...spawnNear(APARTMENT_SPAWN, APARTMENT_SPAWN_RADIUS)
    })
    client.send('apartment_init', {
      ownerAccountId,
      templateKey,
      canEdit: state.can_edit === true,
      objects: Array.isArray(state.objects) ? state.objects : []
    })
  })
  await sendInventory(room, client)
}

// Public business-district building: no backend call, anyone can walk in. The zone stays 'apartment' on
// the wire so the client reuses the house flow; visibility is per building (players.visibilityKey).
export function enterWork(room, client, payload) {
  const player = room.players.get(client.sessionId)
  if (!player || player.zone !== 'city') return
  const workKey = typeof payload?.workKey === 'string' ? payload.workKey : ''
  if (!Object.prototype.hasOwnProperty.call(WORK_DOORS, workKey)) {
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
  const workDoor = player.workKey ? WORK_DOORS[player.workKey] : null
  room.moveToZone(client, player, () => {
    Object.assign(player, {
      zone: 'city',
      apartmentOwnerId: null,
      apartmentTemplateKey: null,
      workKey: null,
      ...(workDoor
        ? spawnNear({ x: workDoor.x, y: 1.6, z: workDoor.z }, WORK_EXIT_RADIUS)
        : spawnNear(CITY_SPAWN, CITY_SPAWN_RADIUS))
    })
  })
  client.send('housing_units_sync', { units: room.housingUnits })
}

// The house being decorated by this player, or null if they cannot act on one.
function decoratedHouse(room, client) {
  const player = room.players.get(client.sessionId)
  if (!player || player.zone !== 'apartment' || !player.apartmentOwnerId || !player.token) return null
  return {
    player,
    ownerAccountId: player.apartmentOwnerId,
    templateKey: player.apartmentTemplateKey ?? DEFAULT_TEMPLATE_KEY
  }
}

// Place a new item (spawn) or move a placed one (transform); every viewer gets the saved object.
export async function saveObject(room, client, payload, isSpawn) {
  const house = decoratedHouse(room, client)
  const objectId = typeof payload?.objectId === 'string' ? payload.objectId.trim() : ''
  if (!house || !objectId) return
  try {
    const response = await callBackendJson(
      house.player.token,
      isSpawn ? '/apartments/spawn' : '/apartments/transform',
      isSpawn ? 'POST' : 'PATCH',
      { owner_account_id: house.ownerAccountId, template_key: house.templateKey, ...payload }
    )
    const saved = response?.object
    if (!saved || typeof saved.objectId !== 'string') return
    for (const c of houseViewers(room, house.ownerAccountId, house.templateKey)) {
      c.send('apartment_object_upserted', saved)
    }
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
    for (const c of houseViewers(room, house.ownerAccountId, house.templateKey)) {
      c.send('apartment_object_removed', { objectId })
    }
    await sendInventory(room, client)
  } catch (error) {
    client.send('apartment_action_error', errorPayload(error, 'Could not pickup apartment object', 'apartment_pickup_error'))
  }
}
