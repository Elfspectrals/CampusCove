import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_STAMINA } from './stamina.ts'
import type { CashBag, GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface ApiCall { path: string, method: string, body: any }

const apiCalls: ApiCall[] = []
let wantedFromApi: unknown = { stars: 0, decay_ms: 240_000 }
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url).replace(/^.*\/api/, '')
  apiCalls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path === '/wanted' && init?.method === 'GET') return new Response(JSON.stringify({ wanted: wantedFromApi }))
  if (path.startsWith('/cash-drops/')) return new Response(JSON.stringify({ amount: 240, cash: 240 }))
  return new Response(JSON.stringify({}))
}

const {
  ASSAULT_REPEAT_MS,
  CRIME_STARS,
  SELF_DEFENCE_MS,
  WANTED_DECAY_MS,
  addCrimeStars,
  decayWanted,
  loadWanted,
  parseWantedState,
  reportAssault,
  reportCrime,
  sendWantedOnJoin,
  tickWanted
} = await import('./wanted.ts')
const { onPunch } = await import('./punch.ts')
const { onCashBagPick } = await import('./cashBags.ts')

function setup() {
  const players = new Map<string, Player>()
  const clients: FakeClient[] = []
  const room = {
    players,
    clients,
    cashBags: new Map<number, CashBag>(),
    housingUnits: [],
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    clock: { setTimeout: () => undefined },
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.forEach((c) => {
      if (c.sessionId !== except?.sessionId) fn(c)
    })
  } as unknown as GameRoom
  const join = (sessionId: string, accountId: number, x = 0, z = 0) => {
    const player = {
      sessionId,
      accountId,
      token: `token-${sessionId}`,
      x,
      y: 1.6,
      z,
      ry: 0,
      stats: { health: 100, hunger: 100, thirst: 100 },
      knockedOutUntil: 0,
      lastPunchAt: 0,
      lastCashBagPickAt: 0,
      stamina: MAX_STAMINA,
      staminaSpentAt: 0,
      wantedStars: 0,
      wantedDecayMs: WANTED_DECAY_MS,
      wantedDirty: false,
      lastHitAt: new Map(),
      lastAssaultAt: new Map()
    } as unknown as Player
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
    players.set(sessionId, player)
    clients.push(client)
    return { player, client }
  }
  apiCalls.length = 0
  return { room, join }
}

const wantedSent = (client: FakeClient) => client.sent.filter((m) => m.type === 'wanted').map((m) => m.payload)

test('each crime kind gives its stars', () => {
  assert.deepEqual(CRIME_STARS, {
    assault: 1,
    murder: 3,
    bag_theft: 2,
    pickpocket_seen: 2,
    pickpocket_failed: 1,
    lockpick: 1,
    alarm: 2
  })
})

test('stars stop at 5', () => {
  assert.equal(addCrimeStars(0, 'murder'), 3)
  assert.equal(addCrimeStars(4, 'murder'), 5)
  assert.equal(addCrimeStars(5, 'assault'), 5)
})

test('one star is lost when the 4 minutes run out, and the counter starts again', () => {
  assert.deepEqual(decayWanted({ stars: 3, decayMs: WANTED_DECAY_MS }, WANTED_DECAY_MS - 1), { stars: 3, decayMs: 1 })
  assert.deepEqual(decayWanted({ stars: 3, decayMs: 1000 }, 1000), { stars: 2, decayMs: WANTED_DECAY_MS })
  assert.deepEqual(decayWanted({ stars: 3, decayMs: 1000 }, 1000 + WANTED_DECAY_MS + 500), { stars: 1, decayMs: WANTED_DECAY_MS - 500 })
  assert.deepEqual(decayWanted({ stars: 1, decayMs: 1000 }, 5000), { stars: 0, decayMs: WANTED_DECAY_MS })
})

test('a crime resets the counter to 4 minutes, records the crime and saves the level', () => {
  const { room, join } = setup()
  const { player } = join('a', 1)
  player.wantedStars = 1
  player.wantedDecayMs = 1000
  reportCrime(room, player, 'lockpick')
  assert.equal(player.wantedStars, 2)
  assert.equal(player.wantedDecayMs, WANTED_DECAY_MS)
  assert.deepEqual(apiCalls.map(({ path, method, body }) => [path, method, body]), [
    ['/wanted', 'PUT', { stars: 2, decay_ms: WANTED_DECAY_MS }],
    ['/crimes', 'POST', { kind: 'lockpick', stars: 1, victim_account_id: null }]
  ])
})

test('others see the stars from 3 on, and get 0 when they drop under 3', () => {
  const { room, join } = setup()
  const a = join('a', 1)
  const b = join('b', 2)
  reportCrime(room, a.player, 'assault')
  assert.deepEqual(wantedSent(a.client), [{ sessionId: 'a', stars: 1 }])
  assert.deepEqual(wantedSent(b.client), [])
  reportCrime(room, a.player, 'bag_theft')
  assert.deepEqual(wantedSent(b.client), [{ sessionId: 'a', stars: 3 }])
  tickWanted(room, WANTED_DECAY_MS)
  assert.equal(a.player.wantedStars, 2)
  assert.deepEqual(wantedSent(a.client).at(-1), { sessionId: 'a', stars: 2 })
  assert.deepEqual(wantedSent(b.client), [{ sessionId: 'a', stars: 3 }, { sessionId: 'a', stars: 0 }])
  tickWanted(room, WANTED_DECAY_MS)
  assert.deepEqual(wantedSent(b.client).length, 2)
})

test('the tick counts down only the players in the room', () => {
  const { room, join } = setup()
  const { player } = join('a', 1)
  reportCrime(room, player, 'assault')
  tickWanted(room, 60_000)
  assert.equal(player.wantedDecayMs, WANTED_DECAY_MS - 60_000)
  assert.equal(player.wantedDirty, true)
  room.players.delete('a')
  tickWanted(room, WANTED_DECAY_MS)
  assert.equal(player.wantedStars, 1)
})

test('a first punch is an assault, at most once a minute per victim', () => {
  const { room, join } = setup()
  const a = join('a', 1)
  const b = join('b', 2)
  const c = join('c', 3)
  reportAssault(room, a.player, b.player, 0)
  reportAssault(room, a.player, b.player, ASSAULT_REPEAT_MS - 1)
  assert.equal(a.player.wantedStars, 1)
  reportAssault(room, a.player, c.player, ASSAULT_REPEAT_MS - 1)
  assert.equal(a.player.wantedStars, 2)
  reportAssault(room, a.player, b.player, ASSAULT_REPEAT_MS)
  assert.equal(a.player.wantedStars, 3)
  assert.deepEqual(apiCalls.filter((c) => c.path === '/crimes').map((c) => c.body.victim_account_id), [2, 3, 2])
})

test('hitting back someone who hit you in the last minute is self-defence', () => {
  const { room, join } = setup()
  const a = join('a', 1)
  const b = join('b', 2)
  reportAssault(room, a.player, b.player, 0)
  reportAssault(room, b.player, a.player, SELF_DEFENCE_MS - 1)
  assert.equal(b.player.wantedStars, 0)
  reportAssault(room, b.player, a.player, SELF_DEFENCE_MS * 3)
  assert.equal(b.player.wantedStars, 1)
})

test('a landed punch gives 1 star, a whiff none', () => {
  const { room, join } = setup()
  const a = join('a', 1)
  join('b', 2, 0, -1.5)
  onPunch(room, a.client, { targetSessionId: 'nobody' })
  assert.equal(a.player.wantedStars, 0)
  a.player.lastPunchAt = 0
  onPunch(room, a.client, { targetSessionId: 'b' })
  assert.equal(a.player.wantedStars, 1)
})

test('the killing punch is a murder (3 stars), not also an assault', () => {
  const { room, join } = setup()
  const a = join('a', 1)
  const b = join('b', 2, 0, -1.5)
  b.player.stats = { health: 5, hunger: 100, thirst: 100 }
  onPunch(room, a.client, { targetSessionId: 'b' })
  assert.equal(a.player.wantedStars, 3)
  assert.ok(apiCalls.some((call) => call.path === '/crimes' && call.body.kind === 'murder' && call.body.victim_account_id === 2))
  assert.ok(!apiCalls.some((call) => call.path === '/crimes' && call.body.kind === 'assault'))
})

test('picking up the cash bag of a murder you did not suffer is a bag theft', async () => {
  const { room, join } = setup()
  const thief = join('t', 3)
  const victim = join('v', 2)
  const bag = (id: number, murderVictimAccountId: number | null) =>
    room.cashBags.set(id, { id, x: 0, y: 1.6, z: 0, expiresAt: Date.now() + 60_000, murderVictimAccountId, tools: [] })
  bag(1, null)
  await onCashBagPick(room, thief.client, { id: 1 })
  assert.equal(thief.player.wantedStars, 0)
  bag(2, 2)
  await onCashBagPick(room, victim.client, { id: 2 })
  assert.equal(victim.player.wantedStars, 0)
  bag(3, 2)
  thief.player.lastCashBagPickAt = 0
  await onCashBagPick(room, thief.client, { id: 3 })
  assert.equal(thief.player.wantedStars, 2)
  assert.deepEqual(apiCalls.filter((c) => c.path === '/crimes').map((c) => c.body), [{ kind: 'bag_theft', stars: 2, victim_account_id: 2 }])
})

test('a newcomer gets the wanted players others can see', () => {
  const { room, join } = setup()
  const low = join('low', 1)
  const high = join('high', 2)
  low.player.wantedStars = 2
  high.player.wantedStars = 4
  const newcomer = join('n', 3)
  sendWantedOnJoin(room, newcomer.client, newcomer.player)
  assert.deepEqual(wantedSent(newcomer.client), [{ sessionId: 'high', stars: 4 }])
})

test('the saved level comes back at the join, sent to the player and to others from 3 stars', async () => {
  const { room, join } = setup()
  const other = join('o', 1)
  const me = join('me', 2)
  wantedFromApi = { stars: 3, decay_ms: 90_000 }
  await loadWanted(room, me.player)
  assert.equal(me.player.wantedStars, 3)
  assert.equal(me.player.wantedDecayMs, 90_000)
  assert.deepEqual(wantedSent(me.client), [{ sessionId: 'me', stars: 3 }])
  assert.deepEqual(wantedSent(other.client), [{ sessionId: 'me', stars: 3 }])
  wantedFromApi = { stars: 0, decay_ms: WANTED_DECAY_MS }
})

test('a broken saved level from the API is refused', () => {
  assert.throws(() => parseWantedState({ stars: 6, decay_ms: 1000 }))
  assert.throws(() => parseWantedState({ stars: 2, decay_ms: 0 }))
  assert.throws(() => parseWantedState(null))
  assert.deepEqual(parseWantedState({ stars: 2, decay_ms: 1000 }), { stars: 2, decayMs: 1000 })
})
