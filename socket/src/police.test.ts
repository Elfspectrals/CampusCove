import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface ApiCall { path: string, method: string, body: any }

process.env.WORLD_MANIFEST_URL = 'http://police-world.test/world.manifest.json'

const DESK = { x: 94.6, y: 0.2, z: 12 }
const LOCKERS = { x: 93, y: 0.2, z: 1.5 }
const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
  zones: [{
    key: 'police',
    bounds: { minX: 44.6, maxX: 122, minZ: -10, maxZ: 40 },
    buildings: [{ kind: 'work', key: 'police', name: 'Cove Police', position: [100, 0, 12], rotationY: -1.5708, door: [87.6, 1.25, 12] }]
  }],
  police: {
    desk: [DESK.x, DESK.y, DESK.z],
    officer: [95.5, 0.2, 12],
    lockers: [LOCKERS.x, LOCKERS.y, LOCKERS.z],
    cells: [{
      id: 'cell_01',
      position: [109.4, 1.8, 8.6],
      door: [108.4, 0.2, 9.6],
      tap: [111.8, 1.06, 8.6],
      hatch: [108.4, 1.14, 8.1],
      bounds: { minX: 108.5, maxX: 112, minZ: 6.7, maxZ: 10.1 }
    }]
  }
}

const apiCalls: ApiCall[] = []
let buyAnswer: { status: number, body: object } = { status: 200, body: { licence: { held: true, price: 300, bank: 150 } } }
let deathAnswer: object = { billed: 40, licence_lost: true }
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const path = String(url).replace(/^.*\/api/, '')
  const method = init?.method ?? 'GET'
  apiCalls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path === '/police/licence' && method === 'POST') return new Response(JSON.stringify(buyAnswer.body), { status: buyAnswer.status })
  if (path === '/police/licence') return new Response(JSON.stringify({ licence: { held: true, price: 300 } }))
  if (path === '/survival/hospital' || path === '/survival/hangover') return new Response(JSON.stringify(deathAnswer))
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { DUTY_UNIFORM } = await import('./policeConstants.ts')
const {
  isOnDuty,
  loadPoliceLicence,
  onDutyPlayers,
  onPoliceDuty,
  onPoliceLicenceBuy,
  parseLicence,
  shownAppearance
} = await import('./police.ts')
const { createPlayer, publicPlayer } = await import('./players.ts')
const { hurt } = await import('./survival.ts')
const { onPunch } = await import('./punch.ts')
const { reportCrime } = await import('./wanted.ts')
await loadWorld()

const OWN_OUTFIT = {
  appearance: { body: 1, hair: 2, top: 3, bottom: 4, shoes: 5, head_accessory: null },
  slotHexes: { body: '#111111', hair: '#222222', top: '#333333', bottom: '#444444', shoes: '#555555', head_accessory: '#666666' },
  bodyModelGlb: null,
  slotModels: {
    hair: '/assets/wear/hair/curly/model.glb',
    head_accessory: null,
    top: '/assets/wear/top/basic/model.glb',
    bottom: '/assets/wear/bottom/jeans/model.glb',
    shoes: '/assets/wear/shoes/runners/model.glb'
  },
  character: { sex: 'f', face: 2, build: 'normal' }
}

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
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
    const player = Object.assign(
      createPlayer({ sessionId, auth: { accountId, pseudo: sessionId, token: `token-${sessionId}` } } as any, structuredClone(OWN_OUTFIT), 0, { x: 0, y: 1.6, z: 0 }),
      { stats: { health: 100, hunger: 100, thirst: 100 } },
      extra
    )
    players.set(sessionId, player)
    clients.push(client)
    return { player, client }
  }
  apiCalls.length = 0
  return { room: room as any, join, timers }
}

const atLockers = { x: LOCKERS.x + 1, y: LOCKERS.y + 1.6, z: LOCKERS.z }
const atDesk = { x: DESK.x - 1.5, y: DESK.y + 1.6, z: DESK.z }
const sentOf = (client: FakeClient, type: string) => client.sent.filter((m) => m.type === type).map((m) => m.payload)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

test('a licensed player with no star goes on duty at the lockers and everyone sees the uniform', () => {
  const { room, join } = setup()
  const { player, client } = join('cop', 1, { ...atLockers, policeLicence: true, policeLicencePrice: 300 })
  const { client: other } = join('other', 2)

  onPoliceDuty(room, client)

  assert.equal(isOnDuty(player), true)
  assert.deepEqual(onDutyPlayers(room), [player])
  assert.deepEqual(sentOf(client, 'police_state').at(-1), { licensed: true, onDuty: true, price: 300 })
  const seen = sentOf(other, 'appearance_updated').at(-1)
  assert.equal(seen.sessionId, 'cop')
  for (const [slot, piece] of Object.entries(DUTY_UNIFORM)) {
    assert.equal(seen.slotModels[slot], piece.model)
    assert.equal(seen.slotHexes[slot], piece.hex)
  }
  assert.equal(seen.slotModels.hair, OWN_OUTFIT.slotModels.hair)
  assert.deepEqual(seen.character, OWN_OUTFIT.character)
  assert.deepEqual(player.slotModels, OWN_OUTFIT.slotModels)
  assert.deepEqual(player.slotHexes, OWN_OUTFIT.slotHexes)
  assert.equal(publicPlayer(player).slotModels.top, DUTY_UNIFORM.top.model)
})

test('going off duty brings back what the player really wears', () => {
  const { room, join } = setup()
  const { player, client } = join('cop', 1, { ...atLockers, policeLicence: true })
  const { client: other } = join('other', 2)
  onPoliceDuty(room, client, 10_000)

  onPoliceDuty(room, client, 20_000)

  assert.equal(isOnDuty(player), false)
  assert.deepEqual(sentOf(client, 'police_duty_ended').at(-1), { reason: 'off' })
  const seen = sentOf(other, 'appearance_updated').at(-1)
  assert.deepEqual(seen.slotModels, OWN_OUTFIT.slotModels)
  assert.deepEqual(seen.slotHexes, OWN_OUTFIT.slotHexes)
  assert.deepEqual(seen.appearance, OWN_OUTFIT.appearance)
})

test('a change of clothes on duty is kept for later but the uniform stays on show', () => {
  const { join } = setup()
  const { player } = join('cop', 1, { onDuty: true })
  player.slotModels = { ...player.slotModels, top: '/assets/wear/top/hoodie/model.glb' }

  assert.equal(shownAppearance(player).slotModels.top, DUTY_UNIFORM.top.model)
  player.onDuty = false
  assert.equal(shownAppearance(player).slotModels.top, '/assets/wear/top/hoodie/model.glb')
})

test('duty is refused without a licence, with a star or from a cell, and ignored away from the lockers', () => {
  const { room, join } = setup()
  const { player: noLicence, client: c1 } = join('a', 1, { ...atLockers, policeLicence: false })
  const { player: wanted, client: c2 } = join('b', 2, { ...atLockers, policeLicence: true, wantedStars: 1 })
  const { player: jailed, client: c3 } = join('c', 3, { ...atLockers, policeLicence: true, jail: { kind: 'npc', stars: 1, msLeft: 1000, cellId: 'cell_01' } })
  const { player: far, client: c4 } = join('d', 4, { x: LOCKERS.x + 5, y: 1.8, z: LOCKERS.z, policeLicence: true })

  for (const client of [c1, c2, c3, c4]) onPoliceDuty(room, client)

  assert.deepEqual([noLicence, wanted, jailed, far].map(isOnDuty), [false, false, false, false])
  assert.equal(sentOf(c1, 'police_error')[0].code, 'police_no_licence')
  assert.equal(sentOf(c2, 'police_error')[0].code, 'police_wanted')
  assert.equal(sentOf(c3, 'police_error')[0].code, 'police_jailed')
  assert.equal(c4.sent.length, 0)
})

test('death ends duty, and the licence lost by Laravel is reported', async () => {
  const { room, join } = setup()
  const { player, client } = join('cop', 1, { policeLicence: true, onDuty: true })
  const { client: other } = join('other', 2)
  deathAnswer = { billed: 40, licence_lost: true }

  hurt(room, client, player, 200, 'fall')

  assert.equal(isOnDuty(player), false)
  assert.deepEqual(sentOf(client, 'police_duty_ended')[0], { reason: 'death' })
  assert.deepEqual(sentOf(other, 'appearance_updated').at(-1).slotModels, OWN_OUTFIT.slotModels)
  await flush()
  await flush()
  assert.equal(player.policeLicence, false)
  assert.deepEqual(sentOf(client, 'police_state').at(-1), { licensed: false, onDuty: false, price: null })
})

test('duty is not kept across a reconnect', () => {
  const { room, join } = setup()
  const { player } = join('cop', 1, { onDuty: true })
  room.players.delete(player.sessionId)

  const { player: back } = join('cop-again', 1)

  assert.equal(isOnDuty(back), false)
  assert.deepEqual(onDutyPlayers(room), [])
})

test('an officer on duty takes no assault star for a punch, but a murder still counts', () => {
  const { room, join } = setup()
  const { player: cop, client } = join('cop', 1, { onDuty: true, x: 0, z: 0, ry: 0 })
  const { player: suspect } = join('suspect', 2, { x: 0, z: -1 })

  onPunch(room, client, { targetSessionId: 'suspect' })
  assert.equal(cop.wantedStars, 0)
  assert.equal(apiCalls.some((c) => c.path === '/crimes'), false)

  suspect.stats = { health: 1, hunger: 100, thirst: 100 }
  cop.lastPunchAt = 0
  onPunch(room, client, { targetSessionId: 'suspect' })
  assert.equal(cop.wantedStars, 3)
})

test('the same punch off duty gives an assault star', () => {
  const { room, join } = setup()
  const { player: attacker, client } = join('attacker', 1, { x: 0, z: 0, ry: 0 })
  join('victim', 2, { x: 0, z: -1 })

  onPunch(room, client, { targetSessionId: 'victim' })

  assert.equal(attacker.wantedStars, 1)
})

test('officers on duty see a wanted player from one star, others from three', () => {
  const { room, join } = setup()
  const { client: copClient } = join('cop', 1, { onDuty: true })
  const { client: civilian } = join('civilian', 2)
  const { player: thief } = join('thief', 3)

  reportCrime(room, thief, 'assault')

  assert.deepEqual(sentOf(copClient, 'wanted'), [{ sessionId: 'thief', stars: 1 }])
  assert.deepEqual(sentOf(civilian, 'wanted'), [])
})

test('going on duty shows the players already wanted, going off hides those under three stars', () => {
  const { room, join } = setup()
  const { client } = join('cop', 1, { ...atLockers, policeLicence: true })
  join('petty', 2, { wantedStars: 1 })
  join('clean', 3)
  join('most_wanted', 4, { wantedStars: 4 })

  onPoliceDuty(room, client, 10_000)
  assert.deepEqual(sentOf(client, 'wanted'), [{ sessionId: 'petty', stars: 1 }, { sessionId: 'most_wanted', stars: 4 }])

  client.sent.length = 0
  onPoliceDuty(room, client, 20_000)
  assert.deepEqual(sentOf(client, 'wanted'), [{ sessionId: 'petty', stars: 0 }, { sessionId: 'most_wanted', stars: 4 }])
})

test('the licence is bought at the front desk through Laravel', async () => {
  const { room, join } = setup()
  const { player, client } = join('buyer', 1, { ...atDesk, policeLicence: false, policeLicencePrice: 300 })
  buyAnswer = { status: 200, body: { licence: { held: true, price: 300, bank: 150 } } }

  await onPoliceLicenceBuy(room, client)

  assert.deepEqual(apiCalls.map((c) => [c.method, c.path]), [['POST', '/police/licence']])
  assert.equal(player.policeLicence, true)
  assert.deepEqual(sentOf(client, 'police_licence_bought'), [{ price: 300, bank: 150 }])
  assert.deepEqual(sentOf(client, 'police_state').at(-1), { licensed: true, onDuty: false, price: 300 })
})

test('a refused purchase shows the reason from Laravel', async () => {
  const { room, join } = setup()
  const { player, client } = join('buyer', 1, { ...atDesk, policeLicence: false })
  buyAnswer = { status: 422, body: { code: 'police_insufficient_funds', message: 'Not enough in the bank.' } }

  await onPoliceLicenceBuy(room, client)

  assert.equal(player.policeLicence, false)
  assert.deepEqual(sentOf(client, 'police_error'), [{ code: 'police_insufficient_funds', message: 'Not enough in the bank.' }])
})

test('a prisoner or a player away from the desk does not reach Laravel', async () => {
  const { room, join } = setup()
  const { client: prisoner } = join('prisoner', 1, { ...atDesk, jail: { kind: 'npc', stars: 1, msLeft: 1000, cellId: 'cell_01' } })
  const { client: far } = join('far', 2, { x: DESK.x - 10, y: 1.8, z: DESK.z })

  await onPoliceLicenceBuy(room, prisoner)
  await onPoliceLicenceBuy(room, far)

  assert.equal(apiCalls.length, 0)
  assert.equal(sentOf(prisoner, 'police_error')[0].code, 'police_jailed')
  assert.equal(far.sent.length, 0)
})

test('the licence and its price are loaded at the join', async () => {
  const { room, join } = setup()
  const { player, client } = join('p', 1)

  await loadPoliceLicence(room, client, player)

  assert.equal(player.policeLicence, true)
  assert.deepEqual(sentOf(client, 'police_state'), [{ licensed: true, onDuty: false, price: 300 }])
  assert.throws(() => parseLicence({ held: 'yes', price: 300 }))
  assert.throws(() => parseLicence({ held: true, price: 0 }))
})
