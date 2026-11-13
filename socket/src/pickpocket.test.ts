import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface ApiCall { path: string, method: string, body: any }
interface Answer { status: number, body: object }

const apiCalls: ApiCall[] = []
const answers = new Map<string, Answer>()
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url).replace(/^.*\/api/, '')
  apiCalls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
  const answer = answers.get(path) ?? { status: 200, body: {} }
  return new Response(JSON.stringify(answer.body), { status: answer.status })
}

const {
  PICKPOCKET_CONE_DEG,
  PICKPOCKET_GAME_MS,
  PICKPOCKET_HALF_SWEEP_MS,
  PICKPOCKET_LAG_ALLOWANCE_MS,
  PICKPOCKET_LOOT_MS,
  PICKPOCKET_MISSING_DELAY_MS,
  PICKPOCKET_REACH,
  WITNESS_CONE_DEG,
  WITNESS_REACH
} = await import('./policeConstants.ts')
const {
  behindVictim,
  cursorAt,
  leavePickpocket,
  onPickpocketMove,
  onPickpocketStart,
  onPickpocketStop,
  onPickpocketTake,
  pickpocketRefusal,
  rollWindows,
  sees,
  stopHits
} = await import('./pickpocket.ts')
const { createPlayer } = await import('./players.ts')

const LOOT = [{ code: 'food_sandwich', name: 'Club Sandwich', kind: 'consumable', quantity: 3, preview_image: null }]

function setup() {
  const players = new Map<string, Player>()
  const clients: FakeClient[] = []
  const timers: { fn: () => void, ms: number }[] = []
  const room = {
    players,
    clients,
    cashBags: new Map(),
    housingUnits: [],
    clock: { setTimeout: (fn: () => void, ms: number) => void timers.push({ fn, ms }) },
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.forEach((c) => {
      if (c.sessionId !== except?.sessionId) fn(c)
    }),
    broadcastMove: () => undefined
  }
  const join = (sessionId: string, accountId: number, extra: Partial<Player> = {}) => {
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
    const player = Object.assign(
      createPlayer({ sessionId, auth: { accountId, pseudo: sessionId, token: `token-${sessionId}` } } as any, {}, 0, { x: 0, y: 1.6, z: 0 }),
      { stats: { health: 100, hunger: 100, thirst: 100 }, ry: 0 },
      extra
    )
    players.set(sessionId, player)
    clients.push(client)
    return { player, client }
  }
  apiCalls.length = 0
  answers.clear()
  answers.set('/pickpocket/attempts', { status: 201, body: { attempt: { id: 7 } } })
  answers.set('/pickpocket/attempts/7/outcome', { status: 200, body: { loot: LOOT } })
  answers.set('/pickpocket/attempts/7/take', { status: 200, body: { taken: { code: 'food_sandwich', name: 'Club Sandwich', quantity: 3 } } })
  const thief = join('thief', 1, { z: 1 })
  const victim = join('victim', 2)
  return { room: room as any, join, timers, thief, victim }
}

const sentOf = (client: FakeClient, type: string) => client.sent.filter((m) => m.type === type).map((m) => m.payload)
const callsTo = (path: string) => apiCalls.filter((c) => c.path === path)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const middle = () => 0.5

async function started(ctx: ReturnType<typeof setup>) {
  onPickpocketStart(ctx.room, ctx.thief.client, { targetSessionId: 'victim' }, Date.now(), middle)
  await flush()
  const game = ctx.thief.player.pickpocket
  assert.equal(game?.phase, 'playing')
  return game.phase === 'playing' ? game.startedAt : 0
}

async function succeeded(ctx: ReturnType<typeof setup>) {
  const startedAt = await started(ctx)
  for (const at of [400, 1200, 2000]) onPickpocketStop(ctx.room, ctx.thief.client, startedAt + at)
  await flush()
}

test('the thief must stand within 1.5 m in the 60 degree cone behind the victim', () => {
  const { room, thief, victim } = setup()
  assert.equal(PICKPOCKET_REACH, 1.5)
  assert.equal(PICKPOCKET_CONE_DEG, 60)
  const at = (dist: number, deg: number) => Object.assign(thief.player, { x: Math.sin(deg * Math.PI / 180) * dist, z: Math.cos(deg * Math.PI / 180) * dist })

  at(1.5, 0)
  assert.equal(behindVictim(room, thief.player, victim.player), true)
  at(1.51, 0)
  assert.equal(behindVictim(room, thief.player, victim.player), false)
  at(1, 29)
  assert.equal(behindVictim(room, thief.player, victim.player), true)
  at(1, 31)
  assert.equal(behindVictim(room, thief.player, victim.player), false)
  at(1, 180)
  assert.equal(behindVictim(room, thief.player, victim.player), false)
  at(1, 0)
  victim.player.ry = Math.PI
  assert.equal(behindVictim(room, thief.player, victim.player), false)
  victim.player.ry = 0
  thief.player.y = victim.player.y + 1.1
  assert.equal(behindVictim(room, thief.player, victim.player), false)
})

test('the cursor sweeps 0 to 1 and back on the server clock', () => {
  assert.equal(PICKPOCKET_HALF_SWEEP_MS, 800)
  assert.equal(cursorAt(0), 0)
  assert.equal(cursorAt(400), 0.5)
  assert.equal(cursorAt(800), 1)
  assert.equal(cursorAt(1200), 0.5)
  assert.equal(cursorAt(1600), 0)
})

test('a stop is judged on the server clock, late by at most the network allowance, never early', () => {
  assert.equal(PICKPOCKET_LAG_ALLOWANCE_MS, 120)
  const window = { center: 0.5, width: 0.1 }
  assert.equal(stopHits(window, 400), true)
  assert.equal(stopHits(window, 440 + PICKPOCKET_LAG_ALLOWANCE_MS), true)
  assert.equal(stopHits(window, 441 + PICKPOCKET_LAG_ALLOWANCE_MS), false)
  assert.equal(stopHits(window, 359), false)
  assert.equal(stopHits({ center: 0.95, width: 0.08 }, 850), true)
})

test('three windows shrink and stay inside the gauge', () => {
  const low = rollWindows(() => 0)
  const high = rollWindows(() => 0.999999)
  assert.deepEqual(low.map((w) => w.width), [0.15, 0.11, 0.08])
  for (const w of [...low, ...high]) {
    assert.ok(w.center - w.width / 2 >= 0.05 - 1e-9)
    assert.ok(w.center + w.width / 2 <= 0.95 + 1e-9)
  }
})

test('three good stops succeed; with no witness, no star and the victim learns what is missing 30 s later without a name', async () => {
  const ctx = setup()
  const startedAt = await started(ctx)
  assert.deepEqual(callsTo('/pickpocket/attempts')[0].body, { victim_account_id: 2 })
  const start = sentOf(ctx.thief.client, 'pickpocket_started')[0]
  assert.equal(start.windows.length, 3)
  assert.equal(start.durationMs, PICKPOCKET_GAME_MS)
  assert.equal(sentOf(ctx.victim.client, 'pickpocket_started').length, 0)

  for (const at of [400, 1200, 2000]) onPickpocketStop(ctx.room, ctx.thief.client, startedAt + at)
  await flush()

  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_progress'), [{ stops: 1 }, { stops: 2 }, { stops: 3 }])
  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_succeeded'), [{ witnessed: false }])
  assert.equal(ctx.thief.player.wantedStars, 0)
  assert.equal(callsTo('/crimes').length, 0)
  assert.equal(sentOf(ctx.victim.client, 'pickpocket_alert').length, 0)
  assert.deepEqual(callsTo('/pickpocket/attempts/7/outcome')[0].body, { outcome: 'succeeded' })
  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_loot'), [{
    items: [{ code: 'food_sandwich', name: 'Club Sandwich', kind: 'consumable', quantity: 3, previewImage: null }],
    durationMs: PICKPOCKET_LOOT_MS
  }])

  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'food_sandwich' })
  await flush()
  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_taken'), [{ code: 'food_sandwich', name: 'Club Sandwich', quantity: 3 }])
  assert.equal(ctx.thief.player.pickpocket, null)
  assert.equal(sentOf(ctx.victim.client, 'pickpocket_missing').length, 0)
  const missing = ctx.timers.find((t) => t.ms === PICKPOCKET_MISSING_DELAY_MS)!
  missing.fn()
  assert.deepEqual(sentOf(ctx.victim.client, 'pickpocket_missing'), [{ name: 'Club Sandwich', quantity: 3, thiefPseudo: null }])
})

test('a choice sent twice is forwarded once', async () => {
  const ctx = setup()
  await succeeded(ctx)
  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'food_sandwich' })
  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'food_sandwich' })
  await flush()
  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'food_sandwich' })
  await flush()
  assert.equal(callsTo('/pickpocket/attempts/7/take').length, 1)
})

test('only an item of the list can be taken, and only within 5 s', async () => {
  const ctx = setup()
  await succeeded(ctx)
  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'house_key' })
  onPickpocketTake(ctx.room, ctx.thief.client, { code: 42 })
  await flush()
  assert.equal(callsTo('/pickpocket/attempts/7/take').length, 0)

  ctx.timers.find((t) => t.ms === PICKPOCKET_LOOT_MS + PICKPOCKET_LAG_ALLOWANCE_MS)!.fn()
  assert.equal(sentOf(ctx.thief.client, 'pickpocket_loot_closed').length, 1)
  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'food_sandwich' })
  await flush()
  assert.equal(callsTo('/pickpocket/attempts/7/take').length, 0)
})

test('a missed stop fails: one star, the victim gets the thief name, the attempt is closed', async () => {
  const ctx = setup()
  const startedAt = await started(ctx)
  onPickpocketStop(ctx.room, ctx.thief.client, startedAt + 100)
  await flush()

  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_failed'), [{ reason: 'missed' }])
  assert.equal(ctx.thief.player.pickpocket, null)
  assert.equal(ctx.thief.player.wantedStars, 1)
  assert.deepEqual(callsTo('/crimes')[0].body, { kind: 'pickpocket_failed', stars: 1, victim_account_id: 2 })
  assert.deepEqual(sentOf(ctx.victim.client, 'pickpocket_alert'), [{ kind: 'failed', thiefSessionId: 'thief', thiefPseudo: 'thief', victimPseudo: 'victim' }])
  assert.deepEqual(callsTo('/pickpocket/attempts/7/outcome')[0].body, { outcome: 'failed' })
})

test('leaving the cone during the game fails at once, whoever moved', async () => {
  const ctx = setup()
  await started(ctx)
  ctx.victim.player.ry = Math.PI / 2
  onPickpocketMove(ctx.room, ctx.victim.player)
  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_failed'), [{ reason: 'out_of_position' }])
  assert.equal(ctx.thief.player.wantedStars, 1)

  const again = setup()
  await started(again)
  again.thief.player.z = 1.6
  onPickpocketMove(again.room, again.thief.player)
  assert.deepEqual(sentOf(again.thief.client, 'pickpocket_failed'), [{ reason: 'out_of_position' }])
})

test('staying behind the victim while both move keeps the game going', async () => {
  const ctx = setup()
  await started(ctx)
  for (let step = 1; step <= 10; step++) {
    ctx.victim.player.z = -0.3 * step
    onPickpocketMove(ctx.room, ctx.victim.player)
    ctx.thief.player.z = 1 - 0.3 * step
    onPickpocketMove(ctx.room, ctx.thief.player)
  }
  assert.equal(ctx.thief.player.pickpocket?.phase, 'playing')
})

test('the server ends a game that runs past its time', async () => {
  const ctx = setup()
  const startedAt = await started(ctx)
  const timeout = ctx.timers.find((t) => t.ms === PICKPOCKET_GAME_MS + PICKPOCKET_LAG_ALLOWANCE_MS)!
  timeout.fn()
  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_failed'), [{ reason: 'timeout' }])

  const late = setup()
  const lateStart = await started(late)
  onPickpocketStop(late.room, late.thief.client, lateStart + PICKPOCKET_GAME_MS + PICKPOCKET_LAG_ALLOWANCE_MS + 1)
  assert.deepEqual(sentOf(late.thief.client, 'pickpocket_failed'), [{ reason: 'timeout' }])
  assert.ok(startedAt > 0)
})

test('a witness within 8 m looking at the thief makes it seen: two stars, names for victim and witnesses', async () => {
  const ctx = setup()
  const witness = ctx.join('witness', 3, { x: 0, z: 7, ry: 0 })
  const lookingAway = ctx.join('away', 4, { x: 0, z: -5, ry: 0 })
  const tooFar = ctx.join('far', 5, { x: 0, z: 9.1, ry: 0 })
  await succeeded(ctx)

  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_succeeded'), [{ witnessed: true }])
  assert.equal(ctx.thief.player.wantedStars, 2)
  assert.deepEqual(callsTo('/crimes')[0].body, { kind: 'pickpocket_seen', stars: 2, victim_account_id: 2 })
  const seen = { thiefSessionId: 'thief', thiefPseudo: 'thief', victimPseudo: 'victim' }
  assert.deepEqual(sentOf(ctx.victim.client, 'pickpocket_alert'), [{ kind: 'seen', ...seen }])
  assert.deepEqual(sentOf(witness.client, 'pickpocket_alert'), [{ kind: 'witness', ...seen }])
  assert.equal(sentOf(lookingAway.client, 'pickpocket_alert').length, 0)
  assert.equal(sentOf(tooFar.client, 'pickpocket_alert').length, 0)

  onPickpocketTake(ctx.room, ctx.thief.client, { code: 'food_sandwich' })
  await flush()
  assert.deepEqual(sentOf(ctx.victim.client, 'pickpocket_missing'), [{ name: 'Club Sandwich', quantity: 3, thiefPseudo: 'thief' }])
})

test('a witness sees within 8 m and a 120 degree cone in front of them', () => {
  const { room, join, thief } = setup()
  assert.equal(WITNESS_REACH, 8)
  assert.equal(WITNESS_CONE_DEG, 120)
  thief.player.z = 0
  const at = (dist: number, deg: number) => join(`w${dist}${deg}`, 9, { x: -Math.sin(deg * Math.PI / 180) * dist, z: Math.cos(deg * Math.PI / 180) * dist, ry: 0 }).player

  assert.equal(sees(room, at(8, 0), thief.player), true)
  assert.equal(sees(room, at(8.01, 0), thief.player), false)
  assert.equal(sees(room, at(4, 59), thief.player), true)
  assert.equal(sees(room, at(4, 61), thief.player), false)
})

test('a knocked-out player is no witness', async () => {
  const ctx = setup()
  ctx.join('witness', 3, { x: 0, z: 5, ry: 0, knockedOutUntil: Date.now() + 60_000 })
  await succeeded(ctx)
  assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_succeeded'), [{ witnessed: false }])
})

test('officers on duty, prisoners, handcuffed or knocked-out thieves cannot pick a pocket; nor can a prisoner be robbed', () => {
  const now = 100_000
  const { room, thief, victim } = setup()
  assert.equal(pickpocketRefusal(room, thief.player, victim.player, now), null)
  const cases: [Partial<Player>, Partial<Player>, string][] = [
    [{ onDuty: true }, {}, 'pickpocket_on_duty'],
    [{ jail: { kind: 'npc', stars: 1, msLeft: 1000, cellId: 'cell_01' } }, {}, 'pickpocket_jailed'],
    [{ cuffedBy: { officerSessionId: 'cop', since: now } }, {}, 'pickpocket_cuffed'],
    [{ knockedOutUntil: now + 1 }, {}, 'pickpocket_knocked_out'],
    [{}, { jail: { kind: 'officer', stars: 0, msLeft: 1000, cellId: 'cell_01' } }, 'pickpocket_victim_jailed']
  ]
  for (const [thiefState, victimState, code] of cases) {
    const ctx = setup()
    Object.assign(ctx.thief.player, thiefState)
    Object.assign(ctx.victim.player, victimState)
    assert.equal(pickpocketRefusal(ctx.room, ctx.thief.player, ctx.victim.player, now)?.code, code)
    onPickpocketStart(ctx.room, ctx.thief.client, { targetSessionId: 'victim' }, now)
    assert.equal(sentOf(ctx.thief.client, 'pickpocket_error')[0]?.code, code)
    assert.equal(ctx.thief.player.pickpocket, null)
    assert.equal(callsTo('/pickpocket/attempts').length, 0)
  }
})

test('the account age, 10 minute and 24 h limits come from Laravel and stop the attempt', async () => {
  for (const code of ['pickpocket_account_too_new', 'pickpocket_victim_too_new', 'pickpocket_cooldown', 'pickpocket_victim_recent']) {
    const ctx = setup()
    answers.set('/pickpocket/attempts', { status: code.endsWith('too_new') ? 422 : 409, body: { code, message: 'no' } })
    onPickpocketStart(ctx.room, ctx.thief.client, { targetSessionId: 'victim' })
    await flush()
    assert.deepEqual(sentOf(ctx.thief.client, 'pickpocket_error'), [{ code, message: 'no' }])
    assert.equal(ctx.thief.player.pickpocket, null)
    assert.equal(sentOf(ctx.thief.client, 'pickpocket_started').length, 0)
    assert.equal(ctx.thief.player.wantedStars, 0)
  }
})

test('one attempt at a time and at most one start a second', async () => {
  const ctx = setup()
  const now = Date.now()
  onPickpocketStart(ctx.room, ctx.thief.client, { targetSessionId: 'victim' }, now)
  onPickpocketStart(ctx.room, ctx.thief.client, { targetSessionId: 'victim' }, now + 2000)
  await flush()
  assert.equal(callsTo('/pickpocket/attempts').length, 1)

  const other = setup()
  other.thief.player.onDuty = true
  onPickpocketStart(other.room, other.thief.client, { targetSessionId: 'victim' }, now)
  other.thief.player.onDuty = false
  onPickpocketStart(other.room, other.thief.client, { targetSessionId: 'victim' }, now + 999)
  await flush()
  assert.equal(callsTo('/pickpocket/attempts').length, 0)
})

test('a thief who leaves mid-game fails with the star; a victim who leaves cancels without one', async () => {
  const ctx = setup()
  await started(ctx)
  ctx.room.players.delete('thief')
  leavePickpocket(ctx.room, ctx.thief.player)
  assert.equal(ctx.thief.player.wantedStars, 1)
  assert.equal(sentOf(ctx.victim.client, 'pickpocket_alert').length, 1)

  const other = setup()
  await started(other)
  other.room.players.delete('victim')
  leavePickpocket(other.room, other.victim.player)
  assert.deepEqual(sentOf(other.thief.client, 'pickpocket_failed'), [{ reason: 'cancelled' }])
  assert.equal(other.thief.player.wantedStars, 0)
})
