import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  zones: [{ buildings: [{ kind: 'house', key: 'house_05', position: [20, 0.5, 0], rotationY: 0, interiorOffset: [0, 0.2, 0] }] }]
}
const apiCalls: Array<{ path: string, body: any }> = []
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  apiCalls.push({ path: String(url).replace(/^.*\/api/, ''), body: init?.body ? JSON.parse(String(init.body)) : null })
  return new Response(JSON.stringify({ bed: { owner_account_id: 42, object_id: 'bed_1' } }))
}

const { loadWorld, worldHouse } = await import('./world.ts')
const { toInterior } = await import('./movement.ts')
const { fromInterior, standBeside } = await import('./houseObjects.ts')
const { homeWakeUp, onBedSet } = await import('./bed.ts')
await loadWorld()

const bounds = { minX: -6, maxX: 6, minZ: -5, maxZ: 5 }
const FLOOR_EYE = 0.7 + 1.6

function room(bedX = 2) {
  return {
    housingUnits: [{ status: 'occupied', model_key: 'house_05', occupant_account_id: 42, interior_bounds: bounds }],
    houseFurniture: [{ model_key: 'house_05', objects: [{ objectId: 'bed_1', objectKey: 'decor_bed_single', x: bedX, y: 0, z: 1, rotY: 0 }] }],
    players: new Map(),
    forEachClient: () => undefined
  } as unknown as GameRoom
}

test('you get up 1 m beside the bed, on the first side that stays inside the house', () => {
  assert.deepEqual(standBeside({ objectId: 'b', objectKey: 'decor_bed_single', x: 2, y: 0, z: 1, rotY: 0 }, bounds), { x: 3, z: 1 })
  assert.deepEqual(standBeside({ objectId: 'b', objectKey: 'decor_bed_single', x: 5.8, y: 0, z: 1, rotY: 0 }, bounds), { x: 4.8, z: 1 })
})

test('an interior point goes back to the same world point', () => {
  const house = { position: { x: 27.3, y: 0, z: 19.8 }, rotationY: -2.2, interiorOffset: { x: 0, y: 0.2, z: -1.655 } }
  const world = fromInterior(house, 1.5, 0, 2.5)
  const back = toInterior(house, world.x, world.z)
  assert.ok(Math.abs(back.x - 1.5) < 1e-9 && Math.abs(back.z - 2.5) < 1e-9)
  assert.equal(world.y, 0.2)
})

test('the chosen bed wakes you up beside it, looking at it', () => {
  const house = worldHouse('house_05')!
  const wake = homeWakeUp(room(), { ownerAccountId: 42, objectId: 'bed_1' })

  assert.deepEqual(wake, { position: { x: 23, y: 0.7 + 1.6, z: 1 }, bed: { x: 22, y: house.position.y + 0.2 + 0.5, z: 1 } })
})

test('a bed that is gone or a house that changed owner sends you to the clinic', () => {
  assert.equal(homeWakeUp(room(), { ownerAccountId: 42, objectId: 'bed_2' }), null)
  assert.equal(homeWakeUp(room(), { ownerAccountId: 7, objectId: 'bed_1' }), null)
  assert.equal(homeWakeUp(room(), null), null)
})

test('setting a bed next to it sends the house owner from the server', async () => {
  const r = room()
  const sent: Sent[] = []
  const client = { sessionId: 's1', send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as GameClient
  r.players.set('s1', { token: 't', x: 21, y: FLOOR_EYE, z: 1, knockedOutUntil: 0 } as Player)
  apiCalls.length = 0

  await onBedSet(r, client, { objectId: 'bed_1', owner_account_id: 7 })

  assert.deepEqual(apiCalls, [{ path: '/respawn-bed', body: { object_id: 'bed_1', owner_account_id: 42 } }])
  assert.deepEqual(sent, [{ type: 'bed_set_done', payload: { objectId: 'bed_1' } }])
})

test('a bed out of reach cannot be set', async () => {
  const r = room()
  const sent: Sent[] = []
  const client = { sessionId: 's1', send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as GameClient
  r.players.set('s1', { token: 't', x: 26, y: FLOOR_EYE, z: 1, knockedOutUntil: 0 } as Player)
  apiCalls.length = 0

  await onBedSet(r, client, { objectId: 'bed_1' })

  assert.equal(sent[0]?.payload.code, 'bed_too_far')
  assert.equal(apiCalls.length, 0)
})
