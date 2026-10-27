// Decorating one's own house from the town, backed by the Laravel API (ownership, placed objects, inventory).
import { callBackendJson, errorPayload } from './backend.js'

async function sendInventory(room, client) {
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

function canDecorate(unit, accountId) {
  return unit.occupant_account_id === accountId || (unit.key_holder_account_ids ?? []).includes(accountId)
}

// The client says which house it stands in (null when it leaves); only its owner or a key holder may decorate it.
export function setDecoratedHouse(room, client, payload) {
  const player = room.players.get(client.sessionId)
  if (!player) return
  const templateKey = typeof payload?.templateKey === 'string' ? payload.templateKey : null
  const unit = templateKey ? room.housingUnits.find((u) => u.template_key === templateKey) : null
  player.decoratedTemplateKey = unit && canDecorate(unit, player.accountId) ? templateKey : null
}

function rejectDecoration(client) {
  client.send('apartment_action_error', { message: 'You cannot decorate this house.', code: 'not_decorating' })
}

// The house being decorated by this player, decorated from the town, on behalf of its owner. Null if none.
function decoratedHouse(room, client) {
  const player = room.players.get(client.sessionId)
  if (!player || !player.token || !player.decoratedTemplateKey) return null
  const unit = room.housingUnits.find((u) => u.template_key === player.decoratedTemplateKey)
  if (!unit || unit.occupant_account_id === null || !canDecorate(unit, player.accountId)) return null
  return { player, ownerAccountId: unit.occupant_account_id, templateKey: unit.template_key }
}

// Place a new item (spawn) or move a placed one (transform); the town gets the updated house furniture.
export async function saveObject(room, client, payload, isSpawn) {
  const house = decoratedHouse(room, client)
  const objectId = typeof payload?.objectId === 'string' ? payload.objectId.trim() : ''
  if (!house) return rejectDecoration(client)
  if (!objectId) return
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
  if (!house) return rejectDecoration(client)
  if (!objectId) return
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
