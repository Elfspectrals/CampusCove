import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [{ key: 'town', buildings: [] }, { key: 'farm', bounds: { minX: -42.6, maxX: -2, minZ: -200, maxZ: -130 } }]
}

const apiCalls: Array<{ path: string, body: any }> = []
let nextApiError: { status: number, code: string, message: string } | null = null
const zoneIndex = { version: 1, zones: ['farm', 'barn_shop'] }
const shopZone = { version: 1, zone: 'barn_shop', name: 'Barn shop', parent: 'farm', bounds: { minX: -30, maxX: -20, minZ: -160, maxZ: -150 }, props: [], areas: [] }
const farmZone = {
  version: 1,
  zone: 'farm',
  name: 'Farm',
  props: [{ id: 'farmer', kind: 'npc', position: [-14, 0, -142] }],
  areas: [{ id: 'stand', role: 'buyer', npc: 'farmer' }, { id: 'stall', role: 'seller', npc: 'farmer' }]
}

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  if (path === 'http://world.test/zones/index.json') return new Response(JSON.stringify(zoneIndex))
  if (path === 'http://world.test/zones/farm.json') return new Response(JSON.stringify(farmZone))
  if (path === 'http://world.test/zones/barn_shop.json') return new Response(JSON.stringify(shopZone))
  const body = init?.body ? JSON.parse(String(init.body)) : null
  apiCalls.push({ path: path.replace(/^.*\/api/, ''), body })
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  return new Response(JSON.stringify({ purchases: [], balance_after: 95 }))
}

const { loadWorld, loadZoneBuyers } = await import('./world.ts')
const { onZoneCheckout, onZoneSell } = await import('./zoneShop.ts')
await loadWorld()
await loadZoneBuyers()

const KEY = '0b6c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3'
const line = (id: number) => ({ id, quantity: 1 })

function setup(x: number, z: number, knockedOutUntil = 0) {
  const player = { sessionId: 's1', accountId: 1, token: 'token-s1', x, y: 1.6, z, knockedOutUntil } as unknown as Player
  const room = { players: new Map([['s1', player]]) } as unknown as GameRoom
  const sent: Sent[] = []
  const client: FakeClient = { sessionId: 's1', sent, send: (type, payload) => void sent.push({ type, payload }) }
  apiCalls.length = 0
  return { room, client }
}

test('a player inside the zone pays the basket through the API', async () => {
  const { room, client } = setup(-20, -150)
  await onZoneCheckout(room, client, { zone: 'farm', checkoutKey: KEY, items: [{ id: 3, quantity: 2 }, { id: 7, quantity: 1 }], request: 4 })
  assert.deepEqual(apiCalls, [{ path: '/zone/checkout', body: { zone: 'farm', checkout_key: KEY, items: [{ shop_catalog_item_id: 3, quantity: 2 }, { shop_catalog_item_id: 7, quantity: 1 }] } }])
  assert.deepEqual(client.sent, [{ type: 'zone_checkout_done', payload: { purchases: [], balance_after: 95, request: 4 } }])
})

test('a player outside the zone cannot pay there', async () => {
  const { room, client } = setup(-20, -120)
  await onZoneCheckout(room, client, { zone: 'farm', checkoutKey: KEY, items: [line(3)] })
  assert.deepEqual(apiCalls, [])
  assert.equal(client.sent[0]!.payload.code, 'zone_too_far')
})

test('a zone without bounds or a bad basket is refused before the API', async () => {
  for (const [payload, code] of [
    [{ zone: 'town', checkoutKey: KEY, items: [line(3)] }, 'zone_unknown'],
    [{ zone: 'farm', checkoutKey: KEY, items: [] }, 'zone_bad_basket'],
    [{ zone: 'farm', checkoutKey: KEY, items: [line(1.5)] }, 'zone_bad_basket'],
    [{ zone: 'farm', checkoutKey: KEY, items: [{ id: 3, quantity: 21 }] }, 'zone_bad_basket'],
    [{ zone: 'farm', checkoutKey: KEY, items: [{ id: 3, quantity: 0 }] }, 'zone_bad_basket'],
    [{ zone: 'farm', checkoutKey: KEY, items: [line(3), line(3)] }, 'zone_bad_basket'],
    [{ zone: 'farm', checkoutKey: KEY, items: Array.from({ length: 51 }, (_, i) => line(i + 1)) }, 'zone_bad_basket'],
    [{ zone: 'farm', checkoutKey: 'not-a-key', items: [line(3)] }, 'zone_bad_basket'],
    [{ zone: 'farm', items: [line(3)] }, 'zone_bad_basket'],
    [{ checkoutKey: KEY, items: [line(3)] }, 'zone_bad_basket'],
  ] as const) {
    const { room, client } = setup(-20, -150)
    await onZoneCheckout(room, client, payload)
    assert.deepEqual(apiCalls, [])
    assert.equal(client.sent[0]!.payload.code, code)
  }
})

test('a knocked out player cannot pay', async () => {
  const { room, client } = setup(-20, -150, Date.now() + 10_000)
  await onZoneCheckout(room, client, { zone: 'farm', checkoutKey: KEY, items: [line(3)] })
  assert.deepEqual(apiCalls, [])
  assert.equal(client.sent[0]!.payload.code, 'zone_cannot_pay')
})

test('an API refusal reaches the player with its code', async () => {
  const { room, client } = setup(-20, -150)
  nextApiError = { status: 422, code: 'not_sold_here', message: 'This item is not sold here.' }
  await onZoneCheckout(room, client, { zone: 'farm', checkoutKey: KEY, items: [line(3)] })
  assert.equal(client.sent[0]!.type, 'zone_checkout_error')
  assert.equal(client.sent[0]!.payload.code, 'not_sold_here')
})

test('a player next to a buyer sells to it through the API', async () => {
  const { room, client } = setup(-15, -143)
  await onZoneSell(room, client, { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 4 })
  assert.deepEqual(apiCalls, [{ path: '/zone/sell', body: { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 4 } }])
  assert.equal(client.sent[0]!.type, 'zone_sold')
})

test('selling needs a buyer area, a valid quantity and the player within 3 m of the buyer', async () => {
  for (const [x, z, payload, code] of [
    [-14, -150, { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 1 }, 'zone_too_far'],
    [-15, -143, { zone: 'farm', area: 'stall', code: 'farm_corn', quantity: 1 }, 'zone_unknown_buyer'],
    [-15, -143, { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 0 }, 'zone_bad_sale'],
    [-15, -143, { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 1000 }, 'zone_bad_sale'],
    [-15, -143, { zone: 'farm', area: 'stand', quantity: 1 }, 'zone_bad_sale'],
  ] as const) {
    const { room, client } = setup(x, z)
    await onZoneSell(room, client, payload)
    assert.deepEqual(apiCalls, [])
    assert.deepEqual([client.sent[0]!.type, client.sent[0]!.payload.code], ['zone_sell_error', code])
  }
})

test('a buyer moved in the zone file is found at its new place without a restart', async () => {
  const before = farmZone.props[0]!.position
  farmZone.props[0]!.position = [-30, 0, -170]
  try {
    const near = setup(-30, -171)
    await onZoneSell(near.room, near.client, { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 1 })
    assert.equal(near.client.sent[0]!.type, 'zone_sold')
    const old = setup(-15, -143)
    await onZoneSell(old.room, old.client, { zone: 'farm', area: 'stand', code: 'farm_corn', quantity: 1 })
    assert.equal(old.client.sent[0]!.payload.code, 'zone_too_far')
  } finally {
    farmZone.props[0]!.position = before
  }
})

test('a shop zone inside a main zone takes payments inside its own bounds only', async () => {
  const inside = setup(-25, -155)
  await onZoneCheckout(inside.room, inside.client, { zone: 'barn_shop', checkoutKey: KEY, items: [line(3)], request: 1 })
  assert.deepEqual(apiCalls, [{ path: '/zone/checkout', body: { zone: 'barn_shop', checkout_key: KEY, items: [{ shop_catalog_item_id: 3, quantity: 1 }] } }])
  const outside = setup(-10, -155)
  await onZoneCheckout(outside.room, outside.client, { zone: 'barn_shop', checkoutKey: KEY, items: [line(3)], request: 2 })
  assert.equal(outside.client.sent[0]!.payload.code, 'zone_too_far')
})
