import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [
    { key: 'town', buildings: [] },
    { key: 'pub', bounds: { minX: 40, maxX: 140, minZ: -180, maxZ: -80 }, buildings: [] }
  ],
  clinic: {
    nurse: [-120, 0.2, 16],
    pharmacy: [-119, 0.2, 7],
    beds: [{ id: 'bed_01', position: [-126, 1.8, 16], bed: [-128, 0.85, 16], yaw: 0 }]
  },
  pub: {
    bartender: [90, 0, -138], bartenderYaw: 0, bouncer: [100, 0, -142],
    counter: [90, 0, -135], taps: [90, 1.05, -137], serve: [91, 1.05, -136], bell: [92, 1.9, -137],
    secretDoor: { position: [102, 0, -142], yaw: 0 },
    secretRoom: { minX: 100, maxX: 108, minZ: -150, maxZ: -143 },
    basement: { minX: 86, maxX: 108, minZ: -150, maxZ: -130, floorY: -3 },
    seats: [
      { id: 'stool_01', kind: 'stool', position: [88, 0.72, -134], yaw: 0 },
      { id: 'stool_02', kind: 'stool', position: [89.5, 0.72, -134], yaw: 0 },
      { id: 'chair_01', kind: 'chair', position: [80, 0.45, -128], yaw: 1.57 },
      { id: 'sofa_01', kind: 'sofa', position: [90, -2.55, -140], yaw: 0 }
    ],
    darts: { board: [84, 1.73, -142], boardYaw: 0, oche: [84, 0, -139.6] },
    shots: { plank: [95, 1.05, -136], yaw: 0, player: [95, 0, -135] }
  }
}

const apiCalls: string[] = []
globalThis.fetch = async (url: string | URL | Request) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  apiCalls.push(path.replace(/^.*\/api/, ''))
  if (path.endsWith('/survival/hangover')) return new Response(JSON.stringify({ billed: 40, balance_after: 60 }))
  return new Response(JSON.stringify({}))
}

const { loadWorld, worldPub } = await import('./world.ts')
const { moveRejection } = await import('./movement.ts')
const {
  normalizeSecretPhrase, onPubSecret, onSit, closeSecretDoorWhenExpired, currentSecretPhrase, inSecretVolume, blockAtSecretDoor
} = await import('./pub.ts')
const { onStand } = await import('./pubGames.ts')
const { tickSurvival } = await import('./survival.ts')
const {
  HANGOVER_INTOXICATION, INTOXICATION_DECAY_PER_S, SECRET_OPEN_MS, SECRET_PHRASE_EPOCH_MS, WEEK_MS, BOUNCER_BLOCK_COOLDOWN_MS
} = await import('./pubConstants.ts')
await loadWorld()

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type, payload) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, x: number, z: number): Player {
  return {
    sessionId,
    accountId: 1,
    token: `token-${sessionId}`,
    x,
    y: 1.6,
    z,
    ry: 0,
    stats: { health: 100, hunger: 100, thirst: 100 },
    knockedOutUntil: 0,
    speedBoostUntil: 0,
    lastMoveAt: 0,
    fallPeakY: 1.6,
    healOverTime: null,
    lastStatsSavedAt: Date.now(),
    seatId: null,
    intoxication: 0,
    pubSecretUntil: 0,
    pubShots: null,
    lastPubBellAt: 0,
    lastBouncerBlockAt: 0,
    clinicBedId: null
  } as Player
}

function fakeRoom(...players: Player[]) {
  const clients = players.map((p) => fakeClient(p.sessionId))
  const timers: Array<() => void> = []
  const room = {
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients,
    housingUnits: [],
    clinicBeds: new Map(),
    seats: new Map<string, string>(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.filter((c) => c !== except).forEach(fn),
    broadcastMove: () => undefined,
    clock: { setTimeout: (fn: () => void) => void timers.push(fn) }
  } as unknown as GameRoom & { clients: FakeClient[] }
  return { room, clients, timers }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

test('the manifest pub is parsed with its seats by id', () => {
  const pub = worldPub()
  assert.ok(pub)
  assert.equal(pub.seats.size, 4)
  assert.deepEqual(pub.seats.get('chair_01')?.position, { x: 80, y: 0.45, z: -128 })
  assert.deepEqual(pub.secretRoom, { minX: 100, maxX: 108, minZ: -150, maxZ: -143 })
  assert.deepEqual(pub.basement, { minX: 86, maxX: 108, minZ: -150, maxZ: -130, floorY: -3 })
  assert.deepEqual(pub.darts.oche, { x: 84, y: 0, z: -139.6 })
})

test('sitting needs a known free seat in reach inside the pub, then teleports onto it', () => {
  const me = fakePlayer('me', 87, -133)
  const far = fakePlayer('far', 10, 10)
  const { room, clients } = fakeRoom(me, far)
  const [cMe, cFar] = clients

  onSit(room, cMe, { seatId: 'stool_99' })
  onSit(room, cMe, { seatId: 'chair_01' })
  onSit(room, cFar, { seatId: 'stool_01' })
  assert.deepEqual(received(cMe, 'pub_error').map((e) => e.code), ['seat_unknown', 'seat_too_far'])
  assert.deepEqual(received(cFar, 'pub_error').map((e) => e.code), ['not_in_pub'])
  assert.equal(room.seats.size, 0)

  onSit(room, cMe, { seatId: 'stool_01' })
  assert.equal(me.seatId, 'stool_01')
  assert.equal(room.seats.get('stool_01'), 'me')
  assert.deepEqual([me.x, me.z], [88, -134])
  assert.ok(Math.abs(me.y - (0.72 - 0.72 + 1.6)) < 1e-9)
  assert.deepEqual(received(cMe, 'user_seated'), [{ sessionId: 'me', seatId: 'stool_01' }])
  // everyone tracks seats, so nobody outside the pub keeps a stale seated avatar
  assert.deepEqual(received(cFar, 'user_seated'), [{ sessionId: 'me', seatId: 'stool_01' }])
})

test('a player who blacked out to the clinic still sees the others stand up and walk away', () => {
  const me = fakePlayer('me', 88, -133)
  const friend = fakePlayer('friend', 89.5, -133)
  const { room, clients, timers } = fakeRoom(me, friend)
  const [cMe, cFriend] = clients
  onSit(room, cMe, { seatId: 'stool_01' })
  onSit(room, cFriend, { seatId: 'stool_02' })
  me.intoxication = 100

  tickSurvival(room, 2)
  timers.shift()!()
  assert.deepEqual([me.x, me.z], [-126, 16])

  onStand(room, cFriend)
  assert.deepEqual(received(cMe, 'user_seated').at(-1), { sessionId: 'friend', seatId: null })
})

test('an occupied seat is refused and standing frees it for the next player', () => {
  const a = fakePlayer('a', 88, -133)
  const b = fakePlayer('b', 88.5, -133)
  const { room, clients } = fakeRoom(a, b)
  const [ca, cb] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  onSit(room, cb, { seatId: 'stool_01' })
  assert.deepEqual(received(cb, 'pub_error').map((e) => e.code), ['seat_taken'])
  assert.equal(b.seatId, null)

  onStand(room, ca)
  assert.equal(a.seatId, null)
  assert.equal(room.seats.has('stool_01'), false)
  assert.deepEqual(received(cb, 'user_seated').at(-1), { sessionId: 'a', seatId: null })
  onSit(room, cb, { seatId: 'stool_01' })
  assert.equal(room.seats.get('stool_01'), 'b')
})

test('switching seats releases the previous one', () => {
  const a = fakePlayer('a', 88, -133)
  const { room, clients } = fakeRoom(a)
  onSit(room, clients[0], { seatId: 'stool_01' })
  onSit(room, clients[0], { seatId: 'stool_02' })
  assert.deepEqual([...room.seats], [['stool_02', 'a']])
})

test('the bouncer phrase is compared after trimming, lowercasing and squeezing spaces', () => {
  assert.equal(normalizeSecretPhrase('  Paris   WIENER '), 'paris wiener')
  assert.equal(normalizeSecretPhrase('paris\twiener'), 'paris wiener')
  assert.notEqual(normalizeSecretPhrase('pariswiener'), 'paris wiener')
})

test('the right phrase opens the staff door for the pub, the wrong one does not', () => {
  const me = fakePlayer('me', 99, -141)
  const other = fakePlayer('other', 85, -130)
  const outside = fakePlayer('outside', 0, 0)
  const { room, clients } = fakeRoom(me, other, outside)
  const [cMe, cOther, cOutside] = clients
  const now = 100_000

  onPubSecret(room, cMe, { phrase: 'open sesame' }, now)
  assert.deepEqual(received(cMe, 'pub_secret_result'), [{ ok: false }])
  assert.equal(me.pubSecretUntil, 0)

  onPubSecret(room, cMe, { phrase: ' Paris  Wiener' }, now)
  assert.deepEqual(received(cMe, 'pub_secret_result').at(-1), { ok: true, untilMs: now + SECRET_OPEN_MS })
  assert.deepEqual(received(cOther, 'pub_secret_door'), [{ open: true }])
  assert.deepEqual(received(cOutside, 'pub_secret_door'), [])

  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS - 1)
  assert.equal(received(cOther, 'pub_secret_door').length, 1)
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS + 1)
  assert.deepEqual(received(cOther, 'pub_secret_door').at(-1), { open: false })
})

test('the staff door stays open while someone is still inside the room', () => {
  const me = fakePlayer('me', 99, -141)
  const inside = fakePlayer('inside', 104, -146)
  const { room, clients } = fakeRoom(me, inside)
  const [cMe] = clients
  const now = 100_000

  onPubSecret(room, cMe, { phrase: 'paris wiener' }, now)
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS + 1)
  assert.equal(room.pub.secretOpen, true)

  inside.x = 95
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS + 2)
  assert.equal(room.pub.secretOpen, false)
})

test('a close check that fires just before access runs out rechecks instead of leaving the door open', () => {
  const me = fakePlayer('me', 99, -141)
  const { room, clients, timers } = fakeRoom(me)
  const now = 100_000
  onPubSecret(room, clients[0], { phrase: 'paris wiener' }, now)
  const before = timers.length
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS - 3)
  assert.equal(room.pub.secretOpen, true)
  assert.equal(timers.length, before + 1)
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS + 1)
  assert.equal(room.pub.secretOpen, false)
})

test('the bouncer only listens up close', () => {
  const me = fakePlayer('me', 90, -130)
  const { room, clients } = fakeRoom(me)
  onPubSecret(room, clients[0], { phrase: 'paris wiener' })
  assert.deepEqual(received(clients[0], 'pub_error').map((e) => e.code), ['pub_too_far'])
})

test('nobody in the basement reaches the bouncer through the bar floor', () => {
  const down = fakePlayer('down', 100, -141)
  down.y = BASEMENT_EYE_Y
  const { room, clients } = fakeRoom(down)
  onPubSecret(room, clients[0], { phrase: 'paris wiener' })
  assert.deepEqual(received(clients[0], 'pub_error').map((e) => e.code), ['pub_too_far'])
})

test('entering the hidden lounge is refused once the password expired, leaving it never is', () => {
  const me = fakePlayer('me', 99, -146)
  const { room } = fakeRoom(me)
  const now = 50_000
  me.lastMoveAt = now - 500
  assert.equal(moveRejection(room, me, 101, 1.6, -146, now), 'secret_room_closed')
  me.pubSecretUntil = now + 1000
  assert.equal(moveRejection(room, me, 101, 1.6, -146, now), null)
  me.x = 101
  me.pubSecretUntil = 0
  assert.equal(moveRejection(room, me, 103, 1.6, -146, now), null)
  assert.equal(moveRejection(room, me, 99, 1.6, -146, now), null)
})

const BASEMENT_EYE_Y = -3 + 1.6

test('the phrase of the week counts whole weeks from a Monday 00:00 UTC epoch', () => {
  const phrases = ['a', 'b', 'c']
  assert.equal(new Date(SECRET_PHRASE_EPOCH_MS).getUTCDay(), 1)
  assert.equal(currentSecretPhrase(SECRET_PHRASE_EPOCH_MS, phrases), 'a')
  assert.equal(currentSecretPhrase(SECRET_PHRASE_EPOCH_MS + WEEK_MS - 1, phrases), 'a')
  assert.equal(currentSecretPhrase(SECRET_PHRASE_EPOCH_MS + WEEK_MS, phrases), 'b')
  assert.equal(currentSecretPhrase(SECRET_PHRASE_EPOCH_MS + 5 * WEEK_MS, phrases), 'c')
  assert.equal(currentSecretPhrase(SECRET_PHRASE_EPOCH_MS - 1, phrases), 'c')
  assert.equal(currentSecretPhrase(Date.UTC(2026, 9, 30)), 'paris wiener')
})

test('the secret volume is the stair enclosure at any height plus the basement below the bar floor', () => {
  const pub = worldPub()!
  assert.equal(inSecretVolume(pub, 104, 1.6, -146), true)
  assert.equal(inSecretVolume(pub, 104, -1, -146), true)
  assert.equal(inSecretVolume(pub, 90, BASEMENT_EYE_Y, -140), true)
  assert.equal(inSecretVolume(pub, 90, 1.6, -140), false)
  assert.equal(inSecretVolume(pub, 90, 0.7, -140), false)
  assert.equal(inSecretVolume(pub, 90, 0.5, -140), true)
  assert.equal(inSecretVolume(pub, 80, BASEMENT_EYE_Y, -140), false)
  assert.equal(inSecretVolume({ ...pub, basement: null }, 90, BASEMENT_EYE_Y, -140), false)
})

test('the basement cannot be entered from outside without the word, but anyone inside can walk up and out', () => {
  const me = fakePlayer('me', 90, -140)
  const { room } = fakeRoom(me)
  const now = 50_000
  me.lastMoveAt = now - 500
  assert.equal(moveRejection(room, me, 90.5, 1.6, -140, now), null)
  assert.equal(moveRejection(room, me, 90.5, BASEMENT_EYE_Y, -140, now), 'secret_room_closed')

  Object.assign(me, { x: 92, y: BASEMENT_EYE_Y, z: -146 })
  assert.equal(moveRejection(room, me, 93, BASEMENT_EYE_Y, -146, now), null)
  Object.assign(me, { x: 99.5, y: -0.5, z: -146 })
  assert.equal(moveRejection(room, me, 100.5, 0.5, -146, now), null)
  Object.assign(me, { x: 101, y: 1.6, z: -143.2 })
  assert.equal(moveRejection(room, me, 101, 1.6, -142.5, now), null)
})

test('the bouncer pushes a gatecrasher back in front of him and speaks at most every 2 s', () => {
  const me = fakePlayer('me', 100.5, -142.5)
  const watcher = fakePlayer('watcher', 90, -135)
  const { room, clients } = fakeRoom(me, watcher)
  const [cMe, cWatcher] = clients
  const now = 80_000

  blockAtSecretDoor(room, cMe, me, now)
  assert.deepEqual(received(cMe, 'position_correction'), [{ x: 99, y: 1.6, z: -142 }])
  assert.deepEqual([me.x, me.y, me.z, me.lastMoveAt], [99, 1.6, -142, now])
  const line = { sessionId: 'me', accountId: 1, line: 'Not without the word, pal.' }
  assert.deepEqual(received(cWatcher, 'pub_bouncer_block'), [line])
  assert.deepEqual(received(cMe, 'pub_bouncer_block'), [line])

  blockAtSecretDoor(room, cMe, me, now + BOUNCER_BLOCK_COOLDOWN_MS - 1)
  assert.equal(received(cMe, 'position_correction').length, 2)
  assert.equal(received(cWatcher, 'pub_bouncer_block').length, 1)
  blockAtSecretDoor(room, cMe, me, now + BOUNCER_BLOCK_COOLDOWN_MS)
  assert.equal(received(cWatcher, 'pub_bouncer_block').length, 2)
})

test('the staff door stays open while someone is still down in the basement', () => {
  const me = fakePlayer('me', 99, -141)
  const below = fakePlayer('below', 90, -140)
  below.y = BASEMENT_EYE_Y
  const { room, clients } = fakeRoom(me, below)
  const now = 100_000
  onPubSecret(room, clients[0], { phrase: 'paris wiener' }, now)
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS + 1)
  assert.equal(room.pub.secretOpen, true)
  below.y = 1.6
  closeSecretDoorWhenExpired(room, now + SECRET_OPEN_MS + 2)
  assert.equal(room.pub.secretOpen, false)
})

test('seats are out of reach through the floor between the bar and the basement', () => {
  const up = fakePlayer('up', 90, -139)
  const down = fakePlayer('down', 88, -133.5)
  down.y = BASEMENT_EYE_Y
  const { room, clients } = fakeRoom(up, down)
  const [cUp, cDown] = clients
  onSit(room, cUp, { seatId: 'sofa_01' })
  onSit(room, cDown, { seatId: 'stool_01' })
  assert.deepEqual(received(cUp, 'pub_error').map((e) => e.code), ['seat_too_far'])
  assert.deepEqual(received(cDown, 'pub_error').map((e) => e.code), ['seat_too_far'])

  Object.assign(down, { x: 90, z: -139 })
  onSit(room, cDown, { seatId: 'sofa_01' })
  assert.equal(down.seatId, 'sofa_01')
})

test('intoxication sobers up with the survival tick and is reported in the survival message', () => {
  const me = fakePlayer('me', 0, 0)
  me.intoxication = 50
  const { room, clients } = fakeRoom(me)
  tickSurvival(room, 60)
  assert.ok(Math.abs(me.intoxication - (50 - 60 * INTOXICATION_DECAY_PER_S)) < 1e-9)
  assert.equal(received(clients[0], 'survival').at(-1).intoxication, me.intoxication)
  me.intoxication = 0.01
  tickSurvival(room, 60)
  assert.equal(me.intoxication, 0)
})

test('a drunk player blacks out: hangover bill, seat released, 30 of intoxication on waking up', async () => {
  const me = fakePlayer('me', 88, -133)
  const { room, clients, timers } = fakeRoom(me)
  const [cMe] = clients
  onSit(room, cMe, { seatId: 'stool_01' })
  me.intoxication = 100
  apiCalls.length = 0

  tickSurvival(room, 2)
  assert.ok(me.knockedOutUntil > Date.now())
  assert.equal(me.seatId, null)
  assert.equal(room.seats.size, 0)
  assert.deepEqual(received(cMe, 'survival_knocked_out').map((m) => m.cause), ['alcohol'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(apiCalls, ['/survival/hangover'])
  assert.deepEqual(received(cMe, 'survival_hospital_bill'), [{ cause: 'alcohol', billed: 40, balanceAfter: 60, lostItems: 0, lostClothes: 0 }])

  timers.shift()!()
  assert.equal(me.intoxication, HANGOVER_INTOXICATION)
  assert.equal(received(cMe, 'survival_respawn').length, 1)
  assert.deepEqual([me.x, me.z], [-126, 16])
})

test('a health knockout keeps the hospital route and says so', async () => {
  const me = fakePlayer('me', 0, 0)
  me.stats = { health: 1, hunger: 0, thirst: 0 }
  const { room, clients } = fakeRoom(me)
  apiCalls.length = 0
  tickSurvival(room, 60)
  assert.deepEqual(received(clients[0], 'survival_knocked_out').map((m) => m.cause), ['health'])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(apiCalls, ['/survival/hospital'])
})
