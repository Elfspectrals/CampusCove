import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUNCH_DAMAGE, onPunch } from './punch.ts'
import { MAX_STAMINA, PUNCH_STAMINA_COST, WHIFF_STAMINA_COST } from './stamina.ts'
import type { ClientPayload, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = ReturnType<typeof fakeClient>
type FakeRoom = GameRoom & { clients: FakeClient[] }

function fakeClient(sessionId: string) {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, x: number, z: number, ry = 0): Player {
  return {
    sessionId,
    x,
    y: 1.6,
    z,
    ry,
    stats: { health: 100, hunger: 100, thirst: 100 },
    knockedOutUntil: 0,
    lastPunchAt: 0,
    stamina: MAX_STAMINA,
    staminaSpentAt: 0
  } as Player
}

function fakeRoom(attacker: Player, target: Player): FakeRoom {
  const clients = [fakeClient(attacker.sessionId), fakeClient(target.sessionId), fakeClient('bystander')]
  const players = new Map([[attacker.sessionId, attacker], [target.sessionId, target], ['bystander', fakePlayer('bystander', 30, 30)]])
  return {
    clients,
    players,
    housingUnits: [],
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null },
    forEachClient: (fn: (c: FakeClient) => void) => clients.forEach(fn),
    clock: { setTimeout: () => undefined }
  } as unknown as FakeRoom
}

function punch(room: FakeRoom, payload: ClientPayload) {
  onPunch(room, room.clients[0], payload)
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

test('a punch in reach and in front hurts the target and is seen by everyone', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 100 - PUNCH_DAMAGE)
  assert.deepEqual(received(room.clients[1], 'survival_damage'), [{ amount: PUNCH_DAMAGE, cause: 'punch' }])
  for (const client of room.clients) {
    assert.deepEqual(received(client, 'user_punched'), [{ sessionId: 'a', targetSessionId: 'b', dirX: 0, dirZ: -1 }])
  }
})

test('a target out of reach is a miss', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -4)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 100)
  assert.equal(received(room.clients[2], 'user_punched')[0].targetSessionId, null)
})

test('a target behind the attacker is a miss', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, 1.5)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 100)
})

test('punches faster than the cooldown are ignored', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 100 - PUNCH_DAMAGE)
  assert.equal(received(room.clients[2], 'user_punched').length, 1)
})

test('a knocked out player can neither punch nor be punched', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  target.knockedOutUntil = Date.now() + 5000
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 100)
  attacker.knockedOutUntil = Date.now() + 5000
  attacker.lastPunchAt = 0
  punch(room, { targetSessionId: 'b' })
  assert.equal(received(room.clients[2], 'user_punched').length, 1)
})

test('the last punch knocks the target out', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  target.stats!.health = PUNCH_DAMAGE
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 0)
  assert.equal(received(room.clients[1], 'survival_knocked_out').length, 1)
})

test('a forged payload does not hurt anyone', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'a' })
  attacker.lastPunchAt = 0
  punch(room, { targetSessionId: 42 })
  assert.equal(attacker.stats?.health, 100)
  assert.equal(target.stats?.health, 100)
})

test('a miss costs more stamina than a hit', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -4)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(attacker.stamina, MAX_STAMINA - WHIFF_STAMINA_COST)
})

test('a hit costs the punch stamina', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats!.health < 100, true)
  assert.equal(attacker.stamina, MAX_STAMINA - PUNCH_STAMINA_COST)
})

test('a tired player cannot punch and is told so', () => {
  const attacker = fakePlayer('a', 0, 0)
  const target = fakePlayer('b', 0, -1.5)
  attacker.stamina = 0
  attacker.lastPunchAt = Date.now() - 900
  attacker.staminaSpentAt = attacker.lastPunchAt
  const room = fakeRoom(attacker, target)
  punch(room, { targetSessionId: 'b' })
  assert.equal(target.stats?.health, 100)
  assert.equal(received(room.clients[2], 'user_punched').length, 0)
  const [refusal] = received(room.clients[0], 'punch_tired')
  assert.ok(refusal.stamina < PUNCH_STAMINA_COST)
  assert.equal(received(room.clients[1], 'punch_tired').length, 0)
})
