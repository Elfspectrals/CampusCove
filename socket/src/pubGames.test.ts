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
      { id: 'stool_02', kind: 'stool', position: [89.5, 0.72, -134], yaw: 0 },
      { id: 'stool_03', kind: 'stool', position: [96, 0.72, -134], yaw: 0 }
    ],
    darts: { board: [84, 1.73, -142], boardYaw: 0, oche: [84, 0, -139.6] },
    shots: { plank: [95, 1.05, -136], yaw: 0, player: [95, 0, -135] }
  }
}

const apiCalls: Array<{ token: string | null, path: string, body: any }> = []
const freeDartsTokens = new Set<string>()
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const token = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer ', '')
  apiCalls.push({ token, path: path.replace(/^.*\/api/, ''), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path.endsWith('/pub/play')) return new Response(JSON.stringify(freeDartsTokens.has(token) ? { alcohol: 0, fee: 0 } : { alcohol: 24 }))
  if (path.endsWith('/pub/reward')) {
    const { placement, free } = JSON.parse(String(init?.body))
    if (free) return new Response(JSON.stringify({ coins: 0 }))
    return new Response(JSON.stringify({ coins: placement === 1 ? 40 : placement === 2 ? 15 : 0 }))
  }
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { onSit } = await import('./pub.ts')
const {
  endRace,
  onDartsJoin,
  onDartsLeave,
  onDartsThrow,
  onRaceChallenge,
  onRaceChallengeReply,
  onRaceJoin,
  onRaceLeave,
  onRaceOpen,
  onRaceProgress,
  onShotsDone,
  onShotsLeave,
  onShotsStart,
  onStand,
  rewardPlacement,
  raceRanking,
  shotsTime,
  startDarts,
  startRace
} = await import('./pubGames.ts')
const { CHALLENGE_COUNTDOWN_MS, CHALLENGE_TTL_MS, DARTS_LOBBY_MS, DARTS_POWER_IDEAL, DARTS_TURN_MS, RACE_LOBBY_MS, RACE_SPILL_PENALTY_MS, SHOTS_MIN_MS } = await import('./pubConstants.ts')
const { DRINK_FAST_STEP_MS, DRINK_FAST_STEP_S, createDrinkFastSim } = await import('./drinkFastSim.ts')
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

/** Plays the balance game like a client: holds whenever the glass is below `aim`, records every press/release step. */
function playDrinkFast(seed: number, aim: number, maxSteps = 45 * 60) {
  const sim = createDrinkFastSim(seed)
  const toggles: number[] = []
  const spillsAt: number[] = []
  let y = 0.5
  let holding = false
  let finishStep: number | null = null
  for (let step = 0; step < maxSteps && finishStep === null; step++) {
    if ((y < aim) !== holding) {
      holding = !holding
      toggles.push(step)
    }
    const state = sim.step(DRINK_FAST_STEP_S, holding)
    y = state.y
    spillsAt.push(state.spills)
    if (state.progress >= 1) finishStep = step + 1
  }
  return { toggles, finishStep, spillsAt }
}

/** What the client sends every 250 ms: the step it reached and every flip so far. */
function sendDrinkFast(room: GameRoom, client: GameClient, toggles: number[], start: number, untilMs: number): void {
  for (let t = 250; t <= untilMs; t += 250) {
    const step = Math.floor(t / DRINK_FAST_STEP_MS)
    onRaceProgress(room, client, { step, toggles: toggles.filter((s) => s <= step) }, start + t)
  }
}

function drinkingMs(finishStep: number): number {
  return Math.round(finishStep * DRINK_FAST_STEP_MS)
}

function racer(progress: number, finishedAt: number | null, forfeited = false) {
  return { progress, lastProgressAt: 0, finishedAt, forfeited, alcohol: 0, spills: 0, sim: createDrinkFastSim(1), step: 0 }
}

test('progress and spills come from the server replay, never from what the client claims', async () => {
  const a = fakePlayer('a', 88, -133)
  const { room, clients } = fakeRoom(a)
  const [ca] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  const t0 = 600_000
  await onRaceOpen(room, ca, t0)
  const race = room.pub.race!
  const start = t0 + RACE_LOBBY_MS
  startRace(room, race, start)
  const me = race.racers.get('a')!

  onRaceProgress(room, ca, { progress: 1, spills: 0 }, start + 1000)
  assert.equal(me.progress, 0)

  const wobbly = playDrinkFast(race.seed, 0.95)
  const step = Math.floor(3000 / DRINK_FAST_STEP_MS)
  onRaceProgress(room, ca, { step, toggles: wobbly.toggles.filter((s) => s <= step), progress: 1, spills: 0 }, start + 3000)
  assert.equal(me.step, step)
  assert.equal(me.spills, wobbly.spillsAt[step - 1])
  assert.ok(me.spills > 0, 'aiming at the rim spills')
  assert.ok(me.progress < 1)
})

test('the client cannot replay further than the time elapsed on the server', async () => {
  const a = fakePlayer('a', 88, -133)
  const { room, clients } = fakeRoom(a)
  const [ca] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  const t0 = 700_000
  await onRaceOpen(room, ca, t0)
  const race = room.pub.race!
  const start = t0 + RACE_LOBBY_MS
  startRace(room, race, start)
  const plan = playDrinkFast(race.seed, 0.5)
  const me = race.racers.get('a')!
  onRaceProgress(room, ca, { step: plan.finishStep, toggles: plan.toggles }, start + 1000)
  assert.equal(me.finishedAt, null)
  const reached = Math.floor(1000 / DRINK_FAST_STEP_MS) + 30
  assert.equal(me.step, reached)
  onRaceProgress(room, ca, { step: reached + 10, toggles: [5, 3] }, start + 1500)
  assert.equal(me.step, reached, 'unordered flips are refused')
})

test('the ranking orders finishers by arrival and leaves out the others', () => {
  const race: PubRace = {
    hostSessionId: 'a', seed: 1, startsAt: 0, startedAt: 10_000, lastStateAt: 0,
    racers: new Map([
      ['a', racer(1, 19_000)],
      ['b', racer(1, 18_000)],
      ['c', racer(0.4, null)],
      ['d', racer(1, 17_000, true)]
    ])
  }
  assert.deepEqual(raceRanking(race), [{ sessionId: 'b', ms: 8000, spills: 0 }, { sessionId: 'a', ms: 9000, spills: 0 }])
  race.racers.get('b')!.spills = 1
  assert.deepEqual(raceRanking(race), [{ sessionId: 'a', ms: 9000, spills: 0 }, { sessionId: 'b', ms: 10_000, spills: 1 }])
  assert.equal(rewardPlacement(0, 1), 0)
  assert.equal(rewardPlacement(0, 3), 1)
  assert.equal(rewardPlacement(2, 3), 3)
})

test('a full Drink Fast race: lobby, start, replayed progress, rewards with each token, alcohol at the end', async () => {
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
  const plans = { a: playDrinkFast(race.seed, 0.5), b: playDrinkFast(race.seed, 0.45) }
  assert.ok(plans.a.finishStep !== null && plans.b.finishStep !== null)
  const scoreOf = (p: typeof plans.a) => drinkingMs(p.finishStep!) + p.spillsAt.at(-1)! * RACE_SPILL_PENALTY_MS
  const expected = (['a', 'b'] as const)
    .map((id) => ({ sessionId: id, ms: scoreOf(plans[id]), spills: plans[id].spillsAt.at(-1)! }))
    .sort((x, y) => x.ms - y.ms)
  assert.notEqual(expected[0].ms, expected[1].ms)

  const until = drinkingMs(Math.max(plans.a.finishStep!, plans.b.finishStep!)) + 500
  sendDrinkFast(room, ca, plans.a.toggles, start, until)
  assert.equal(race.racers.get('a')!.finishedAt, start + drinkingMs(plans.a.finishStep!))
  assert.equal(room.pub.race, race)
  sendDrinkFast(room, cb, plans.b.toggles, start, until)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.pub.race, null)
  const end = received(cw, 'pub_race_end').at(-1)
  assert.deepEqual(end.ranking, expected)
  assert.deepEqual(end.rewards, [{ sessionId: expected[0].sessionId, coins: 40 }, { sessionId: expected[1].sessionId, coins: 15 }])
  assert.deepEqual(apiCalls.slice(2).map((c) => [c.token, c.body]), expected.map((row, i) => [
    `token-${row.sessionId}`, { game: 'drink_fast', placement: i + 1, score: row.ms }
  ]))
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
  const plan = playDrinkFast(race.seed, 0.5)
  sendDrinkFast(room, ca, plan.toggles, t0 + RACE_LOBBY_MS, drinkingMs(plan.finishStep!) + 500)
  await new Promise((resolve) => setImmediate(resolve))
  const score = drinkingMs(plan.finishStep!) + plan.spillsAt.at(-1)! * RACE_SPILL_PENALTY_MS
  assert.deepEqual(apiCalls.map((c) => c.body), [{ game: 'drink_fast', placement: 0, score }])
  assert.equal(b.intoxication, 0)
  assert.equal(a.intoxication, 24)
})

test('closing the race screen leaves the race, so a new race can be opened at once', async () => {
  const a = fakePlayer('a', 88, -133)
  const { room, clients } = fakeRoom(a)
  const [ca] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  const t0 = 300_000
  await onRaceOpen(room, ca, t0)
  startRace(room, room.pub.race!, t0 + RACE_LOBBY_MS)
  onRaceLeave(room, ca)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.pub.race, null)
  await onRaceOpen(room, ca, t0 + RACE_LOBBY_MS + 1000)
  assert.deepEqual(received(ca, 'pub_error').map((e) => e.code), [])
  assert.notEqual(room.pub.race, null)
})

test('each spill adds its penalty to the finish time', async () => {
  const a = fakePlayer('a', 88, -133)
  const { room, clients } = fakeRoom(a)
  const [ca] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  const t0 = 400_000
  await onRaceOpen(room, ca, t0)
  const race = room.pub.race!
  const start = t0 + RACE_LOBBY_MS
  startRace(room, race, start)
  const plan = playDrinkFast(race.seed, 0.6)
  assert.ok(plan.finishStep !== null)
  sendDrinkFast(room, ca, plan.toggles, start, drinkingMs(plan.finishStep!) + 500)
  await new Promise((resolve) => setImmediate(resolve))
  const spills = plan.spillsAt.at(-1)!
  const end = received(ca, 'pub_race_end')[0]
  assert.deepEqual(end.ranking, [{ sessionId: 'a', ms: drinkingMs(plan.finishStep!) + spills * RACE_SPILL_PENALTY_MS, spills }])
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

test('a Meter Shot time is the server clock less the network allowance, and never faster than a human', () => {
  assert.equal(shotsTime(5250), 5000)
  assert.equal(shotsTime(SHOTS_MIN_MS + 250), SHOTS_MIN_MS)
  assert.equal(shotsTime(SHOTS_MIN_MS + 249), null)
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
  await onShotsDone(room, cMe, ready.startedAt + 5250)
  assert.equal(me.pubShots, null)
  assert.equal(me.intoxication, 24)
  assert.deepEqual(apiCalls[1].body, { game: 'meter_shot', placement: 0, score: 5000 })
  assert.equal(received(cMe, 'pub_shots_result')[0].ms, 5000)
  assert.deepEqual(received(cOther, 'user_action'), [{ sessionId: 'me', action: 'drink', code: 'drink_vodka' }])
})

test('Meter Shot refuses a start away from the plank and a run faster than a human', async () => {
  const me = fakePlayer('me', 80, -130)
  const { room, clients } = fakeRoom(me)
  await onShotsStart(room, clients[0])
  assert.deepEqual(received(clients[0], 'pub_error').map((e) => e.code), ['pub_too_far'])
  me.x = 95
  me.z = -134
  await onShotsStart(room, clients[0], 1000)
  const { startedAt } = received(clients[0], 'pub_shots_ready')[0]
  await onShotsDone(room, clients[0], startedAt + 1000)
  assert.deepEqual(received(clients[0], 'pub_error').map((e) => e.code), ['pub_too_far', 'shots_implausible'])
  assert.equal(me.intoxication, 0)
})

test('closing the Meter Shot screen mid-run forfeits it, so the plank can be played again at once', async () => {
  const me = fakePlayer('me', 95, -134)
  const { room, clients } = fakeRoom(me)
  const [cMe] = clients
  await onShotsStart(room, cMe, 1000)
  onShotsLeave(room, cMe)
  assert.equal(me.pubShots, null)
  await onShotsStart(room, cMe, 2000)
  assert.deepEqual(received(cMe, 'pub_error').map((e) => e.code), [])
  assert.equal(received(cMe, 'pub_shots_ready').length, 2)
  assert.equal(me.intoxication, 0)
})

test('closing the darts screen leaves the game: out of the lobby, or the turn passes to the next player', async () => {
  const a = fakePlayer('a', 84, -139)
  const b = fakePlayer('b', 84.5, -139)
  const { room, clients } = fakeRoom(a, b)
  const [ca, cb] = clients
  const t0 = 500_000
  await onDartsJoin(room, ca, t0)
  await onDartsJoin(room, cb, t0)
  onDartsLeave(room, cb)
  assert.deepEqual(received(ca, 'pub_darts_lobby').at(-1).players, ['a'])
  await onDartsJoin(room, cb, t0 + 1000)
  const game = room.pub.darts!
  startDarts(room, game, t0 + DARTS_LOBBY_MS)
  assert.equal(received(cb, 'pub_darts_state').at(-1).turn, 'a')
  onDartsLeave(room, ca)
  const state = received(cb, 'pub_darts_state').at(-1)
  assert.equal(state.turn, 'b')
  assert.deepEqual(state.players.map((p: { sessionId: string }) => p.sessionId), ['b'])
  onDartsLeave(room, cb)
  assert.equal(room.pub.darts, null)
  await onDartsJoin(room, ca, t0 + DARTS_LOBBY_MS + 1000)
  assert.deepEqual(received(ca, 'pub_error').map((e) => e.code), [])
  assert.notEqual(room.pub.darts, null)
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

  // A steady hand: this source makes every server-side scatter draw zero.
  const still = () => 0.25
  onDartsThrow(room, cb, { x: 0, y: 0, power: DARTS_POWER_IDEAL }, start + 100, still)
  onDartsThrow(room, ca, { x: 0, y: 30, power: DARTS_POWER_IDEAL }, start + 100, still)
  onDartsThrow(room, ca, { x: 0, y: 0, power: DARTS_POWER_IDEAL }, start + 1000, still)
  onDartsThrow(room, ca, { x: 0, y: 10.3, power: DARTS_POWER_IDEAL }, start + 2000, still)
  state = received(cAway, 'pub_darts_state').at(-1)
  assert.equal(state.turn, 'a')
  assert.equal(state.throwsLeft, 1)
  onDartsThrow(room, ca, { x: 0, y: -16.5, power: DARTS_POWER_IDEAL }, start + 3000, still)
  state = received(cAway, 'pub_darts_state').at(-1)
  assert.equal(state.turn, 'b')
  assert.equal(state.players[0].total, 50 + 60 + 6)

  onDartsThrow(room, cb, { x: 5, y: 0, power: DARTS_POWER_IDEAL }, start + 4000, still)
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

test('Darts: a game with a free tutorial entry still counts for everyone and pays nobody', async () => {
  const a = fakePlayer('a', 84, -139)
  const newcomer = fakePlayer('newcomer', 84.5, -139)
  const { room, clients, timers } = fakeRoom(a, newcomer)
  const [ca, cn] = clients
  apiCalls.length = 0
  freeDartsTokens.add('token-newcomer')
  const t0 = 700_000

  await onDartsJoin(room, ca, t0)
  await onDartsJoin(room, cn, t0)
  const game = room.pub.darts!
  startDarts(room, game, t0 + DARTS_LOBBY_MS)
  timers.at(-1)!()
  timers.at(-1)!()
  await new Promise((resolve) => setImmediate(resolve))
  freeDartsTokens.clear()

  assert.equal(room.pub.darts, null)
  assert.deepEqual(received(ca, 'pub_darts_end').at(-1).rewards, [{ sessionId: 'a', coins: 0 }, { sessionId: 'newcomer', coins: 0 }])
  assert.deepEqual(apiCalls.filter((c) => c.path === '/pub/reward').map((c) => [c.token, c.body.free]), [
    ['token-a', true],
    ['token-newcomer', true]
  ])
})

test('the race state carries spills, and a new spill skips the state throttle', async () => {
  const a = fakePlayer('a', 88, -133)
  const b = fakePlayer('b', 89.5, -133)
  const { room, clients } = fakeRoom(a, b)
  const [ca, cb] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  onSit(room, cb, { seatId: 'stool_02' })
  const t0 = 500_000
  await onRaceOpen(room, ca, t0)
  await onRaceJoin(room, cb, t0)
  const race = room.pub.race!
  const start = t0 + RACE_LOBBY_MS
  startRace(room, race, start)
  const steady = playDrinkFast(race.seed, 0.5)
  const wobbly = playDrinkFast(race.seed, 0.95)
  const firstSpill = wobbly.spillsAt.findIndex((n) => n > 0) + 1
  const t1 = Math.ceil(firstSpill * DRINK_FAST_STEP_MS) + 100
  assert.equal(steady.spillsAt[Math.floor((t1 + 100) / DRINK_FAST_STEP_MS)], 0, 'the steady racer has not spilled yet')
  const send = (client: GameClient, plan: typeof steady, t: number) => {
    const step = Math.floor(t / DRINK_FAST_STEP_MS)
    onRaceProgress(room, client, { step, toggles: plan.toggles.filter((s) => s <= step) }, start + t)
  }

  send(ca, steady, t1)
  assert.equal(received(cb, 'pub_race_state').length, 1)
  send(cb, wobbly, t1 + 50)
  const states = received(cb, 'pub_race_state')
  assert.equal(states.length, 2, 'a spill goes out at once')
  assert.ok(states.at(-1).players.find((p: any) => p.sessionId === 'b').spills > 0)
  send(ca, steady, t1 + 100)
  assert.equal(received(cb, 'pub_race_state').length, 2, 'plain progress stays throttled')
})

function seatedTrio() {
  const a = fakePlayer('a', 88, -133)
  const b = fakePlayer('b', 89.5, -133)
  const c = fakePlayer('c', 96, -133)
  const { room, clients, timers } = fakeRoom(a, b, c)
  const [ca, cb, cc] = clients
  onSit(room, ca, { seatId: 'stool_01' })
  onSit(room, cb, { seatId: 'stool_02' })
  onSit(room, cc, { seatId: 'stool_03' })
  apiCalls.length = 0
  return { room, timers, a, b, c, ca, cb, cc }
}

test('an accepted challenge opens a 3 s race with both racers paid, others can still join', async () => {
  const { room, timers, ca, cb, cc } = seatedTrio()
  const t0 = 600_000
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, t0)
  assert.deepEqual(received(cb, 'pub_race_challenged'), [{ fromSessionId: 'a', expiresAt: t0 + CHALLENGE_TTL_MS }])
  assert.deepEqual(received(ca, 'pub_race_challenge_sent'), [{ toSessionId: 'b', expiresAt: t0 + CHALLENGE_TTL_MS }])
  assert.equal(room.pub.challenges.size, 1)

  await onRaceChallengeReply(room, cb, { fromSessionId: 'a', accept: true }, t0 + 2000)
  assert.equal(room.pub.challenges.size, 0)
  assert.deepEqual(received(ca, 'pub_race_challenge_result'), [{ toSessionId: 'b', accepted: true }])
  const race = room.pub.race!
  assert.equal(race.hostSessionId, 'a')
  assert.equal(race.startsAt, t0 + 2000 + CHALLENGE_COUNTDOWN_MS)
  assert.deepEqual([...race.racers.keys()], ['a', 'b'])
  assert.deepEqual([...race.racers.values()].map((r) => r.alcohol), [24, 24])
  assert.deepEqual(apiCalls.map((c) => [c.token, c.path]), [['token-a', '/pub/play'], ['token-b', '/pub/play']])
  assert.deepEqual(received(cc, 'pub_race_lobby').at(-1), { hostSessionId: 'a', players: ['a', 'b'], startsAt: t0 + 2000 + CHALLENGE_COUNTDOWN_MS })

  await onRaceJoin(room, cc, t0 + 3000)
  assert.deepEqual(received(cc, 'pub_race_lobby').at(-1).players, ['a', 'b', 'c'])
  timers[0]()
  assert.deepEqual(received(ca, 'pub_race_challenge_result').length, 1)
  timers[1]()
  assert.notEqual(race.startedAt, null)
  assert.deepEqual(received(cc, 'pub_race_start').at(-1).players, ['a', 'b', 'c'])
})

test('a declined challenge tells the challenger and opens nothing', async () => {
  const { room, ca, cb } = seatedTrio()
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, 700_000)
  await onRaceChallengeReply(room, ca, { fromSessionId: 'a', accept: true }, 700_100)
  assert.equal(room.pub.challenges.size, 1)
  await onRaceChallengeReply(room, cb, { fromSessionId: 'a', accept: false }, 700_200)
  assert.deepEqual(received(ca, 'pub_race_challenge_result'), [{ toSessionId: 'b', accepted: false, reason: 'declined' }])
  assert.equal(room.pub.challenges.size, 0)
  assert.equal(room.pub.race, null)
  assert.equal(apiCalls.length, 0)
})

test('an unanswered challenge expires for both sides', async () => {
  const { room, timers, ca, cb } = seatedTrio()
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, 800_000)
  timers[0]()
  assert.deepEqual(received(ca, 'pub_race_challenge_result'), [{ toSessionId: 'b', accepted: false, reason: 'expired' }])
  assert.deepEqual(received(cb, 'pub_race_challenge_cancelled'), [{ fromSessionId: 'a' }])
  assert.equal(room.pub.challenges.size, 0)
  await onRaceChallengeReply(room, cb, { fromSessionId: 'a', accept: true }, 815_000)
  assert.equal(room.pub.race, null)
})

test('invalid challenges: not on a stool, too far, race running, pending, cooldown, unknown target', async () => {
  const { room, a, b, ca, cb, cc } = seatedTrio()
  const codes = (client: FakeClient) => received(client, 'pub_error').map((e) => e.code)
  const t0 = 900_000

  onRaceChallenge(room, ca, { targetSessionId: 'c' }, t0)
  assert.deepEqual(codes(ca), ['challenge_too_far'])
  onRaceChallenge(room, ca, { targetSessionId: 'nobody' }, t0)
  onRaceChallenge(room, ca, { targetSessionId: 'a' }, t0)
  assert.deepEqual(codes(ca).slice(1), ['challenge_target_unavailable', 'challenge_target_unavailable'])
  b.y += 3
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, t0)
  assert.equal(codes(ca).at(-1), 'challenge_too_far')
  b.y -= 3

  onStand(room, cb)
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, t0)
  assert.equal(codes(ca).at(-1), 'challenge_target_unavailable')
  onRaceChallenge(room, cb, { targetSessionId: 'a' }, t0)
  assert.deepEqual(codes(cb), ['challenge_not_on_stool'])
  onSit(room, cb, { seatId: 'stool_02' })

  onRaceChallenge(room, ca, { targetSessionId: 'b' }, t0)
  assert.equal(room.pub.challenges.size, 1)
  onRaceChallenge(room, cb, { targetSessionId: 'a' }, t0 + 100)
  assert.equal(codes(cb).at(-1), 'challenge_pending')
  await onRaceChallengeReply(room, cb, { fromSessionId: 'a', accept: false }, t0 + 200)
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, t0 + 1000)
  assert.equal(codes(ca).at(-1), 'challenge_cooldown')
  assert.equal(room.pub.challenges.size, 0)

  await onRaceOpen(room, cc, t0 + 2000)
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, t0 + 6000)
  assert.equal(codes(ca).at(-1), 'race_in_progress')
  assert.equal(room.pub.challenges.size, 0)
  assert.equal(a.seatId, 'stool_01')
})

test('accepting when a race opened meanwhile answers busy', async () => {
  const { room, ca, cb, cc } = seatedTrio()
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, 1_000_000)
  await onRaceOpen(room, cc, 1_000_100)
  await onRaceChallengeReply(room, cb, { fromSessionId: 'a', accept: true }, 1_000_200)
  assert.deepEqual(received(ca, 'pub_race_challenge_result'), [{ toSessionId: 'b', accepted: false, reason: 'busy' }])
  assert.deepEqual(received(cb, 'pub_error').map((e) => e.code), ['race_in_progress'])
  assert.deepEqual([...room.pub.race!.racers.keys()], ['c'])
})

test('standing up cancels a pending challenge on either side', () => {
  const { room, ca, cb } = seatedTrio()
  onRaceChallenge(room, ca, { targetSessionId: 'b' }, 1_100_000)
  onStand(room, ca)
  assert.deepEqual(received(cb, 'pub_race_challenge_cancelled'), [{ fromSessionId: 'a' }])
  assert.equal(room.pub.challenges.size, 0)

  onSit(room, ca, { seatId: 'stool_01' })
  onRaceChallenge(room, cb, { targetSessionId: 'a' }, 1_100_000)
  onStand(room, ca)
  assert.deepEqual(received(cb, 'pub_race_challenge_result'), [{ toSessionId: 'a', accepted: false, reason: 'cancelled' }])
  assert.equal(room.pub.challenges.size, 0)
})
