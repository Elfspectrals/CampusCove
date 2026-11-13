import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const unit = (n: number, z: number) => ({ id: `unit_0${n}`, door: `Door_Rollup_0${n}`, threshold: [137.7, 0.2, z], inside: [137.7, 0.2, z - 2.6], size: [4, 2.6, 4], yaw: 0 })
const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [{ key: 'town', buildings: [] }],
  storage: { auctioneer: [163.6, 0.8, 9], lotBoard: [166, 3.5, 9], units: [unit(1, 6.6), unit(2, 6.6)] }
}

const apiCalls: Array<{ path: string, body: any, auth: string | null }> = []
const apiAnswers: Record<string, () => Response> = {}

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  if (path.endsWith('/zones/index.json')) return new Response(JSON.stringify({ version: 1, zones: [] }))
  const apiPath = path.replace(/^.*\/api/, '')
  const headers = (init?.headers ?? {}) as Record<string, string>
  apiCalls.push({ path: apiPath, body: init?.body ? JSON.parse(String(init.body)) : null, auth: headers.Authorization ?? null })
  const answer = Object.entries(apiAnswers).find(([prefix]) => apiPath.startsWith(prefix))
  return answer ? answer[1]() : new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { newStorageAuction, onAdminStorageSale, onStorageBid, onStorageOpen, startStorageSale, tickStorageAuction } = await import('./storageAuction.ts')
const { BID_EXTENSION_MS, OPENING_WINDOW_MS, PREVIEW_MS, WALK_MS } = await import('./storageSale.ts')
await loadWorld()

const lots = { lots: [{ lot_public_id: 'lot-a', source: 'generated', former_owner_name: null, opening_bid: 250, nights_listed: 0, next_bid: 250, contents: [] }] }

function setup() {
  const players = new Map<string, Player>()
  const clients: FakeClient[] = []
  const room = { players, clients, storageAuction: newStorageAuction(), forEachClient: (cb: (c: GameClient) => void) => clients.forEach(cb) }
  const join = (sessionId: string, accountId: number, x: number, z: number, isAdmin = false) => {
    const player = { sessionId, accountId, pseudo: `p${accountId}`, token: `token-${sessionId}`, isAdmin, x, y: 1.6, z, knockedOutUntil: 0 } as unknown as Player
    players.set(sessionId, player)
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as unknown as FakeClient
    clients.push(client)
    return { player, client }
  }
  apiCalls.length = 0
  for (const key of Object.keys(apiAnswers)) delete apiAnswers[key]
  apiAnswers['/storage/sale'] = () => new Response(JSON.stringify(lots))
  return { room: room as any, join }
}

async function openBidding(room: any, t: number): Promise<number> {
  await startStorageSale(room, '2026-11-13', t)
  await tickStorageAuction(room, t + WALK_MS)
  await tickStorageAuction(room, t + WALK_MS + PREVIEW_MS)
  return t + WALK_MS + PREVIEW_MS
}

test('a bid in the circle sends the next bid the server holds and adds 10 s', async () => {
  const { room, join } = setup()
  const { client } = join('s1', 1, 137.7, 9.6)
  const opened = await openBidding(room, 1_000_000)
  apiAnswers['/storage/lots/lot-a/bid'] = () => new Response(JSON.stringify({ amount: 250, leader_account_id: 1, next_bid: 260 }))

  await onStorageBid(room, client, opened + 1000)

  assert.deepEqual(apiCalls.at(-1), { path: '/storage/lots/lot-a/bid', body: { amount: 250 }, auth: 'Bearer token-s1' })
  assert.equal(room.storageAuction.sale.phaseEndsAt, opened + OPENING_WINDOW_MS + BID_EXTENSION_MS)
  assert.deepEqual(room.storageAuction.sale.leader, { accountId: 1, pseudo: 'p1', amount: 250 })
  assert.equal(client.sent.at(-1)!.type, 'storage_sale')
})

test('a bid outside the circle, during the preview or from the leader is refused before the API', async () => {
  const { room, join } = setup()
  const far = join('s1', 1, 137.7, 9.6 + 6.5)
  const near = join('s2', 2, 137.7, 9.6)
  await startStorageSale(room, '2026-11-13', 0)
  await tickStorageAuction(room, WALK_MS)
  await onStorageBid(room, near.client, WALK_MS + 1)
  assert.equal(near.client.sent.at(-1)!.payload.code, 'storage_not_bidding')

  await tickStorageAuction(room, WALK_MS + PREVIEW_MS)
  apiCalls.length = 0
  await onStorageBid(room, far.client, WALK_MS + PREVIEW_MS + 1)
  assert.equal(far.client.sent.at(-1)!.payload.code, 'storage_out_of_zone')

  room.storageAuction.sale.leader = { accountId: 2, pseudo: 'p2', amount: 250 }
  await onStorageBid(room, near.client, WALK_MS + PREVIEW_MS + 2)
  assert.equal(near.client.sent.at(-1)!.payload.code, 'storage_already_leading')
  assert.equal(apiCalls.length, 0)
})

test('the hammer falls when the time is up and the winner opens the box at its threshold only', async () => {
  const { room, join } = setup()
  const winner = join('s1', 1, 137.7, 10)
  const other = join('s2', 2, 137.7, 6.8)
  const opened = await openBidding(room, 0)
  room.storageAuction.sale.leader = { accountId: 1, pseudo: 'p1', amount: 250 }
  apiAnswers['/storage/lots/lot-a/hammer'] = () => new Response(JSON.stringify({ lot_public_id: 'lot-a', status: 'sold', winner_account_id: 1, sale_price: 250, opening_bid: 250 }))
  apiAnswers['/storage/lots/lot-a/open'] = () => new Response(JSON.stringify({ lot_public_id: 'lot-a', contents: [{ code: 'decor_cactus', quantity: 3 }] }))

  await tickStorageAuction(room, opened + OPENING_WINDOW_MS)

  assert.equal(room.storageAuction.sale.phase, 'result')
  assert.deepEqual(room.storageAuction.won, [{ lotId: 'lot-a', unitId: 'unit_01', winnerAccountId: 1, winnerPseudo: 'p1' }])
  await onStorageOpen(room, other.client, { lotId: 'lot-a' })
  assert.equal(other.client.sent.at(-1)!.payload.code, 'storage_cannot_open')
  await onStorageOpen(room, winner.client, { lotId: 'lot-a' })
  assert.equal(winner.client.sent.at(-1)!.payload.code, 'storage_cannot_open')
  winner.player.z = 6.8
  await onStorageOpen(room, winner.client, { lotId: 'lot-a' })
  const reveal = other.client.sent.find((m) => m.type === 'storage_opened')
  assert.deepEqual(reveal!.payload, { lotId: 'lot-a', unitId: 'unit_01', pseudo: 'p1', contents: [{ code: 'decor_cactus', quantity: 3 }] })
  assert.deepEqual(room.storageAuction.won, [])
})

test('a failed hammer is tried again on the next tick', async () => {
  const { room } = setup()
  const opened = await openBidding(room, 0)
  apiAnswers['/storage/lots/lot-a/hammer'] = () => new Response(JSON.stringify({ code: 'backend_error' }), { status: 500 })
  await assert.rejects(tickStorageAuction(room, opened + OPENING_WINDOW_MS))
  assert.equal(room.storageAuction.sale.phase, 'hammering')
  apiAnswers['/storage/lots/lot-a/hammer'] = () => new Response(JSON.stringify({ status: 'listed', winner_account_id: null, sale_price: null }))
  await tickStorageAuction(room, opened + OPENING_WINDOW_MS + 250)
  assert.equal(room.storageAuction.sale.phase, 'result')
})

test('only an admin starts a sale by hand', async () => {
  const { room, join } = setup()
  const player = join('s1', 1, 0, 0)
  await onAdminStorageSale(room, player.client, 0)
  assert.equal(room.storageAuction.sale, null)
  const admin = join('s2', 2, 0, 0, true)
  await onAdminStorageSale(room, admin.client, Date.parse('2026-11-13T12:00:00Z'))
  assert.equal(room.storageAuction.sale.night, '2026-11-13')
  assert.equal(apiCalls[0]!.auth, null)
})
