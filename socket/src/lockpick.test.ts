import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  LOCKPICK_NOISE_RADIUS,
  PIN_SETTLE_MS,
  isHit,
  needlePosition,
  onDoorReinforce,
  onLockpickCancel,
  onLockpickPress,
  onLockpickStart,
  rollPin
} from './lockpick.ts'
import type { LockpickRoom } from './lockpick.ts'
import type { GameClient, HousingUnit, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

const apiCalls: Array<{ path: string, body: any }> = []
const crimeCalls: Array<{ path: string, body: any }> = []
let breakOnMiss = false
let doorPins = 3
let alarmOnSuccess = false
let alarmOnMiss = false
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url).replace(/^.*\/api/, '')
  const call = { path, body: init?.body ? JSON.parse(String(init.body)) : null }
  if (path === '/crimes' || path === '/wanted') {
    crimeCalls.push(call)
    return new Response(JSON.stringify({ ok: true }))
  }
  apiCalls.push(call)
  if (path === '/lockpicks/attempts') return new Response(JSON.stringify({ attempt_id: 7, pins: doorPins }))
  if (path.endsWith('/miss')) return new Response(JSON.stringify({ broke: breakOnMiss, alarm: alarmOnMiss }))
  if (path.endsWith('/success')) return new Response(JSON.stringify({ alarm: alarmOnSuccess }))
  return new Response(JSON.stringify({ ok: true }))
}

const PERIOD = 1200
const always0 = () => 0
const firstHitAfterSettle = Math.ceil(PIN_SETTLE_MS / PERIOD) * PERIOD

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type, payload) => void sent.push({ type, payload }) }
}

function setup({ x = 0, z = 2, locked = true, keyHolders = [] as number[] } = {}) {
  let now = 0
  const burglar = { sessionId: 's1', accountId: 1, token: 'token-s1', x, y: 1.6, z, knockedOutUntil: 0, lockpick: null, wantedStars: 0, wantedDecayMs: 0, wantedDirty: false, onDuty: false } as unknown as Player
  const neighbour = { sessionId: 's2', accountId: 2, token: 'token-s2', x: 0, y: 1.6, z: LOCKPICK_NOISE_RADIUS - 1 } as unknown as Player
  const farAway = { sessionId: 's3', accountId: 3, token: 'token-s3', x: 0, y: 1.6, z: LOCKPICK_NOISE_RADIUS + 1 } as unknown as Player
  const unit: HousingUnit = {
    public_id: 'house-1', template_key: 't', model_key: 'house_a', status: 'occupied', door_locked: locked,
    occupant_account_id: 9, key_holder_account_ids: keyHolders, pos_x: 0, pos_z: 0
  }
  const client = fakeClient('s1')
  const near = fakeClient('s2')
  const far = fakeClient('s3')
  const clients = [client, near, far]
  let polls = 0
  const room = {
    players: new Map([['s1', burglar], ['s2', neighbour], ['s3', farAway]]),
    housingUnits: [unit],
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.filter((c) => c !== except).forEach(fn),
    pollHousingUnits: async () => { polls += 1 }
  } as unknown as LockpickRoom
  apiCalls.length = 0
  crimeCalls.length = 0
  breakOnMiss = false
  doorPins = 3
  alarmOnSuccess = false
  alarmOnMiss = false
  return {
    burglar, client, near, far, room,
    clock: () => now,
    at: (t: number) => { now = t },
    polls: () => polls
  }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

test('the needle turns once per period', () => {
  const pin = { period: PERIOD, phase: 0.25, shownAt: 1000 }
  assert.equal(needlePosition(pin, 1000), 0.25)
  assert.equal(needlePosition(pin, 1600), 0.75)
  assert.equal(needlePosition(pin, 2200), 0.25)
})

test('a press hits while the needle is in the window, or was within the last 150 ms', () => {
  const pin = { period: PERIOD, phase: 0, shownAt: 0 }
  assert.equal(isHit(pin, 8400), true, 'needle on the mark')
  assert.equal(isHit(pin, 8340), true, 'just entering the window')
  assert.equal(isHit(pin, 8620), true, 'left the window less than 150 ms ago')
  assert.equal(isHit(pin, 8630), false, 'left the window too long ago')
  assert.equal(isHit(pin, 8320), false, 'early is never a hit')
  assert.equal(isHit(pin, 9000), false, 'opposite side')
})

test('pins are rolled on the server', () => {
  assert.deepEqual(rollPin(5, always0), { period: PERIOD, phase: 0, shownAt: 5 })
  assert.equal(rollPin(0, () => 0.999).period < 2000, true)
})

test('three hits open the door after the settle time of each pin', async () => {
  const { client, room, clock, at, polls } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  assert.deepEqual(apiCalls.shift(), { path: '/lockpicks/attempts', body: { unit_public_id: 'house-1' } })
  assert.equal(received(client, 'lockpick_pin')[0].readyInMs, PIN_SETTLE_MS)

  for (let pin = 1; pin <= 3; pin++) {
    at(pin * firstHitAfterSettle)
    await onLockpickPress(room, client, clock, always0)
  }

  assert.deepEqual(received(client, 'lockpick_result').map((r) => r.outcome), ['set', 'set', 'open'])
  assert.deepEqual(apiCalls, [{ path: '/lockpicks/attempts/7/success', body: null }])
  assert.equal(polls(), 1)
})

test('a reinforced door asks for the five pins Laravel gives', async () => {
  const { client, room, clock, at } = setup()
  doorPins = 5
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  assert.equal(received(client, 'lockpick_pin')[0].pins, 5)

  for (let pin = 1; pin <= 5; pin++) {
    at(pin * firstHitAfterSettle)
    await onLockpickPress(room, client, clock, always0)
  }

  assert.deepEqual(received(client, 'lockpick_result').map((r) => r.outcome), ['set', 'set', 'set', 'set', 'open'])
})

test('a press while the lock settles is refused and costs nothing', async () => {
  const { client, room, clock, at } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  apiCalls.length = 0
  at(PIN_SETTLE_MS - PERIOD)

  await onLockpickPress(room, client, clock, always0)

  assert.deepEqual(received(client, 'lockpick_error').map((e) => e.code), ['lockpick_settling'])
  assert.equal(apiCalls.length, 0)
})

test('a miss drops a set pin and asks Laravel for the break roll', async () => {
  const { burglar, client, room, clock, at } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  at(firstHitAfterSettle)
  await onLockpickPress(room, client, clock, always0)
  at(2 * firstHitAfterSettle + PERIOD / 2)
  apiCalls.length = 0

  await onLockpickPress(room, client, clock, always0)

  assert.deepEqual(apiCalls, [{ path: '/lockpicks/attempts/7/miss', body: { miss: 1 } }])
  assert.deepEqual(received(client, 'lockpick_result').map((r) => r.outcome), ['set', 'miss'])
  assert.equal(burglar.lockpick?.pinsSet, 0)
})

test('a broken lockpick ends the session', async () => {
  const { burglar, client, room, clock, at } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  breakOnMiss = true
  at(firstHitAfterSettle + PERIOD / 2)

  await onLockpickPress(room, client, clock, always0)

  assert.deepEqual(received(client, 'lockpick_result').map((r) => r.outcome), ['broke'])
  assert.equal(burglar.lockpick, null)
})

test('each press is heard within 12 m of the door, a miss as a scrape', async () => {
  const { client, near, far, room, clock, at } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  at(firstHitAfterSettle)
  await onLockpickPress(room, client, clock, always0)
  at(2 * firstHitAfterSettle + PERIOD / 2)
  await onLockpickPress(room, client, clock, always0)

  assert.deepEqual(received(near, 'door_sound'), [{ door: 'house_a', sound: 'pick_click' }, { door: 'house_a', sound: 'pick_scrape' }])
  assert.deepEqual(received(far, 'door_sound'), [])
})

test('walking away abandons the session', async () => {
  const { burglar, client, room, clock, at } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  burglar.z = 10
  at(firstHitAfterSettle)
  apiCalls.length = 0

  await onLockpickPress(room, client, clock, always0)
  await Promise.resolve()

  assert.deepEqual(received(client, 'lockpick_result'), [{ outcome: 'abandoned' }])
  assert.deepEqual(apiCalls, [{ path: '/lockpicks/attempts/7/abandon', body: null }])
  assert.equal(burglar.lockpick, null)
})

test('cancelling abandons the session in Laravel', async () => {
  const { burglar, client, room, clock } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  apiCalls.length = 0

  onLockpickCancel(room, client)
  await Promise.resolve()

  assert.deepEqual(apiCalls, [{ path: '/lockpicks/attempts/7/abandon', body: null }])
  assert.equal(burglar.lockpick, null)
})

test('a start is refused far from the door, on an unlocked door, or with the keys', async () => {
  const far = setup({ z: 10 })
  await onLockpickStart(far.room, far.client, { unitId: 'house-1' }, far.clock)
  const open = setup({ locked: false })
  await onLockpickStart(open.room, open.client, { unitId: 'house-1' }, open.clock)
  const holder = setup({ keyHolders: [1] })
  await onLockpickStart(holder.room, holder.client, { unitId: 'house-1' }, holder.clock)

  assert.deepEqual(received(far.client, 'lockpick_error').map((e) => e.code), ['lockpick_too_far'])
  assert.deepEqual(received(open.client, 'lockpick_error').map((e) => e.code), ['door_not_locked'])
  assert.deepEqual(received(holder.client, 'lockpick_error').map((e) => e.code), ['has_house_key'])
  assert.equal(apiCalls.length, 0)
})

test('fitting a reinforced lock at the door asks Laravel and reloads the houses', async () => {
  const { client, room, polls } = setup()
  await onDoorReinforce(room, client, { unitId: 'house-1' })

  assert.deepEqual(apiCalls, [{ path: '/lockpicks/reinforced-lock', body: { unit_public_id: 'house-1' } }])
  assert.deepEqual(received(client, 'door_reinforced'), [{ unitId: 'house-1' }])
  assert.equal(polls(), 1)
})

test('a lock is fitted only next to the door', async () => {
  const { client, room } = setup({ z: 10 })
  await onDoorReinforce(room, client, { unitId: 'house-1' })

  assert.deepEqual(received(client, 'door_reinforce_error').map((e) => e.code), ['lockpick_too_far'])
  assert.equal(apiCalls.length, 0)
})

test('an alarm that goes off is heard within 25 m and reaches the owner wherever they are', async () => {
  const { client, near, far, room, clock, at } = setup()
  const owner = { sessionId: 's4', accountId: 9, token: 'token-s4', x: 400, y: 1.6, z: 400 } as unknown as Player
  const ownerClient = fakeClient('s4')
  room.players.set('s4', owner)
  const everyone = [client, near, far, ownerClient]
  ;(room as unknown as { forEachClient: (fn: (c: GameClient) => void) => void }).forEachClient = (fn) => everyone.forEach(fn)
  alarmOnSuccess = true
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  for (let pin = 1; pin <= 3; pin++) {
    at(pin * firstHitAfterSettle)
    await onLockpickPress(room, client, clock, always0)
  }

  assert.deepEqual(received(near, 'alarm_siren'), [{ door: 'house_a' }])
  assert.deepEqual(received(far, 'alarm_siren'), [{ door: 'house_a' }])
  assert.deepEqual(received(ownerClient, 'alarm_siren'), [])
  assert.deepEqual(received(ownerClient, 'house_alarm'), [{ unitId: 'house-1' }])
})

function crimes() {
  return crimeCalls.filter((c) => c.path === '/crimes').map((c) => c.body.kind)
}

test('a start accepted by Laravel is a lockpick crime for the burglar', async () => {
  const { burglar, client, room, clock } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  assert.deepEqual(crimes(), ['lockpick'])
  assert.equal(burglar.wantedStars, 1)
})

test('a start refused before Laravel is no crime', async () => {
  const { burglar, client, room, clock } = setup({ z: 50 })
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  assert.deepEqual(crimes(), [])
  assert.equal(burglar.wantedStars, 0)
})

test('an alarm set off by the last pin adds an alarm crime', async () => {
  const { burglar, client, room, clock, at } = setup()
  alarmOnSuccess = true
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  for (let pin = 1; pin <= 3; pin++) {
    at(pin * firstHitAfterSettle)
    await onLockpickPress(room, client, clock, always0)
  }
  assert.deepEqual(crimes(), ['lockpick', 'alarm'])
  assert.equal(burglar.wantedStars, 3)
})

test('an alarm set off by a miss adds an alarm crime', async () => {
  const { burglar, client, room, clock, at } = setup()
  alarmOnMiss = true
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  at(firstHitAfterSettle + PERIOD / 2)
  await onLockpickPress(room, client, clock, always0)
  assert.deepEqual(received(client, 'lockpick_result').map((r) => r.outcome), ['miss'])
  assert.deepEqual(crimes(), ['lockpick', 'alarm'])
  assert.equal(burglar.wantedStars, 3)
})

test('a miss without an alarm adds no crime', async () => {
  const { client, room, clock, at } = setup()
  await onLockpickStart(room, client, { unitId: 'house-1' }, clock, always0)
  at(firstHitAfterSettle + PERIOD / 2)
  await onLockpickPress(room, client, clock, always0)
  assert.deepEqual(crimes(), ['lockpick'])
})
