import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type AdminMenuRoom, type AdminPanelRoom, SUMMON_DISTANCE, onAdminGiveItem, onAdminGiveMoney, onAdminGoto, onAdminItems, onAdminMarket, onAdminOpen, onAdminPlayer, onAdminSummon, onAdminTaxes, onAdminTeleport } from './admin.ts'
import { newStorageAuction } from './storageAuction.ts'
import type { Player } from './types.ts'
import { type TeleportDestination, doorDestination, orchardDestination, zoneGateDestination } from './world.ts'

interface Sent { type: string, payload: any }
type FakeClient = ReturnType<typeof fakeClient>

function fakeClient(sessionId: string) {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, isAdmin: boolean, x = 0, z = 0, ry = 0): Player {
  return {
    sessionId,
    pseudo: sessionId.toUpperCase(),
    isAdmin,
    x,
    y: 1.6,
    z,
    ry,
    tradeId: null,
    seatId: null,
    clinicBedId: null,
    knockedOutUntil: 0,
    lastAdminActionAt: 0,
    wantedStars: 0,
    pubShots: null
  } as Player
}

function fakeRoom(...players: Player[]): AdminMenuRoom & { clients: FakeClient[], moves: string[] } {
  const moves: string[] = []
  return {
    roomId: 'room-1',
    players: new Map(players.map((p) => [p.sessionId, p])),
    cashBags: new Map(),
    market: null,
    clients: players.map((p) => fakeClient(p.sessionId)),
    housingUnits: [],
    houseFurniture: [],
    openDoors: new Set(),
    clinicBeds: new Map(),
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map(), quiz: null, quizSchedule: 0 },
    trades: new Map(),
    clock: { setTimeout: () => undefined },
    forEachClient: () => undefined,
    broadcastMove: (client) => void moves.push(client.sessionId),
    refreshHouseFurniture: async () => undefined,
    storageAuction: newStorageAuction(),
    moves
  }
}

const CLINIC = doorDestination('clinic', 'Clinic', { x: -122, y: 0, z: 12 }, { x: -115.5, y: 1.25, z: 12 })
const destinations = (): TeleportDestination[] => [CLINIC]

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

test('a door destination stands outside the door and looks back at it', () => {
  assert.equal(CLINIC.position.x, -113)
  assert.equal(CLINIC.position.z, 12)
  assert.equal(CLINIC.position.y, 1.6)
  // camera forward is (-sin yaw, -cos yaw): towards the building, i.e. -x
  assert.ok(Math.abs(-Math.sin(CLINIC.yaw) - -1) < 1e-9)
  assert.ok(Math.abs(Math.cos(CLINIC.yaw)) < 1e-9)
})

test('only admins get the admin menu', () => {
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false, 3, 4))
  const [admin, player] = room.clients
  onAdminOpen(room, player, destinations)
  assert.deepEqual(player.sent, [])
  room.players.get('b')!.wantedStars = 2
  onAdminOpen(room, admin, destinations, NOON_PARIS)
  const [menu] = received(admin, 'admin_menu')
  assert.deepEqual(menu.destinations, [{ key: 'clinic', name: 'Clinic' }])
  assert.deepEqual(menu.players, [{ sessionId: 'b', pseudo: 'B', distance: 5, stars: 2 }])
})

const NOON_PARIS = Date.parse('2026-11-14T11:00:00Z')

test('the admin menu tells when each event comes next', () => {
  const room = fakeRoom(fakePlayer('a', true))
  const [admin] = room.clients
  onAdminOpen(room, admin, destinations, NOON_PARIS)
  assert.deepEqual(received(admin, 'admin_menu')[0].events, {
    quiz: { state: 'scheduled', startsAt: Date.parse('2026-11-14T20:00:00Z') },
    storage: { state: 'scheduled', startsAt: Date.parse('2026-11-14T18:00:00Z') },
    market: null
  })
})

test('the admin menu shows a running quiz, storage sale and the market hours', () => {
  const room = fakeRoom(fakePlayer('a', true))
  const [admin] = room.clients
  room.pub.quiz = { startsAt: 5, phase: { kind: 'question' } } as never
  room.storageAuction.sale = { index: 2, lots: [{}, {}, {}, {}] } as never
  room.market = { open: true, opens_at: '2026-11-14T14:00:00Z', closes_at: '2026-11-14T16:00:00Z', stalls: [] }
  onAdminOpen(room, admin, destinations, NOON_PARIS)
  assert.deepEqual(received(admin, 'admin_menu')[0].events, {
    quiz: { state: 'running', startsAt: 5 },
    storage: { state: 'running', index: 2, count: 4 },
    market: { open: true, opensAt: '2026-11-14T14:00:00Z', closesAt: '2026-11-14T16:00:00Z' }
  })
})

test('an admin teleports to a listed place; a player cannot', () => {
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false))
  const [admin, player] = room.clients
  onAdminTeleport(room, player, { key: 'clinic' }, 1000, destinations)
  assert.equal(room.players.get('b')!.x, 0)
  onAdminTeleport(room, admin, { key: 'clinic' }, 1000, destinations)
  const moved = room.players.get('a')!
  assert.deepEqual({ x: moved.x, y: moved.y, z: moved.z, fallPeakY: moved.fallPeakY }, { x: -113, y: 1.6, z: 12, fallPeakY: 1.6 })
  assert.deepEqual(received(admin, 'teleported'), [{ x: -113, y: 1.6, z: 12, ry: CLINIC.yaw }])
  assert.deepEqual(room.moves, ['a'])
  onAdminTeleport(room, admin, { key: 'nowhere' }, 5000, destinations)
  assert.equal(received(admin, 'admin_error').length, 1)
})

test('the orchard teleport lands an admin 2.5 m in front of the first tree, facing it', () => {
  const room = fakeRoom(fakePlayer('a', true))
  const [admin] = room.clients
  onAdminTeleport(room, admin, { key: 'orchard' }, 1000, () => [orchardDestination({ x: -34.745, y: 0, z: -104.231 })])
  assert.deepEqual(received(admin, 'teleported'), [{ x: -34.745, y: 1.6, z: -101.731, ry: 0 }])
})

test('the farm teleport lands an admin 2.5 m inside the gate, facing into the farm', () => {
  const room = fakeRoom(fakePlayer('a', true))
  const [admin] = room.clients
  const farm = zoneGateDestination('farm', 'Farm', { x: -8.5, z: -130 }, { minX: -8.5, maxX: -8.5, minZ: -200, maxZ: -130 })
  onAdminTeleport(room, admin, { key: 'farm' }, 1000, () => [farm])
  assert.deepEqual(received(admin, 'teleported'), [{ x: -8.5, y: 1.6, z: -132.5, ry: 0 }])
})

test('a summoned player lands in front of the admin, facing them', () => {
  const room = fakeRoom(fakePlayer('a', true, 10, 10, 0), fakePlayer('b', false, -50, 40))
  const [admin, target] = room.clients
  onAdminSummon(room, admin, { sessionId: 'b' }, 1000)
  const moved = room.players.get('b')!
  assert.equal(moved.x, 10)
  assert.equal(moved.z, 10 - SUMMON_DISTANCE)
  assert.equal(moved.ry, Math.PI)
  assert.equal(received(target, 'teleported').length, 1)
  assert.deepEqual(received(target, 'admin_summoned'), [{ byPseudo: 'A' }])
})

test('an admin goes to a player: in front of them, facing them', () => {
  const room = fakeRoom(fakePlayer('a', true, 10, 10, 0), fakePlayer('b', false, -50, 40, 0))
  const [admin, target] = room.clients
  onAdminGoto(room, admin, { sessionId: 'b' }, 1000)
  const moved = room.players.get('a')!
  assert.equal(moved.x, -50)
  assert.equal(moved.z, 40 - SUMMON_DISTANCE)
  assert.equal(moved.ry, Math.PI)
  assert.equal(received(admin, 'teleported').length, 1)
  assert.equal(room.players.get('b')!.x, -50)
  assert.deepEqual(target.sent, [])
})

test('a player cannot go to someone, and an admin cannot go to a missing player or to themself', () => {
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false, 3, 3))
  const [admin, player] = room.clients
  onAdminGoto(room, player, { sessionId: 'a' }, 1000)
  assert.equal(room.players.get('b')!.x, 3)
  onAdminGoto(room, admin, { sessionId: 'zz' }, 1000)
  onAdminGoto(room, admin, { sessionId: 'a' }, 2000)
  assert.equal(room.players.get('a')!.x, 0)
  assert.equal(received(admin, 'admin_error').length, 2)
})

test('players cannot summon, and the clinic keeps its patients', () => {
  const patient = fakePlayer('c', false, 5, 5)
  patient.knockedOutUntil = 10_000
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false, 3, 3), patient)
  const [admin, player] = room.clients
  onAdminSummon(room, player, { sessionId: 'a' }, 1000)
  assert.equal(room.players.get('a')!.x, 0)
  onAdminSummon(room, admin, { sessionId: 'c' }, 1000)
  assert.equal(room.players.get('c')!.x, 5)
  assert.equal(received(admin, 'admin_error').length, 1)
})

const apiCalls: Array<{ method: string, path: string, body: any, token: string | null }> = []
const apiAnswers = new Map<string, unknown>()
let nextApiError: { status: number, code: string, message: string } | null = null

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url).replace(/^.*\/api/, '')
  const method = init?.method ?? 'GET'
  apiCalls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null, token: new Headers(init?.headers).get('authorization') })
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  return new Response(JSON.stringify(apiAnswers.get(`${method} ${path}`) ?? {}))
}

const MARKET = { open: true, market_date: '2026-11-13', opens_at: '2026-11-13T10:00:00Z', closes_at: '2026-11-13T10:10:00Z', stalls: [] }
apiAnswers.set('POST /admin/game/money', { cash: 600, bank: 50 })
apiAnswers.set('POST /admin/game/items', { account_id: 7, code: 'farm_apple', quantity: 2 })
apiAnswers.set('GET /admin/game/items', { items: [{ code: 'farm_apple', name: 'Apple', kind: 'consumable' }] })
apiAnswers.set('POST /admin/game/market/open', MARKET)
apiAnswers.set('POST /admin/game/market/close', { returned: 3, market: { ...MARKET, open: false } })
apiAnswers.set('GET /market', MARKET)
apiAnswers.set('POST /admin/game/taxes/collect', { charged: 2, seized: 1 })

function panelRoom(): AdminPanelRoom & { clients: FakeClient[], moves: string[], housingPolls: number } {
  const admin = Object.assign(fakePlayer('a', true), { accountId: 1, token: 'admin-token' })
  const player = Object.assign(fakePlayer('b', false), { accountId: 7, token: 'player-token' })
  const room = Object.assign(fakeRoom(admin, player), {
    housingPolls: 0,
    pollHousingUnits: async () => void (room.housingPolls += 1)
  })
  room.forEachClient = (callback, except) => room.clients.filter((c) => c !== except).forEach(callback)
  apiCalls.length = 0
  return room
}

test('a player sending admin panel messages is ignored and nothing reaches the API', async () => {
  const room = panelRoom()
  const [, player] = room.clients
  await onAdminItems(room, player, 1000)
  await onAdminGiveMoney(room, player, { sessionId: 'b', wallet: 'cash', amount: 500 }, 2000)
  await onAdminGiveItem(room, player, { sessionId: 'b', code: 'farm_apple', quantity: 1 }, 3000)
  await onAdminMarket(room, player, { action: 'open', minutes: 10 }, 4000)
  await onAdminTaxes(room, player, 5000)
  assert.deepEqual(apiCalls, [])
  assert.deepEqual(player.sent, [])
})

test('an admin gives cash to a player: the account id comes from the socket and the target is told', async () => {
  const room = panelRoom()
  const [admin, target] = room.clients
  await onAdminGiveMoney(room, admin, { sessionId: 'b', wallet: 'cash', amount: 500, account_id: 99, ref: 'forged' }, 1000, () => 'ref-1')
  assert.deepEqual(apiCalls, [{ method: 'POST', path: '/admin/game/money', body: { account_id: 7, wallet: 'cash', amount: 500, ref: 'ref-1' }, token: 'Bearer admin-token' }])
  assert.deepEqual(received(admin, 'admin_result'), [{ action: 'money', ok: true, sessionId: 'b', pseudo: 'B', wallet: 'cash', amount: 500, cash: 600, bank: 50 }])
  assert.deepEqual(received(target, 'admin_granted'), [{ kind: 'money', byPseudo: 'A', wallet: 'cash', amount: 500, cash: 600, bank: 50 }])
})

test('each money message gets a new ref', async () => {
  const room = panelRoom()
  const [admin] = room.clients
  await onAdminGiveMoney(room, admin, { sessionId: 'a', wallet: 'bank', amount: 1 }, 1000)
  await onAdminGiveMoney(room, admin, { sessionId: 'a', wallet: 'bank', amount: 1 }, 2000)
  const [first, second] = apiCalls.map((c) => c.body.ref)
  assert.match(first, /^[0-9a-f-]{36}$/)
  assert.notEqual(first, second)
  assert.equal(apiCalls[0].body.account_id, 1)
})

test('money outside 1..100000, an unknown wallet or a missing target is refused before the API', async () => {
  const room = panelRoom()
  const [admin] = room.clients
  const payloads = [
    { sessionId: 'b', wallet: 'cash', amount: 0 },
    { sessionId: 'b', wallet: 'cash', amount: 100_001 },
    { sessionId: 'b', wallet: 'cash', amount: 1.5 },
    { sessionId: 'b', wallet: 'gems', amount: 10 },
    { sessionId: 'gone', wallet: 'cash', amount: 10 }
  ]
  for (const [i, payload] of payloads.entries()) await onAdminGiveMoney(room, admin, payload, 1000 * (i + 1))
  assert.deepEqual(apiCalls, [])
  assert.deepEqual(received(admin, 'admin_result').map((r) => r.ok), [false, false, false, false, false])
  await onAdminGiveMoney(room, admin, { sessionId: 'b', wallet: 'cash', amount: 100_000 }, 9000)
  assert.equal(apiCalls.length, 1)
})

test('admin actions inside the cooldown are dropped', async () => {
  const room = panelRoom()
  const [admin] = room.clients
  await onAdminGiveMoney(room, admin, { sessionId: 'b', wallet: 'cash', amount: 5 }, 1000)
  await onAdminGiveMoney(room, admin, { sessionId: 'b', wallet: 'cash', amount: 5 }, 1400)
  assert.equal(apiCalls.length, 1)
})

test('an admin gives an item; the quantity stays within 1..999', async () => {
  const room = panelRoom()
  const [admin, target] = room.clients
  await onAdminGiveItem(room, admin, { sessionId: 'b', code: 'farm_apple', quantity: 1000 }, 1000)
  await onAdminGiveItem(room, admin, { sessionId: 'b', code: 'farm apple', quantity: 2 }, 2000)
  assert.equal(apiCalls.length, 0)
  await onAdminGiveItem(room, admin, { sessionId: 'b', code: 'farm_apple', quantity: 2 }, 3000, () => 'ref-2')
  assert.deepEqual(apiCalls.map((c) => c.body), [{ account_id: 7, code: 'farm_apple', quantity: 2, ref: 'ref-2' }])
  assert.deepEqual(received(admin, 'admin_result').at(-1), { action: 'item', ok: true, pseudo: 'B', code: 'farm_apple', quantity: 2 })
  assert.deepEqual(received(target, 'admin_granted'), [{ kind: 'item', byPseudo: 'A', code: 'farm_apple', quantity: 2 }])
})

test('an API refusal reaches the admin and the target is not told', async () => {
  const room = panelRoom()
  const [admin, target] = room.clients
  nextApiError = { status: 422, code: 'admin_item_premium', message: 'This item is bought with gems.' }
  await onAdminGiveItem(room, admin, { sessionId: 'b', code: 'skin_night_owl', quantity: 1 }, 1000)
  assert.deepEqual(received(admin, 'admin_result'), [{ action: 'item', ok: false, message: 'This item is bought with gems.' }])
  assert.deepEqual(target.sent, [])
})

test('the item list goes back to the admin only', async () => {
  const room = panelRoom()
  const [admin, player] = room.clients
  await onAdminItems(room, admin, 1000)
  assert.deepEqual(received(admin, 'admin_items'), [{ items: [{ code: 'farm_apple', name: 'Apple', kind: 'consumable' }] }])
  assert.deepEqual(player.sent, [])
})

test('opening the market for 10 minutes sends a fresh market_sync to everyone', async () => {
  const room = panelRoom()
  const [admin, player] = room.clients
  await onAdminMarket(room, admin, { action: 'open', minutes: 10 }, 1000)
  assert.deepEqual(apiCalls.map((c) => `${c.method} ${c.path}`), ['POST /admin/game/market/open', 'GET /market'])
  assert.deepEqual(apiCalls[0].body, { minutes: 10 })
  assert.deepEqual(received(admin, 'admin_result'), [{ action: 'market_open', ok: true, closesAt: MARKET.closes_at }])
  assert.deepEqual(received(player, 'market_sync'), [MARKET])
  assert.deepEqual(received(admin, 'market_sync'), [MARKET])
})

test('market minutes outside 1..240 are refused; closing reports the lots returned', async () => {
  const room = panelRoom()
  const [admin, player] = room.clients
  await onAdminMarket(room, admin, { action: 'open', minutes: 241 }, 1000)
  await onAdminMarket(room, admin, { action: 'open', minutes: 0 }, 2000)
  assert.deepEqual(apiCalls, [])
  await onAdminMarket(room, admin, { action: 'close' }, 3000)
  assert.deepEqual(received(admin, 'admin_result').at(-1), { action: 'market_close', ok: true, returned: 3 })
  assert.equal(received(player, 'market_sync').length, 1)
})

test('collecting taxes reports the houses charged and seized, then reloads the housing units', async () => {
  const room = panelRoom()
  const [admin] = room.clients
  await onAdminTaxes(room, admin, 1000)
  assert.deepEqual(received(admin, 'admin_result'), [{ action: 'taxes', ok: true, charged: 2, seized: 1 }])
  assert.equal(room.housingPolls, 1)
})

apiAnswers.set('GET /admin/game/wallets?account_id=7', { cash: 85, bank: 1240 })

test('the player sheet reads the cash and bank from the API and the stars from the socket', async () => {
  const room = panelRoom()
  const [admin, player] = room.clients
  room.players.get('b')!.wantedStars = 3
  await onAdminPlayer(room, player, { sessionId: 'b' })
  assert.deepEqual(apiCalls, [])
  await onAdminPlayer(room, admin, { sessionId: 'b' })
  assert.deepEqual(apiCalls, [{ method: 'GET', path: '/admin/game/wallets?account_id=7', body: null, token: 'Bearer admin-token' }])
  assert.deepEqual(received(admin, 'admin_player'), [{ sessionId: 'b', cash: 85, bank: 1240, stars: 3 }])
  await onAdminPlayer(room, admin, { sessionId: 'gone' })
  assert.equal(received(admin, 'admin_error').length, 1)
})
