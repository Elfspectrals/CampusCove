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
  return new Response(JSON.stringify({ object_id: 'dresser_1', items: [] }))
}

const { loadWorld } = await import('./world.ts')
const { STORAGE_COOLDOWN_MS, onStorage } = await import('./storage.ts')
await loadWorld()

const FLOOR_EYE = 0.7 + 1.6

function setup(x = 20, eyeY = FLOOR_EYE) {
  const sent: Sent[] = []
  const client = { sessionId: 's1', send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as GameClient
  const player = { token: 't', x, y: eyeY, z: 0, knockedOutUntil: 0, lastStorageAt: -Infinity } as Player
  const room = {
    housingUnits: [{ model_key: 'house_05', occupant_account_id: 42, interior_bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 } }],
    houseFurniture: [{ model_key: 'house_05', objects: [{ objectId: 'dresser_1', objectKey: 'decor_dresser', x: 1, y: 0, z: 0 }] }],
    players: new Map([['s1', player]]),
    forEachClient: () => undefined
  } as unknown as GameRoom
  apiCalls.length = 0
  return { sent, client, player, room }
}

test('opening a dresser next to it asks Laravel with the house owner from the server', async () => {
  const { sent, client, room } = setup()
  await onStorage(room, client, 'open', { objectId: 'dresser_1', owner_account_id: 7 }, 1000)

  assert.deepEqual(apiCalls, [{ path: '/furniture-storage/open', body: { object_id: 'dresser_1', owner_account_id: 42 } }])
  assert.equal(sent[0]?.type, 'storage_screen')
})

test('taking sends the code and the quantity', async () => {
  const { client, room } = setup()
  await onStorage(room, client, 'take', { objectId: 'dresser_1', code: 'food_cookie', quantity: 2 }, 1000)

  assert.deepEqual(apiCalls, [{ path: '/furniture-storage/take', body: { code: 'food_cookie', quantity: 2, object_id: 'dresser_1', owner_account_id: 42 } }])
})

test('a dresser out of reach, upstairs or outside the house does not open', async () => {
  for (const [x, eyeY] of [[24, FLOOR_EYE], [20, FLOOR_EYE + 3], [30, FLOOR_EYE]]) {
    const { sent, client, room } = setup(x, eyeY)
    await onStorage(room, client, 'open', { objectId: 'dresser_1' }, 1000)
    assert.equal(sent[0]?.payload.code, 'storage_too_far', `at x ${x}, eye ${eyeY}`)
  }
  assert.equal(apiCalls.length, 0)
})

test('a bad amount or an unknown object is refused before Laravel', async () => {
  const { sent, client, room } = setup()
  await onStorage(room, client, 'deposit', { objectId: 'dresser_1', code: 'food_cookie', quantity: 0 }, 1000)
  await onStorage(room, client, 'deposit', { objectId: 'dresser_1', code: '../x', quantity: 1 }, 2000)
  await onStorage(room, client, 'open', { objectId: 'sofa_9' }, 3000)

  assert.deepEqual(sent.map((m) => m.payload.code), ['storage_bad_request', 'storage_bad_request', 'storage_too_far'])
  assert.equal(apiCalls.length, 0)
})

test('one storage action every 300 ms', async () => {
  const { sent, client, room } = setup()
  await onStorage(room, client, 'open', { objectId: 'dresser_1' }, 1000)
  await onStorage(room, client, 'open', { objectId: 'dresser_1' }, 1000 + STORAGE_COOLDOWN_MS - 1)
  await onStorage(room, client, 'open', { objectId: 'dresser_1' }, 1000 + STORAGE_COOLDOWN_MS)

  assert.deepEqual(sent.map((m) => m.type), ['storage_screen', 'storage_error', 'storage_screen'])
})
