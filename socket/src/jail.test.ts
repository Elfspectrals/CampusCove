import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface ApiCall { path: string, method: string, body: any }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const cell = (id: string, z: number) => ({
  id,
  position: [109.4, 1.8, z],
  door: [108.4, 0.2, z + 1],
  tap: [111.8, 1.06, z],
  hatch: [108.4, 1.14, z - 0.5],
  bounds: { minX: 108.5, maxX: 112, minZ: z - 1.9, maxZ: z + 1.5 }
})
const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
  zones: [{
    key: 'police',
    bounds: { minX: 44.6, maxX: 122, minZ: -10, maxZ: 40 },
    buildings: [{ kind: 'work', key: 'police', name: 'Cove Police', position: [100, 0, 12], rotationY: -1.5708, door: [87.6, 1.25, 12] }]
  }],
  clinic: { nurse: [40, 0.2, 0], pharmacy: [44, 0.2, 0], beds: [{ id: 'bed_01', position: [38, 1.8, 4], bed: [38, 0.7, 5], yaw: 0 }] },
  police: { desk: [94.6, 0.2, 12], officer: [95.5, 0.2, 12], lockers: [93, 0.2, 1.5], cells: [cell('cell_01', 8.6), cell('cell_02', 12.2)] }
}

const apiCalls: ApiCall[] = []
let payAnswer: { status: number, body: object } = { status: 200, body: { fine: 300, bank: 0, cash: 50 } }
let jailFromApi: unknown = { kind: null, stars: 0, ms_left: 0 }
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const path = String(url).replace(/^.*\/api/, '')
  apiCalls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path === '/jail/pay') return new Response(JSON.stringify(payAnswer.body), { status: payAnswer.status })
  if (path === '/jail' && init?.method === 'GET') return new Response(JSON.stringify({ jail: jailFromApi }))
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const {
  FINE_PER_STAR,
  JAIL_MS_PER_STAR,
  JAIL_PAY_COOLDOWN_MS,
  MAX_FINE,
  MAX_JAIL_MS,
  MEAL_TRAY_FOOD,
  MEAL_TRAY_HUNGER,
  MEAL_TRAY_INTERVAL_MS
} = await import('./policeConstants.ts')
const {
  cellYaw,
  goesToNpcJail,
  insideCell,
  jailFine,
  loadJail,
  lockUpOnJoin,
  onJailPay,
  parseSavedJail,
  pickCell,
  sentenceMs,
  tickJail,
  tickSentence
} = await import('./jail.ts')
const { moveRejection } = await import('./movement.ts')
const { hurt, onDrinkFountain, onEatMealTray } = await import('./survival.ts')
const { onPunch } = await import('./punch.ts')
const { worldPolice } = await import('./world.ts')
await loadWorld()

function setup() {
  const players = new Map<string, Player>()
  const clients: FakeClient[] = []
  const timers: (() => void)[] = []
  const room = {
    players,
    clients,
    trades: new Map(),
    cashBags: new Map(),
    housingUnits: [],
    clinicBeds: new Map(),
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    clock: { setTimeout: (fn: () => void) => void timers.push(fn) },
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.forEach((c) => {
      if (c.sessionId !== except?.sessionId) fn(c)
    }),
    broadcastMove: () => undefined
  }
  const join = (sessionId: string, accountId: number, extra: Partial<Player> = {}) => {
    const player = {
      sessionId,
      accountId,
      token: `token-${sessionId}`,
      x: 0,
      y: 1.6,
      z: 0,
      ry: 0,
      lastMoveAt: Date.now(),
      stats: { health: 100, hunger: 100, thirst: 100 },
      knockedOutUntil: 0,
      speedBoostUntil: 0,
      healOverTime: null,
      intoxication: 0,
      seatId: null,
      lastPunchAt: 0,
      stamina: 100,
      staminaSpentAt: 0,
      wantedStars: 0,
      wantedDecayMs: 240_000,
      wantedDirty: false,
      lastHitAt: new Map(),
      lastAssaultAt: new Map(),
      jail: null,
      jailDirty: false,
      jailPayPending: false,
      lastJailPayAt: 0,
      mealTrayInMs: null,
      lastSipAt: 0,
      sportsLoans: new Map(),
      ...extra
    } as unknown as Player
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
    players.set(sessionId, player)
    clients.push(client)
    return { player, client }
  }
  apiCalls.length = 0
  return { room: room as any, join, timers }
}

const jailedAt = (cellId: string, stars: number, msLeft: number) => ({ jail: { kind: 'npc' as const, stars, msLeft, cellId } })
const sentOf = (client: FakeClient, type: string) => client.sent.filter((m) => m.type === type).map((m) => m.payload)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('the sentence is 2 minutes per star, 10 minutes at most', () => {
  assert.equal(JAIL_MS_PER_STAR, 120_000)
  assert.equal(MAX_JAIL_MS, 600_000)
  assert.equal(sentenceMs(1), 120_000)
  assert.equal(sentenceMs(3), 360_000)
  assert.equal(sentenceMs(5), 600_000)
  assert.equal(sentenceMs(6), 600_000)
})

test('the fine is 100 coins per star, 500 at most', () => {
  assert.equal(FINE_PER_STAR, 100)
  assert.equal(MAX_FINE, 500)
  assert.equal(jailFine(1), 100)
  assert.equal(jailFine(5), 500)
  assert.equal(jailFine(6), 500)
})

test('only a wanted player, or one already serving, goes to the NPC jail', () => {
  assert.equal(goesToNpcJail({ wantedStars: 0, jail: null }), false)
  assert.equal(goesToNpcJail({ wantedStars: 1, jail: null }), true)
  assert.equal(goesToNpcJail({ wantedStars: 0, jail: { kind: 'npc', stars: 2, msLeft: 1000, cellId: 'cell_01' } }), true)
})

test('time served stops at zero', () => {
  assert.equal(tickSentence(5000, 1000), 4000)
  assert.equal(tickSentence(500, 1000), 0)
})

test('a free cell is taken first, then the least crowded one is shared', () => {
  const cells = worldPolice()!.cells
  assert.equal(pickCell(cells, []).id, 'cell_01')
  assert.equal(pickCell(cells, ['cell_01']).id, 'cell_02')
  assert.equal(pickCell(cells, ['cell_01', 'cell_02']).id, 'cell_01')
  assert.equal(pickCell(cells, ['cell_01', 'cell_02', 'cell_01']).id, 'cell_02')
})

test('the cell box holds its inside and its edges, not the office in front of the bars', () => {
  const { bounds } = worldPolice()!.cells[0]
  assert.equal(insideCell(bounds, 110, 8.6), true)
  assert.equal(insideCell(bounds, bounds.minX, bounds.maxZ), true)
  assert.equal(insideCell(bounds, bounds.minX - 0.01, 8.6), false)
  assert.equal(insideCell(bounds, 110, bounds.maxZ + 0.01), false)
})

test('a prisoner faces the cell door', () => {
  const c = worldPolice()!.cells[0]
  const yaw = cellYaw(c)
  const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) }
  const toDoor = { x: c.door.x - c.position.x, z: c.door.z - c.position.z }
  assert.ok(forward.x * toDoor.x + forward.z * toDoor.z > 0)
})

test('the police exit is outside the station door', () => {
  const { exit } = worldPolice()!
  assert.ok(exit.position.x < 87.6)
  assert.equal(exit.position.z, 12)
})

test('a broken saved sentence from the API is refused', () => {
  assert.equal(parseSavedJail({ kind: null, stars: 0, ms_left: 0 }), null)
  assert.deepEqual(parseSavedJail({ kind: 'npc', stars: 2, ms_left: 90_000 }), { kind: 'npc', stars: 2, msLeft: 90_000 })
  assert.deepEqual(parseSavedJail({ kind: 'officer', stars: 0, ms_left: 900_000 }), { kind: 'officer', stars: 0, msLeft: 900_000 })
  assert.throws(() => parseSavedJail({ kind: 'npc', stars: 2, ms_left: 0 }))
  assert.throws(() => parseSavedJail({ kind: 'npc', stars: 0, ms_left: 1000 }))
  assert.throws(() => parseSavedJail({ kind: 'npc', stars: 6, ms_left: 1000 }))
  assert.throws(() => parseSavedJail({ kind: 'npc', stars: 2, ms_left: MAX_JAIL_MS + 1 }))
  assert.throws(() => parseSavedJail({ kind: 'officer', stars: 1, ms_left: 1000 }))
  assert.throws(() => parseSavedJail({ kind: 'officer', stars: 0, ms_left: 900_001 }))
  assert.throws(() => parseSavedJail({ stars: 2, ms_left: 1000 }))
  assert.throws(() => parseSavedJail(null))
})

test('a move out of the cell box is refused, a move inside it is accepted', () => {
  const { room, join } = setup()
  const { player } = join('a', 1, { x: 110, z: 8.6, ...jailedAt('cell_01', 2, 60_000) })
  assert.equal(moveRejection(room, player, 108, 1.8, 8.6, Date.now()), 'jailed')
  assert.equal(moveRejection(room, player, 110.5, 1.8, 9, Date.now()), null)
})

test('a wanted player who dies wakes up in a cell, stars cleared, and is billed with the stars of the sentence once it is saved', async () => {
  const { room, join, timers } = setup()
  const { player, client } = join('a', 1, { x: 30, z: 30, wantedStars: 3 })
  hurt(room, client, player, 200, 'fall')
  assert.deepEqual(player.jail, { kind: 'npc', stars: 3, msLeft: 360_000, cellId: null })
  assert.equal(player.wantedStars, 0)
  assert.deepEqual(sentOf(client, 'survival_knocked_out')[0].jailed, true)
  await flush()
  assert.deepEqual(apiCalls.map((c) => c.path).filter((path) => path === '/jail' || path === '/survival/hospital'), ['/jail', '/survival/hospital'])
  assert.deepEqual(apiCalls.find((c) => c.path === '/survival/hospital')?.body, { jailed: true, jail_stars: 3 })
  assert.deepEqual(apiCalls.find((c) => c.path === '/jail')?.body, { kind: 'npc', stars: 3, ms_left: 360_000 })
  timers.forEach((fn) => fn())
  assert.equal(player.jail!.cellId, 'cell_01')
  assert.deepEqual([player.x, player.y, player.z], [109.4, 1.8, 8.6])
  assert.deepEqual(sentOf(client, 'jail_state'), [{ kind: 'npc', msLeft: 360_000, fine: 300, stars: 3 }])
  assert.equal(sentOf(client, 'survival_respawn')[0].bed, null)
})

test('a player who is not wanted still goes to the hospital', () => {
  const { room, join } = setup()
  const { player, client } = join('a', 1, { x: 30, z: 30 })
  hurt(room, client, player, 200, 'fall')
  assert.equal(player.jail, null)
  assert.equal(apiCalls.find((c) => c.path === '/survival/hospital')?.body, null)
})

test('the sentence runs on connected time only, not while knocked out, and ends outside the station door', () => {
  const { room, join } = setup()
  const { player, client } = join('a', 1, { x: 110, z: 8.6, ...jailedAt('cell_01', 1, 2000) })
  const now = Date.now()
  player.knockedOutUntil = now + 5000
  tickJail(room, 1000, now)
  assert.equal(player.jail!.msLeft, 2000)
  player.knockedOutUntil = 0
  tickJail(room, 1000, now)
  assert.equal(player.jail!.msLeft, 1000)
  tickJail(room, 1000, now)
  assert.equal(player.jail, null)
  const { exit } = worldPolice()!
  assert.deepEqual([player.x, player.z], [exit.position.x, exit.position.z])
  assert.deepEqual(sentOf(client, 'jail_released'), [{ reason: 'served', fine: null, bank: null, cash: null }])
  assert.deepEqual(apiCalls.at(-1), { path: '/jail', method: 'PUT', body: { kind: null, stars: 0, ms_left: 0 } })
})

test('paying the fine sends the recorded stars, never an amount, and walks the player out', async () => {
  const { room, join } = setup()
  payAnswer = { status: 200, body: { fine: 300, bank: 0, cash: 50 } }
  const { player, client } = join('a', 1, { x: 110, z: 8.6, ...jailedAt('cell_01', 3, 300_000) })
  await onJailPay(room, client)
  assert.deepEqual(apiCalls[0], { path: '/jail/pay', method: 'POST', body: { stars: 3 } })
  assert.equal(player.jail, null)
  assert.deepEqual(sentOf(client, 'jail_released'), [{ reason: 'paid', fine: 300, bank: 0, cash: 50 }])
})

test('a fine the player cannot afford keeps them in the cell with a clear error', async () => {
  const { room, join } = setup()
  payAnswer = { status: 422, body: { code: 'jail_insufficient_funds', message: 'The fine is 300 coins: you do not have enough.' } }
  const { player, client } = join('a', 1, { x: 110, z: 8.6, ...jailedAt('cell_01', 3, 300_000) })
  await onJailPay(room, client)
  assert.equal(player.jail!.cellId, 'cell_01')
  assert.deepEqual(sentOf(client, 'jail_error'), [{ code: 'jail_insufficient_funds', message: 'The fine is 300 coins: you do not have enough.' }])
  assert.equal(player.jailPayPending, false)
})

test('a double click pays once, and paying again too soon is ignored', async () => {
  const { room, join } = setup()
  payAnswer = { status: 422, body: { code: 'jail_insufficient_funds', message: 'no' } }
  const { client } = join('a', 1, { x: 110, z: 8.6, ...jailedAt('cell_01', 3, 300_000) })
  const now = Date.now()
  await Promise.all([onJailPay(room, client, now), onJailPay(room, client, now)])
  await onJailPay(room, client, now + JAIL_PAY_COOLDOWN_MS - 1)
  assert.equal(apiCalls.filter((c) => c.path === '/jail/pay').length, 1)
})

test('a free player cannot pay a fine', async () => {
  const { room, join } = setup()
  const { client } = join('a', 1)
  await onJailPay(room, client)
  assert.equal(apiCalls.length, 0)
})

test('the sentence left comes back at the join and puts the player in a cell', async () => {
  const { room, join } = setup()
  jailFromApi = { kind: 'npc', stars: 2, ms_left: 75_000 }
  const { player, client } = join('a', 1)
  await loadJail(room, player)
  lockUpOnJoin(room, player)
  jailFromApi = { kind: null, stars: 0, ms_left: 0 }
  assert.deepEqual(player.jail, { kind: 'npc', stars: 2, msLeft: 75_000, cellId: 'cell_01' })
  assert.deepEqual([player.x, player.z], [109.4, 8.6])
  assert.equal(sentOf(client, 'teleported').length, 1)
  assert.deepEqual(sentOf(client, 'jail_state'), [{ kind: 'npc', msLeft: 75_000, fine: 200, stars: 2 }])
})

test('a prisoner neither punches nor gets punched', async () => {
  const { room, join } = setup()
  const { client: prisonerClient } = join('a', 1, { x: 110, z: 8.6, ...jailedAt('cell_01', 1, 60_000) })
  const { client: visitorClient } = join('b', 2, { x: 110, z: 10.6 })
  onPunch(room, prisonerClient, { targetSessionId: 'b' })
  onPunch(room, visitorClient, { targetSessionId: 'a' })
  await flush()
  assert.deepEqual(sentOf(prisonerClient, 'user_punched').map((m) => m.targetSessionId), [null])
})

const hungryAt = (x: number, z: number) => ({ x, z, stats: { health: 100, hunger: 20, thirst: 20 } })

test('a meal tray waits in the hatch when the prisoner arrives in the cell', async () => {
  const { room, join } = setup()
  jailFromApi = { kind: 'npc', stars: 1, ms_left: 120_000 }
  const { player, client } = join('a', 1)
  await loadJail(room, player)
  lockUpOnJoin(room, player)
  jailFromApi = { kind: null, stars: 0, ms_left: 0 }
  assert.equal(player.mealTrayInMs, 0)
  assert.deepEqual(sentOf(client, 'jail_tray'), [{ cellId: 'cell_01', ready: true, food: MEAL_TRAY_FOOD }])
})

test('eating the tray feeds the prisoner once and the next one comes after 3 minutes of connected time', () => {
  const { room, join } = setup()
  const { player, client } = join('a', 1, { ...hungryAt(109, 8.1), ...jailedAt('cell_01', 5, 600_000), mealTrayInMs: 0 })
  onEatMealTray(room, client)
  onEatMealTray(room, client)
  assert.equal(player.stats!.hunger, 20 + MEAL_TRAY_HUNGER)
  assert.deepEqual(sentOf(client, 'jail_tray'), [{ cellId: 'cell_01', ready: false, food: MEAL_TRAY_FOOD }])
  const now = Date.now()
  tickJail(room, MEAL_TRAY_INTERVAL_MS - 1000, now)
  assert.equal(sentOf(client, 'jail_tray').length, 1)
  tickJail(room, 1000, now)
  assert.equal(player.mealTrayInMs, 0)
  assert.deepEqual(sentOf(client, 'jail_tray').at(-1), { cellId: 'cell_01', ready: true, food: MEAL_TRAY_FOOD })
})

test('only one tray waits at a time, however long it stays uneaten', () => {
  const { room, join } = setup()
  const { player, client } = join('a', 1, { ...hungryAt(111.5, 8.6), ...jailedAt('cell_01', 5, 600_000), mealTrayInMs: 0 })
  tickJail(room, 2 * MEAL_TRAY_INTERVAL_MS, Date.now())
  assert.equal(player.mealTrayInMs, 0)
  assert.equal(sentOf(client, 'jail_tray').length, 0)
  onEatMealTray(room, client)
  assert.equal(player.stats!.hunger, 20)
})

test('the tray is only for the prisoner of that cell, from inside it and within reach of the hatch', () => {
  const { room, join } = setup()
  const { player: free, client: freeClient } = join('a', 1, { ...hungryAt(108, 8.1), mealTrayInMs: 0 })
  const { player: neighbour, client: neighbourClient } = join('b', 2, { ...hungryAt(109, 8.1), ...jailedAt('cell_02', 2, 60_000), mealTrayInMs: 0 })
  const { player: far, client: farClient } = join('c', 3, { ...hungryAt(111.5, 8.6), ...jailedAt('cell_01', 2, 60_000), mealTrayInMs: 0 })
  onEatMealTray(room, freeClient)
  onEatMealTray(room, neighbourClient)
  onEatMealTray(room, farClient)
  assert.deepEqual([free.stats!.hunger, neighbour.stats!.hunger, far.stats!.hunger], [20, 20, 20])
})

test('the cell tap gives a fountain sip to the prisoner of that cell only', () => {
  const { room, join } = setup()
  const { player: prisoner, client: prisonerClient } = join('a', 101, { ...hungryAt(111.5, 8.6), ...jailedAt('cell_01', 2, 60_000) })
  const { player: neighbour, client: neighbourClient } = join('b', 102, { ...hungryAt(111.5, 8.6), ...jailedAt('cell_02', 2, 60_000) })
  const { player: visitor, client: visitorClient } = join('c', 103, hungryAt(111.5, 8.6))
  const { player: away, client: awayClient } = join('d', 104, { ...hungryAt(109, 10), ...jailedAt('cell_01', 2, 60_000) })
  for (const client of [prisonerClient, neighbourClient, visitorClient, awayClient]) onDrinkFountain(room, client)
  assert.deepEqual([prisoner, neighbour, visitor, away].map((p) => p.stats!.thirst), [45, 20, 20, 20])
  assert.equal(sentOf(prisonerClient, 'fountain_cooldown').length, 1)
})

test('leaving the cell takes the tray away', () => {
  const { room, join } = setup()
  const { player } = join('a', 1, { ...hungryAt(110, 8.6), ...jailedAt('cell_01', 1, 1000), mealTrayInMs: 0 })
  tickJail(room, 1000, Date.now())
  assert.equal(player.jail, null)
  assert.equal(player.mealTrayInMs, null)
})
