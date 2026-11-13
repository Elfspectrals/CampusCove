import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameRoom, HousingUnit, Player } from './types.ts'

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [{
    key: 'cove_heights',
    buildings: [{
      kind: 'house',
      key: 'cove_home_b01',
      position: [-273.5, 0, -187],
      rotationY: 3.141593,
      door: [-273.5, 1.25, -191.8],
      backDoor: [-273.5, 1.25, -178.99],
      interiorOffset: [0, 0.2, -1.405]
    }]
  }]
}

globalThis.fetch = async (url: string | URL | Request) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { moveRejection, unitAt } = await import('./movement.ts')
await loadWorld()

const tidewater: HousingUnit = {
  public_id: 'b01',
  template_key: 'house',
  model_key: 'cove_home_b01',
  status: 'occupied',
  door_locked: true,
  occupant_account_id: 1,
  key_holder_account_ids: [],
  pos_x: -273.5,
  pos_z: -191.8,
  interior_bounds: { minX: -9.295, maxX: 5.295, minZ: -5.6, maxZ: 5.2 }
}

function worldZ(interiorZ: number): number {
  return -187 + 1.405 - interiorZ
}

function room(unit: HousingUnit): GameRoom {
  return { housingUnits: [unit], openDoors: new Set<string>() } as unknown as GameRoom
}

function player(accountId: number, z: number): Player {
  return { accountId, x: -273.5, y: 1.6, z, lastMoveAt: 0, knockedOutUntil: 0, speedBoostUntil: 0, pubSecretUntil: 0 } as Player
}

test('a house turned by pi is found 1 m inside its door, not at the door point', () => {
  assert.equal(unitAt([tidewater], -273.5, worldZ(4.0))?.public_id, 'b01')
  assert.equal(unitAt([tidewater], -273.5, -191.8), null)
})

test('the back landing of a locked house is refused without the key and open with it', () => {
  const landing = worldZ(-5.9)
  const inside = worldZ(-5.0)
  assert.equal(unitAt([tidewater], -273.5, landing), null)
  assert.equal(moveRejection(room(tidewater), player(2, landing), -273.5, 1.6, inside, 1000), 'locked_house')
  const keyed = { ...tidewater, key_holder_account_ids: [2] }
  assert.equal(moveRejection(room(keyed), player(2, landing), -273.5, 1.6, inside, 1000), null)
})
