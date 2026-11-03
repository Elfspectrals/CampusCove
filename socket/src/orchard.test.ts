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
  orchard: {
    trees: [[-20, 0, -100], [-30, 0, -100]],
    farmer: [-10, 0, -95]
  }
}

const apiCalls: Array<{ path: string, body: any }> = []
let nextApiError: { status: number, code: string, message: string } | null = null
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  apiCalls.push({ path: path.replace(/^.*\/api/, ''), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  if (path.endsWith('/orchard/pick')) return new Response(JSON.stringify({ code: 'farm_apple', quantity: 4 }))
  if (path.endsWith('/orchard/sell')) return new Response(JSON.stringify({ sold: 3, coins: 9, balance_after: 59 }))
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { PICK_MS, onOrchardPick, onOrchardPickStart, onOrchardSell } = await import('./orchard.ts')
await loadWorld()

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type, payload) => void sent.push({ type, payload }) }
}

function setup(x: number, z: number) {
  const player = { sessionId: 's1', accountId: 1, token: 'token-s1', x, y: 1.6, z, knockedOutUntil: 0, orchardPick: null } as unknown as Player
  const client = fakeClient('s1')
  const room = { players: new Map([['s1', player]]) } as unknown as GameRoom
  apiCalls.length = 0
  return { player, client, room }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

function errorCodes(client: FakeClient) {
  return received(client, 'orchard_error').map((e) => e.code)
}

test('holding the pick for 3 s gives one apple', async () => {
  const { client, room } = setup(-20, -98)
  onOrchardPickStart(room, client, { tree: 0 }, 1000)
  await onOrchardPick(room, client, 1000 + PICK_MS)

  assert.deepEqual(apiCalls, [{ path: '/orchard/pick', body: {} }])
  assert.deepEqual(received(client, 'orchard_picked'), [{ code: 'farm_apple', quantity: 4 }])
})

test('a pick may land 250 ms early for network lag, not one more', async () => {
  const { client, room } = setup(-20, -98)
  onOrchardPickStart(room, client, { tree: 0 }, 0)
  await onOrchardPick(room, client, 2749)
  assert.deepEqual(errorCodes(client), ['orchard_too_fast'])
  assert.equal(apiCalls.length, 0)

  onOrchardPickStart(room, client, { tree: 0 }, 10_000)
  await onOrchardPick(room, client, 12_750)
  assert.equal(received(client, 'orchard_picked').length, 1)
})

test('a pick needs a started pick, and each start gives one pick only', async () => {
  const { client, room } = setup(-20, -98)
  await onOrchardPick(room, client, 5000)
  onOrchardPickStart(room, client, { tree: 0 }, 6000)
  await onOrchardPick(room, client, 9000)
  await onOrchardPick(room, client, 12_000)

  assert.deepEqual(errorCodes(client), ['orchard_not_picking', 'orchard_not_picking'])
  assert.equal(apiCalls.length, 1)
})

test('the tree must be within 2.5 m when the pick starts and when it ends', async () => {
  const far = setup(-20, -97.4)
  onOrchardPickStart(far.room, far.client, { tree: 0 }, 0)
  assert.deepEqual(errorCodes(far.client), ['orchard_too_far'])
  assert.equal(far.player.orchardPick, null)

  const near = setup(-20, -97.5)
  onOrchardPickStart(near.room, near.client, { tree: 0 }, 0)
  near.player.z = -90
  await onOrchardPick(near.room, near.client, PICK_MS)
  assert.deepEqual(errorCodes(near.client), ['orchard_too_far'])
  assert.equal(apiCalls.length, 0)
})

test('only trees of the orchard can be picked', () => {
  const { player, client, room } = setup(-20, -98)
  for (const tree of [-1, 2, 0.5, '0', null]) onOrchardPickStart(room, client, { tree }, 0)

  assert.deepEqual(errorCodes(client), Array(5).fill('orchard_unknown_tree'))
  assert.equal(player.orchardPick, null)
})

test('a knocked out player can neither pick nor sell', async () => {
  const { player, client, room } = setup(-10, -95)
  player.knockedOutUntil = 10_000
  onOrchardPickStart(room, client, { tree: 0 }, 0)
  await onOrchardSell(room, client, { quantity: 1 }, 0)

  assert.equal(client.sent.length, 0)
  assert.equal(apiCalls.length, 0)
})

test('selling at the farmer forwards the quantity and the sale', async () => {
  const { client, room } = setup(-10, -97)
  await onOrchardSell(room, client, { quantity: 3 }, 0)

  assert.deepEqual(apiCalls, [{ path: '/orchard/sell', body: { quantity: 3 } }])
  assert.deepEqual(received(client, 'orchard_sold'), [{ sold: 3, coins: 9, balance_after: 59 }])
})

test('selling needs a whole positive quantity and the farmer within 3 m', async () => {
  const { client, room } = setup(-10, -95)
  for (const quantity of [0, -2, 1.5, '3', undefined]) await onOrchardSell(room, client, { quantity }, 0)
  const far = setup(-10, -91.9)
  await onOrchardSell(far.room, far.client, { quantity: 1 }, 0)

  assert.deepEqual(errorCodes(client), Array(5).fill('orchard_bad_quantity'))
  assert.deepEqual(errorCodes(far.client), ['orchard_too_far'])
  assert.equal(apiCalls.length, 0)
})

test('an API refusal reaches the player with its code', async () => {
  const { client, room } = setup(-20, -98)
  nextApiError = { status: 422, code: 'basket_full', message: 'You cannot carry more than 20 apples.' }
  onOrchardPickStart(room, client, { tree: 0 }, 0)
  await onOrchardPick(room, client, PICK_MS)

  assert.deepEqual(received(client, 'orchard_error'), [{ code: 'basket_full', message: 'You cannot carry more than 20 apples.' }])
})
