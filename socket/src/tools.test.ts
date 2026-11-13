import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_STAMINA } from './stamina.ts'
import type { GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = ReturnType<typeof fakeClient>
type FakeRoom = GameRoom & { clients: FakeClient[] }

const apiCalls: Array<{ path: string, body: any }> = []
const carried = new Map<string, number>()
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url).replace(/^.*\/api/, '')
  const body = init?.body ? JSON.parse(String(init.body)) : null
  apiCalls.push({ path, body })
  const uses = carried.get(body?.code)
  if (uses === undefined) return new Response(JSON.stringify({ code: 'tool_not_carried', message: 'You are not carrying that tool.' }), { status: 422 })
  if (path === '/tools/wear') {
    carried.set(body.code, uses - 1)
    if (uses - 1 === 0) carried.delete(body.code)
    return new Response(JSON.stringify({ code: body.code, uses_left: uses - 1 }))
  }
  return new Response(JSON.stringify({ code: body.code, uses_left: uses }))
}

const { onHold, TOOL_STATS } = await import('./tools.ts')
const { onPunch } = await import('./punch.ts')

function fakeClient(sessionId: string) {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, z: number): Player {
  return {
    sessionId,
    accountId: sessionId.charCodeAt(0),
    token: `token-${sessionId}`,
    x: 0,
    y: 1.6,
    z,
    ry: 0,
    stats: { health: 100, hunger: 100, thirst: 100 },
    knockedOutUntil: 0,
    lastPunchAt: 0,
    stamina: MAX_STAMINA,
    staminaSpentAt: 0,
    heldTool: null,
    wantedTool: null,
    holdSyncing: false,
    lastHoldCheckAt: 0,
    wantedStars: 0,
    wantedDecayMs: 0,
    wantedDirty: false,
    lastHitAt: new Map(),
    lastAssaultAt: new Map()
  } as unknown as Player
}

function fakeRoom(): FakeRoom {
  carried.clear()
  apiCalls.length = 0
  const players = [fakePlayer('a', 0), fakePlayer('b', -1.5)]
  const clients = players.map((p) => fakeClient(p.sessionId))
  return {
    clients,
    players: new Map(players.map((p) => [p.sessionId, p])),
    housingUnits: [],
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    forEachClient: (fn: (c: FakeClient) => void, except?: FakeClient) => clients.forEach((c) => c !== except && fn(c)),
    clock: { setTimeout: () => undefined }
  } as unknown as FakeRoom
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

async function hold(room: FakeRoom, code: unknown) {
  room.players.get('a')!.lastHoldCheckAt = 0
  onHold(room, room.clients[0], { code })
  await settle()
}

test('a carried tool goes in the hand and the other players see it', async () => {
  const room = fakeRoom()
  carried.set('tool_crowbar', 300)
  await hold(room, 'tool_crowbar')
  assert.equal(room.players.get('a')!.heldTool, 'tool_crowbar')
  assert.deepEqual(received(room.clients[1], 'user_held'), [{ sessionId: 'a', code: 'tool_crowbar' }])
  assert.deepEqual(received(room.clients[0], 'user_held'), [])
  assert.deepEqual(received(room.clients[0], 'tool_held'), [{ code: 'tool_crowbar', cooldownMs: 1700 }])
})

test('a tool the player does not carry stays out of the hand', async () => {
  const room = fakeRoom()
  await hold(room, 'tool_hammer')
  assert.equal(room.players.get('a')!.heldTool, null)
  assert.deepEqual(received(room.clients[1], 'user_held'), [])
})

test('an unknown code empties the hand without asking the API', async () => {
  const room = fakeRoom()
  carried.set('tool_wrench', 300)
  await hold(room, 'tool_wrench')
  apiCalls.length = 0
  await hold(room, 'house_key')
  assert.equal(room.players.get('a')!.heldTool, null)
  assert.deepEqual(apiCalls, [])
  assert.deepEqual(received(room.clients[1], 'user_held').at(-1), { sessionId: 'a', code: null })
  assert.deepEqual(received(room.clients[0], 'tool_held').at(-1), { code: null, cooldownMs: 800 })
})

test('a crowbar hit deals its damage, spends one use and keeps its slower cooldown', async () => {
  const room = fakeRoom()
  carried.set('tool_crowbar', 300)
  await hold(room, 'tool_crowbar')
  onPunch(room, room.clients[0], { targetSessionId: 'b' })
  await settle()
  assert.equal(room.players.get('b')!.stats?.health, 100 - TOOL_STATS.tool_crowbar.damage)
  assert.deepEqual(apiCalls.at(-1), { path: '/tools/wear', body: { code: 'tool_crowbar' } })
  assert.deepEqual(received(room.clients[0], 'tool_worn'), [{ code: 'tool_crowbar', usesLeft: 299 }])
  assert.equal(received(room.clients[1], 'user_punched')[0].tool, 'tool_crowbar')

  room.players.get('a')!.lastPunchAt = Date.now() - 1000
  onPunch(room, room.clients[0], { targetSessionId: 'b' })
  assert.equal(room.players.get('b')!.stats?.health, 100 - TOOL_STATS.tool_crowbar.damage)
})

test('a miss with a tool spends no use', async () => {
  const room = fakeRoom()
  carried.set('tool_hammer', 300)
  await hold(room, 'tool_hammer')
  room.players.get('b')!.z = -10
  onPunch(room, room.clients[0], { targetSessionId: 'b' })
  await settle()
  assert.equal(apiCalls.filter((c) => c.path === '/tools/wear').length, 0)
})

test('the last use breaks the tool and empties the hand for everyone', async () => {
  const room = fakeRoom()
  carried.set('tool_wrench', 1)
  await hold(room, 'tool_wrench')
  onPunch(room, room.clients[0], { targetSessionId: 'b' })
  await settle()
  assert.equal(room.players.get('a')!.heldTool, null)
  assert.deepEqual(received(room.clients[0], 'tool_worn'), [{ code: 'tool_wrench', usesLeft: 0 }])
  assert.deepEqual(received(room.clients[1], 'user_held').at(-1), { sessionId: 'a', code: null })
})
