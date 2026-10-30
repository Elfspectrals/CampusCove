import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, Player, PubRace } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [{ key: 'pub', bounds: { minX: 40, maxX: 140, minZ: -180, maxZ: -80 }, buildings: [] }],
  pub: {
    bartender: [90, 0, -138], bartenderYaw: 0, bouncer: [100, 0, -142],
    counter: [90, 0, -135], taps: [90, 1.05, -137], serve: [91, 1.05, -136], bell: [92, 1.9, -137],
    secretDoor: { position: [102, 0, -142], yaw: 0 },
    secretRoom: { minX: 100, maxX: 108, minZ: -150, maxZ: -143 },
    seats: [
      { id: 'stool_01', kind: 'stool', position: [88, 0.72, -134], yaw: 0 },
      { id: 'stool_02', kind: 'stool', position: [89.5, 0.72, -134], yaw: 0 }
    ],
    darts: { board: [84, 1.73, -142], boardYaw: 0, oche: [84, 0, -139.6] },
    shots: { plank: [95, 1.05, -136], yaw: 0, player: [95, 0, -135] }
  }
}

const apiCalls: Array<{ token: string | null, path: string, body: any }> = []
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const token = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer ', '')
  apiCalls.push({ token, path: path.replace(/^.*\/api/, ''), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path.endsWith('/pub/play')) return new Response(JSON.stringify({ alcohol: 24 }))
  if (path.endsWith('/pub/reward')) {
    const { placement } = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ coins: placement === 1 ? 40 : placement === 2 ? 15 : 0 }))
  }
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { onSit } = await import('./pub.ts')
const {
  clampRaceProgress,
  endRace,
  onDartsJoin,
  onDartsThrow,
  onRaceJoin,
  onRaceOpen,
  onRaceProgress,
  onShotsDone,
  onShotsStart,
  onStand,
  rewardPlacement,
  raceRanking,
  shotsPlausible,
  startDarts,
  startRace
} = await import('./pubGames.ts')
const { DARTS_LOBBY_MS, DARTS_TURN_MS, RACE_LOBBY_MS, RACE_MAX_PROGRESS_PER_S, SHOTS_MIN_MS } = await import('./pubConstants.ts')
await loadWorld()

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type, payload) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, x: number, z: number): Player {
  return {
    sessionId, accountId: 1, token: `token-${sessionId}`, x, y: 1.6, z, ry: 0,
    stats: { health: 100, hunger: 100, thirst: 100 }, knockedOutUntil: 0, lastMoveAt: 0, fallPeakY: 1.6,
    seatId: null, intoxication: 0, pubSecretUntil: 0, pubShots: null, lastPubBellAt: 0
  } as Player
}

function fakeRoom(...players: Player[]) {
  const clients = players.map((p) => fakeClient(p.sessionId))
  const timers: Array<() => void> = []
  const room = {
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients,
    housingUnits: [],
    seats: new Map<string, string>(),
    pub: { secretOpen: false, race: null, darts: null },
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.filter((c) => c !== except).forEach(fn),
    broadcastMove: () => undefined,
    clock: { setTimeout: (fn: () => void) => void timers.push(fn) }
  } as unknown as GameRoom & { clients: FakeClient[] }
  return { room, clients, timers }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

test('race progress is clamped to the fastest possible drinking and never goes backwards', () => {
  assert.equal(clampRaceProgress(0, 0.05, 1), 0.05)
  assert.equal(clampRaceProgress(0, 0.9, 1), RACE_MAX_PROGRESS_PER_S)
  assert.equal(clampRaceProgress(0.5, 0.2, 1), 0.5)
  assert.equal(clampRaceProgress(0.95, 5, 1), 1)
  assert.equal(clampRaceProgress(0.3, 0.4, 0), 0.3)
})

test('the ranking orders finishers by arrival and leaves out the others', () => {
  const race: PubRace = {
    hostSessionId: 'a', seed: 1, startsAt: 0, startedAt: 10_000, lastStateAt: 0,
    racers: new Map([
      ['a', { progress: 1, lastProgressAt: 0, finishedAt: 19_000, forfeited: false, alcohol: 0 }],
      ['b', { progress: 1, lastProgressAt: 0, finishedAt: 18_000, forfeited: false, alcohol: 0 }],
      ['c', { progress: 0.4, lastProgressAt: 0, finishedAt: null, forfeited: false, alcohol: 0 }],
      ['d', { progress: 1, lastProgressAt: 0, finishedAt: 17_000, forfeited: true, alcohol: 0 }]
    ])
  }
  assert.deepEqual(raceRanking(race), [{ sessionId: 'b', ms: 8000 }, { sessionId: 'a', ms: 9000 }])
  assert.equal(rewardPlacement(0, 1), 0)
  assert.equal(rewardPlacement(0, 3), 1)
  assert.equal(rewardPlacement(2, 3), 3)
})

test('a full Drink Fast race: lobby, start, clamped progress, rewards with each token, alcohol at the end', async () => {
  const a = fakePlayer('a', 88, -133)
  const b = fakePlayer('b', 89.5, -133)
  const watcher = fakePlayer('w', 80, -130)
  const { room, clients } = fakeRoom(a, b, watcher)
  const [ca, cb, cw] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  onSit(room, cb, { seatId: 'stool_02' })
  apiCalls.length = 0
  const t0 = 100_000

  await onRaceOpen(room, ca, t0)
  await onRaceJoin(room, cb, t0 + 1000)
  assert.deepEqual(apiCalls.map((c) => [c.token, c.path, c.body]), [
    ['token-a', '/pub/play', { game: 'drink_fast' }],
    ['token-b', '/pub/play', { game: 'drink_fast' }]
  ])
  assert.deepEqual(received(cw, 'pub_race_lobby').at(-1), { hostSessionId: 'a', players: ['a', 'b'], startsAt: t0 + RACE_LOBBY_MS })

  const race = room.pub.race!
  startRace(room, race, t0 + RACE_LOBBY_MS)
  assert.deepEqual(received(cw, 'pub_race_start'), [{ seed: race.seed, players: ['a', 'b'] }])

  const start = t0 + RACE_LOBBY_MS
  onRaceProgress(room, ca, { progress: 1 }, start + 1000)
  assert.equal(race.racers.get('a')!.progress, RACE_MAX_PROGRESS_PER_S)
  onRaceProgress(room, ca, { progress: 1 }, start + 1100)
  assert.equal(race.racers.get('a')!.progress, RACE_MAX_PROGRESS_PER_S)
  assert.deepEqual(received(cw, 'pub_race_state').at(-1), { players: [{ sessionId: 'a', progress: 0.125 }, { sessionId: 'b', progress: 0 }] })

  for (let i = 2; i <= 8; i++) onRaceProgress(room, ca, { progress: 1 }, start + i * 1000)
  assert.equal(race.racers.get('a')!.finishedAt, start + 8000)
  assert.equal(room.pub.race, race)
  for (let i = 1; i <= 9; i++) onRaceProgress(room, cb, { progress: 1 }, start + i * 1000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.pub.race, null)
  const end = received(cw, 'pub_race_end').at(-1)
  assert.deepEqual(end.ranking, [{ sessionId: 'a', ms: 8000 }, { sessionId: 'b', ms: 8000 }])
  assert.deepEqual(end.rewards, [{ sessionId: 'a', coins: 40 }, { sessionId: 'b', coins: 15 }])
  assert.deepEqual(apiCalls.slice(2).map((c) => [c.token, c.body]), [
    ['token-a', { game: 'drink_fast', placement: 1, score: 8000 }],
    ['token-b', { game: 'drink_fast', placement: 2, score: 8000 }]
  ])
  assert.equal(a.intoxication, 24)
  assert.equal(b.intoxication, 24)
})

test('opening a race needs a bar stool and only one race runs at a time', async () => {
  const a = fakePlayer('a', 88, -133)
  const b = fakePlayer('b', 89.5, -133)
  const { room, clients } = fakeRoom(a, b)
  const [ca, cb] = clients
  await onRaceOpen(room, ca)
  assert.deepEqual(received(ca, 'pub_error').map((e) => e.code), ['race_not_on_stool'])
  onSit(room, ca, { seatId: 'stool_01' })
  onSit(room, cb, { seatId: 'stool_02' })
  await onRaceOpen(room, ca)
  await onRaceOpen(room, cb)
  assert.deepEqual(received(cb, 'pub_error').map((e) => e.code), ['race_in_progress'])
})

test('standing up forfeits the race and a lone finisher wins solo', async () => {
  const a = fakePlayer('a', 88, -133)
  const b = fakePlayer('b', 89.5, -133)
  const { room, clients } = fakeRoom(a, b)
  const [ca, cb] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  onSit(room, cb, { seatId: 'stool_02' })
  const t0 = 200_000
  await onRaceOpen(room, ca, t0)
  await onRaceJoin(room, cb, t0)
  const race = room.pub.race!
  startRace(room, race, t0 + RACE_LOBBY_MS)
  onStand(room, cb)
  assert.equal(race.racers.get('b')!.forfeited, true)
  apiCalls.length = 0
  for (let i = 1; i <= 8; i++) onRaceProgress(room, ca, { progress: 1 }, t0 + RACE_LOBBY_MS + i * 1000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(apiCalls.map((c) => c.body), [{ game: 'drink_fast', placement: 0, score: 8000 }])
  assert.equal(b.intoxication, 0)
  assert.equal(a.intoxication, 24)
})

test('a race nobody finishes ends on its timeout without rewards', async () => {
  const a = fakePlayer('a', 88, -133)
  const { room, clients } = fakeRoom(a)
  onSit(room, clients[0], { seatId: 'stool_01' })
  await onRaceOpen(room, clients[0], 0)
  const race = room.pub.race!
  startRace(room, race, RACE_LOBBY_MS)
  apiCalls.length = 0
  await endRace(room, race)
  assert.deepEqual(received(clients[0], 'pub_race_end'), [{ ranking: [], rewards: [] }])
  assert.equal(apiCalls.length, 0)
  assert.equal(room.pub.race, null)
})

test('a Meter Shot time is only accepted inside the plausibility window', () => {
  assert.equal(shotsPlausible(SHOTS_MIN_MS - 1, 2000), false)
  assert.equal(shotsPlausible(1600, 1600), true)
  assert.equal(shotsPlausible(2000, 5000), true)
  assert.equal(shotsPlausible(2000, 5001), false)
  assert.equal(shotsPlausible(4000, 3500), true)
  assert.equal(shotsPlausible(4001, 3500), false)
  assert.equal(shotsPlausible(NaN, 3500), false)
})

test('Meter Shot: paid start, result rewarded, drink seen by the others', async () => {
  const me = fakePlayer('me', 95, -134)
  const other = fakePlayer('other', 80, -130)
  const { room, clients } = fakeRoom(me, other)
  const [cMe, cOther] = clients
  apiCalls.length = 0
  await onShotsStart(room, cMe, 1000)
  const ready = received(cMe, 'pub_shots_ready')[0]
  assert.equal(ready.seed, me.pubShots?.seed)
  assert.equal(apiCalls[0].body.game, 'meter_shot')
  await onShotsDone(room, cMe, { ms: 5000 }, ready.startedAt + 5200)
  assert.equal(me.pubShots, null)
  assert.equal(me.intoxication, 24)
  assert.deepEqual(apiCalls[1].body, { game: 'meter_shot', placement: 0, score: 5000 })
  assert.equal(received(cMe, 'pub_shots_result')[0].ms, 5000)
  assert.deepEqual(received(cOther, 'user_action'), [{ sessionId: 'me', action: 'drink', code: 'drink_vodka' }])
})

test('Meter Shot refuses a start away from the plank and an implausible time', async () => {
  const me = fakePlayer('me', 80, -130)
  const { room, clients } = fakeRoom(me)
  await onShotsStart(room, clients[0])
  assert.deepEqual(received(clients[0], 'pub_error').map((e) => e.code), ['pub_too_far'])
  me.x = 95
  me.z = -134
  await onShotsStart(room, clients[0], 1000)
  const { startedAt } = received(clients[0], 'pub_shots_ready')[0]
  await onShotsDone(room, clients[0], { ms: 1000 }, startedAt + 9000)
  assert.deepEqual(received(clients[0], 'pub_error').map((e) => e.code), ['pub_too_far', 'shots_implausible'])
  assert.equal(me.intoxication, 0)
})

test('Darts: lobby, three darts each in turn, a timed-out turn loses its darts, best total wins', async () => {
  const a = fakePlayer('a', 84, -139)
  const b = fakePlayer('b', 84.5, -139)
  const away = fakePlayer('away', 90, -130)
  const { room, clients, timers } = fakeRoom(a, b, away)
  const [ca, cb, cAway] = clients
  apiCalls.length = 0
  const t0 = 300_000

  await onDartsJoin(room, cAway, t0)
  assert.deepEqual(received(cAway, 'pub_error').map((e) => e.code), ['pub_too_far'])
  await onDartsJoin(room, ca, t0)
  await onDartsJoin(room, cb, t0 + 500)
  assert.deepEqual(received(cAway, 'pub_darts_lobby').at(-1), { players: ['a', 'b'], startsAt: t0 + DARTS_LOBBY_MS })
  assert.equal(timers.length, 1)

  const game = room.pub.darts!
  startDarts(room, game, t0 + DARTS_LOBBY_MS)
  const start = t0 + DARTS_LOBBY_MS
  let state = received(cAway, 'pub_darts_state').at(-1)
  assert.equal(state.turn, 'a')
  assert.equal(state.throwsLeft, 3)
  assert.equal(state.turnEndsAt, start + DARTS_TURN_MS)

  onDartsThrow(room, cb, { x: 0, y: 0 }, start + 100)
  onDartsThrow(room, ca, { x: 0, y: 30 }, start + 100)
  onDartsThrow(room, ca, { x: 0, y: 0 }, start + 1000)
  onDartsThrow(room, ca, { x: 0, y: 10.3 }, start + 2000)
  state = received(cAway, 'pub_darts_state').at(-1)
  assert.equal(state.turn, 'a')
  assert.equal(state.throwsLeft, 1)
  onDartsThrow(room, ca, { x: 0, y: -16.5 }, start + 3000)
  state = received(cAway, 'pub_darts_state').at(-1)
  assert.equal(state.turn, 'b')
  assert.equal(state.players[0].total, 50 + 60 + 6)

  onDartsThrow(room, cb, { x: 5, y: 0 }, start + 4000)
  assert.equal(timers.length, 3)
  timers[2]()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.pub.darts, null)
  const end = received(cAway, 'pub_darts_end').at(-1)
  assert.deepEqual(end.ranking, [{ sessionId: 'a', total: 116 }, { sessionId: 'b', total: 6 }])
  assert.deepEqual(end.rewards, [{ sessionId: 'a', coins: 40 }, { sessionId: 'b', coins: 15 }])
  assert.deepEqual(apiCalls.filter((c) => c.path === '/pub/reward').map((c) => [c.token, c.body]), [
    ['token-a', { game: 'darts', placement: 1, score: 116 }],
    ['token-b', { game: 'darts', placement: 2, score: 6 }]
  ])
  assert.equal(game.players[1].darts.filter((d) => d.score === 0).length, 2)
})
