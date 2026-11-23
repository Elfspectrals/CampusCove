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
const apiCalls: string[] = []
globalThis.fetch = async (url: string | URL | Request) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  apiCalls.push(String(url).replace(/^.*\/api/, ''))
  return new Response(JSON.stringify({ object: { objectId: 'sofa_1' }, houses: [] }))
}

const { loadWorld } = await import('./world.ts')
const { pickupObject, saveObject, setDecoratedHouse } = await import('./apartments.ts')
await loadWorld()

function setup(x: number) {
  const sent: Sent[] = []
  const client = { sessionId: 's1', send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as GameClient
  const player = { sessionId: 's1', accountId: 42, token: 't', x, y: 2.3, z: 0 } as Player
  const room = {
    housingUnits: [{ template_key: 'housing_5', model_key: 'house_05', occupant_account_id: 42, interior_bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 } }],
    houseFurniture: [],
    players: new Map([['s1', player]]),
    refreshHouseFurniture: async () => undefined
  } as unknown as GameRoom
  setDecoratedHouse(room, client, { templateKey: 'housing_5' })
  apiCalls.length = 0
  return { sent, client, player, room }
}

test('the owner standing in the house moves a piece through Laravel', async () => {
  const { sent, client, room } = setup(20)
  await saveObject(room, client, { objectId: 'sofa_1' }, false)

  assert.deepEqual(apiCalls, ['/apartments/transform'])
  assert.equal(sent.length, 0)
})

test('the owner who left the house cannot place, move or pick up a piece from the town', async () => {
  const { sent, client, room } = setup(40)
  await saveObject(room, client, { objectId: 'sofa_1' }, true)
  await saveObject(room, client, { objectId: 'sofa_1' }, false)
  await pickupObject(room, client, { objectId: 'sofa_1' })

  assert.deepEqual(apiCalls, [])
  assert.deepEqual(sent.map((s) => s.payload.code), ['not_decorating', 'not_decorating', 'not_decorating'])
})
