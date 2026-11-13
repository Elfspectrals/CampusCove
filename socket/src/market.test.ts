import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, MarketSnapshot, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = { spawn: [0, 1.6, 13], bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, zones: [{ key: 'town', buildings: [] }] }
const zoneIndex = { version: 1, zones: ['town_market'] }
const marketZone = {
  version: 1,
  zone: 'town_market',
  name: 'Market',
  props: [
    { id: 'stall_1', kind: 'decor', key: 'market_stall', stallNo: 1, position: [0, 0, 0] },
    { id: 'stall_2', kind: 'decor', key: 'market_stall', stallNo: 2, position: [10, 0, 0] }
  ],
  areas: []
}

function snapshot(open: boolean): MarketSnapshot {
  return {
    open,
    opens_at: '2026-11-14T15:00:00+01:00',
    closes_at: '2026-11-14T17:00:00+01:00',
    stalls: open ? [{ stall_no: 2, account_id: 7, lots: [{ lot_id: 31, code: 'farm_apple', quantity: 10 }] }] : []
  }
}

const apiCalls: Array<{ path: string, method: string, body: any }> = []
let nextApiError: { status: number, code: string, message: string } | null = null
let apiMarket = snapshot(true)

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  if (path === 'http://world.test/zones/index.json') return new Response(JSON.stringify(zoneIndex))
  if (path === 'http://world.test/zones/town_market.json') return new Response(JSON.stringify(marketZone))
  const apiPath = path.replace(/^.*\/api/, '')
  apiCalls.push({ path: apiPath, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
  if (apiPath === '/market') return new Response(JSON.stringify(apiMarket))
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  return new Response(JSON.stringify({ cash: 80, quantity_left: 8 }))
}

const { loadWorld, loadMarketStalls } = await import('./world.ts')
const { MARKET_COOLDOWN_MS, STALL_REACH, marketIsStale, onMarket, parseMarketIntent, sendMarketOnJoin } = await import('./market.ts')
await loadWorld()
await loadMarketStalls()

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
}

function fakePlayer(sessionId: string, accountId: number, x: number, z: number): Player {
  return { sessionId, accountId, token: `token-${sessionId}`, x, y: 1.6, z, knockedOutUntil: 0, lastMarketAt: 0 } as unknown as Player
}

function setup(x: number, z: number, market: MarketSnapshot | null = snapshot(true)) {
  const buyer = fakePlayer('s1', 42, x, z)
  const seller = fakePlayer('s2', 7, 50, 50)
  const client = fakeClient('s1')
  const sellerClient = fakeClient('s2')
  const clients = [client, sellerClient]
  const timers: number[] = []
  const room = {
    players: new Map([['s1', buyer], ['s2', seller]]),
    market,
    clients,
    clock: { setTimeout: (_handler: () => void, ms: number) => void timers.push(ms) },
    forEachClient: (callback: (c: GameClient) => void, except?: GameClient) => clients.filter((c) => c.sessionId !== except?.sessionId).forEach(callback)
  } as unknown as GameRoom
  apiCalls.length = 0
  apiMarket = snapshot(true)
  return { room, client, sellerClient, buyer, timers }
}

const types = (client: FakeClient) => client.sent.map((m) => m.type)

test('intents are parsed field by field and anything out of range is refused', () => {
  assert.deepEqual(parseMarketIntent({ action: 'claim', stallNo: 6, canopy: 'blue' }), { action: 'claim', stallNo: 6, canopy: 'blue' })
  assert.deepEqual(parseMarketIntent({ action: 'list', slot: 1, code: 'farm_apple', quantity: 999, unitPrice: 1_000_000, container: 'basket' }), { action: 'list', slot: 1, code: 'farm_apple', quantity: 999, unitPrice: 1_000_000, container: 'basket' })
  assert.deepEqual(parseMarketIntent({ action: 'buy', lotId: 31, quantity: 2, ref: 'abcd-1234' }), { action: 'buy', lotId: 31, quantity: 2, ref: 'abcd-1234' })
  for (const payload of [
    { action: 'claim', stallNo: 0, canopy: 'blue' },
    { action: 'claim', stallNo: 7, canopy: 'blue' },
    { action: 'claim', stallNo: 1, canopy: 'Blue!' },
    { action: 'list', slot: 7, code: 'farm_apple', quantity: 1, unitPrice: 1 },
    { action: 'list', slot: 1, code: 'farm apple', quantity: 1, unitPrice: 1 },
    { action: 'list', slot: 1, code: 'farm_apple', quantity: 1000, unitPrice: 1 },
    { action: 'list', slot: 1, code: 'farm_apple', quantity: 1, unitPrice: 0 },
    { action: 'list', slot: 1, code: 'farm_apple', quantity: 1, unitPrice: 2.5, container: 'crate' },
    { action: 'list', slot: 1, code: 'farm_apple', quantity: 1, unitPrice: 1, container: 'barrel' },
    { action: 'list', slot: 1, code: 'farm_apple', quantity: 1, unitPrice: 1 },
    { action: 'buy', lotId: 31, quantity: 1, ref: 'x' },
    { action: 'buy', lotId: 0, quantity: 1, ref: 'abcd-1234' },
    { action: 'steal', lotId: 31 }
  ]) {
    assert.equal(parseMarketIntent(payload), null, JSON.stringify(payload))
  }
})

test('a purchase at the stall goes to the API with a ref scoped to the buyer, then the seller is told', async () => {
  const { room, client, sellerClient } = setup(10, STALL_REACH)
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 2, ref: 'abcd-1234', request: 5 }, 10_000)

  assert.deepEqual(apiCalls[0], { path: '/market/lots/31/buy', method: 'POST', body: { quantity: 2, purchase_ref: '42-abcd-1234' } })
  assert.deepEqual(client.sent[0], { type: 'market_done', payload: { action: 'buy', cash: 80, quantity_left: 8, request: 5 } })
  assert.deepEqual(sellerClient.sent[0], { type: 'market_sold', payload: { lotId: 31, code: 'farm_apple', quantity: 2 } })
  assert.equal(apiCalls[1].path, '/market')
  assert.ok(types(client).includes('market_sync') && types(sellerClient).includes('market_sync'))
})

test('a buyer just past the reach of the stall is refused without calling the API', async () => {
  const { room, client } = setup(10, STALL_REACH + 0.01)
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 1, ref: 'abcd-1234' }, 10_000)
  assert.equal(apiCalls.length, 0)
  assert.equal(client.sent[0].payload.code, 'market_too_far')
})

test('a stall is claimed from the stall itself and the API gets only validated fields', async () => {
  const { room, client } = setup(0, 1)
  await onMarket(room, client, { action: 'claim', stallNo: 1, canopy: 'red', account_id: 7 }, 10_000)
  assert.deepEqual(apiCalls[0], { path: '/market/stalls', method: 'POST', body: { stall_no: 1, canopy: 'red' } })

  const far = setup(0, 1)
  await onMarket(far.room, far.client, { action: 'claim', stallNo: 2, canopy: 'red' }, 10_000)
  assert.equal(far.client.sent[0].payload.code, 'market_too_far')
})

test('listing needs a stall of your own and is checked at that stall', async () => {
  const { room, client } = setup(10, 0)
  await onMarket(room, client, { action: 'list', slot: 1, code: 'farm_apple', quantity: 3, unitPrice: 5, container: 'crate' }, 10_000)
  assert.equal(client.sent[0].payload.code, 'market_no_stall')
  assert.equal(apiCalls.length, 0)
})

test('nothing reaches the API while the market is closed', async () => {
  const { room, client } = setup(10, 0, snapshot(false))
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 1, ref: 'abcd-1234' }, 10_000)
  assert.equal(client.sent[0].payload.code, 'market_closed')
  assert.equal(apiCalls.length, 0)
})

test('a second action inside the cooldown is refused, at the cooldown it goes through', async () => {
  const { room, client } = setup(10, 0)
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 1, ref: 'abcd-0001' }, 10_000)
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 1, ref: 'abcd-0002' }, 10_000 + MARKET_COOLDOWN_MS - 1)
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 1, ref: 'abcd-0003' }, 10_000 + MARKET_COOLDOWN_MS)
  assert.deepEqual(types(client).filter((t) => t !== 'market_sync'), ['market_done', 'market_error', 'market_done'])
})

test('a refusal from the API reaches the player with its code', async () => {
  const { room, client } = setup(10, 0)
  nextApiError = { status: 409, code: 'market_insufficient_cash', message: 'You do not have enough cash on you.' }
  await onMarket(room, client, { action: 'buy', lotId: 31, quantity: 1, ref: 'abcd-1234', request: 9 }, 10_000)
  assert.deepEqual(client.sent[0], { type: 'market_error', payload: { message: 'You do not have enough cash on you.', code: 'market_insufficient_cash', request: 9 } })
})

test('the market state goes stale at its next opening or closing time', () => {
  const closesAt = Date.parse('2026-11-14T17:00:00+01:00')
  assert.equal(marketIsStale(null), true)
  assert.equal(marketIsStale(snapshot(true), closesAt - 1), false)
  assert.equal(marketIsStale(snapshot(true), closesAt), true)
  assert.equal(marketIsStale(snapshot(false), Date.parse('2026-11-14T15:00:00+01:00') - 1), false)
})

test('a joining player gets the market state and a refresh is planned for the next boundary', async () => {
  const { room, client, buyer, timers } = setup(10, 0, null)
  await sendMarketOnJoin(room, client, buyer)
  assert.deepEqual(apiCalls.map((c) => c.path), ['/market'])
  assert.deepEqual(client.sent.map((m) => m.type), ['market_sync'])
  assert.equal(timers.length, 1)
})

test('a lot laid out at your own stall reaches the API with its container', async () => {
  const market = snapshot(true)
  market.stalls[0].account_id = 42
  const { room, client } = setup(10, 0, market)
  await onMarket(room, client, { action: 'list', slot: 3, code: 'farm_apple', quantity: 3, unitPrice: 5, container: 'flat' }, 10_000)
  assert.deepEqual(apiCalls[0], { path: '/market/lots', method: 'POST', body: { slot: 3, code: 'farm_apple', quantity: 3, unit_price: 5, container: 'flat' } })
})
