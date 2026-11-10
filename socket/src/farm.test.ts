import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [{ key: 'town', buildings: [] }],
  crops: [
    { zone: 'farm', crop: 'corn', position: [-30, 0.03, -170] },
    { zone: 'farm', crop: 'pumpkin', position: [-10, 0.03, -180] }
  ]
}

const apiCalls: Array<{ path: string, body: any }> = []
let nextApiError: { status: number, code: string, message: string } | null = null
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const body = init?.body ? JSON.parse(String(init.body)) : null
  apiCalls.push({ path: path.replace(/^.*\/api/, ''), body })
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  return new Response(JSON.stringify({ code: `farm_${body.crop}`, quantity: 2 }))
}

const { loadWorld } = await import('./world.ts')
const { PICK_MS, onFarmPick, onFarmPickStart } = await import('./farm.ts')
await loadWorld()

function setup(x: number, z: number) {
  const player = { sessionId: 's1', accountId: 1, token: 'token-s1', x, y: 1.6, z, knockedOutUntil: 0, farmPick: null } as unknown as Player
  const sent: Sent[] = []
  const client: FakeClient = { sessionId: 's1', sent, send: (type, payload) => void sent.push({ type, payload }) }
  const room = { players: new Map([['s1', player]]) } as unknown as GameRoom
  apiCalls.length = 0
  return { player, client, room }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

function errorCodes(client: FakeClient) {
  return received(client, 'farm_error').map((e) => e.code)
}

test('holding the pick for 3 s at a plant gives one crop of that plant', async () => {
  const corn = setup(-30, -171)
  onFarmPickStart(corn.room, corn.client, { plant: 0 }, 1000)
  await onFarmPick(corn.room, corn.client, 1000 + PICK_MS)
  assert.deepEqual(apiCalls, [{ path: '/farm/pick', body: { crop: 'corn' } }])
  assert.deepEqual(received(corn.client, 'farm_picked'), [{ code: 'farm_corn', quantity: 2 }])

  const pumpkin = setup(-10, -179)
  onFarmPickStart(pumpkin.room, pumpkin.client, { plant: 1 }, 0)
  await onFarmPick(pumpkin.room, pumpkin.client, PICK_MS)
  assert.deepEqual(apiCalls, [{ path: '/farm/pick', body: { crop: 'pumpkin' } }])
})

test('the crop comes from the plant on the server, not from the client', async () => {
  const { client, room } = setup(-30, -171)
  onFarmPickStart(room, client, { plant: 0, crop: 'pumpkin' }, 0)
  await onFarmPick(room, client, PICK_MS)
  assert.deepEqual(apiCalls, [{ path: '/farm/pick', body: { crop: 'corn' } }])
})

test('a pick may land 250 ms early for network lag, not one more', async () => {
  const { client, room } = setup(-30, -171)
  onFarmPickStart(room, client, { plant: 0 }, 0)
  await onFarmPick(room, client, 2749)
  assert.deepEqual(errorCodes(client), ['farm_too_fast'])

  onFarmPickStart(room, client, { plant: 0 }, 10_000)
  await onFarmPick(room, client, 12_750)
  assert.equal(received(client, 'farm_picked').length, 1)
})

test('the plant must be within 2 m when the pick starts and when it ends', async () => {
  const edge = setup(-30, -168)
  onFarmPickStart(edge.room, edge.client, { plant: 0 }, 0)
  assert.deepEqual(edge.player.farmPick, { plant: 0, startedAt: 0 })

  const far = setup(-30, -167.9)
  onFarmPickStart(far.room, far.client, { plant: 0 }, 0)
  assert.deepEqual(errorCodes(far.client), ['farm_too_far'])

  const left = setup(-30, -171)
  onFarmPickStart(left.room, left.client, { plant: 0 }, 0)
  left.player.z = -160
  await onFarmPick(left.room, left.client, PICK_MS)
  assert.deepEqual(errorCodes(left.client), ['farm_too_far'])
  assert.equal(apiCalls.length, 0)
})

test('only plants of the world can be picked, and each start gives one pick', async () => {
  const { player, client, room } = setup(-30, -171)
  for (const plant of [-1, 2, 0.5, '0', null]) onFarmPickStart(room, client, { plant }, 0)
  assert.deepEqual(errorCodes(client), Array(5).fill('farm_unknown_plant'))
  assert.equal(player.farmPick, null)

  onFarmPickStart(room, client, { plant: 0 }, 0)
  await onFarmPick(room, client, PICK_MS)
  await onFarmPick(room, client, 2 * PICK_MS)
  assert.deepEqual(errorCodes(client).slice(5), ['farm_not_picking'])
})

test('a knocked out player cannot pick', async () => {
  const { player, client, room } = setup(-30, -171)
  player.knockedOutUntil = 10_000
  onFarmPickStart(room, client, { plant: 0 }, 0)
  assert.equal(client.sent.length, 0)
  assert.equal(player.farmPick, null)
})

test('an API refusal reaches the player with its code', async () => {
  const { client, room } = setup(-30, -171)
  nextApiError = { status: 422, code: 'basket_full', message: 'You cannot carry more than 20 of those.' }
  onFarmPickStart(room, client, { plant: 0 }, 0)
  await onFarmPick(room, client, PICK_MS)
  assert.deepEqual(received(client, 'farm_error'), [{ code: 'basket_full', message: 'You cannot carry more than 20 of those.' }])
})
