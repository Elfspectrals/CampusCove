import assert from 'node:assert/strict'
import { afterEach, test, mock } from 'node:test'
import type { GameRoom, Player } from './types.ts'

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'
const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  zones: [{ buildings: [{ kind: 'house', key: 'house_05', position: [20, 0.5, 0], rotationY: 0, interiorOffset: [0, 0.2, 0] }] }]
}
globalThis.fetch = async () => new Response(JSON.stringify(manifest))
const { loadWorld } = await import('./world.ts')
await loadWorld()
const { CHAT_COOLDOWN_MS, CHAT_MAX_LENGTH, chatText, onChat } = await import('./chat.ts')
const { unitAt } = await import('./movement.ts')

interface Sent { type: string, payload: unknown }
type FakeClient = ReturnType<typeof fakeClient>

function fakeClient(sessionId: string) {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, x: number, z: number): Player {
  return { sessionId, x, y: 1.6, z, lastChatAt: 0 } as Player
}

function fakeRoom(players: Player[], housingUnits: unknown[] = []) {
  const clients = players.map((p) => fakeClient(p.sessionId))
  const room = {
    clients,
    players: new Map(players.map((p) => [p.sessionId, p])),
    housingUnits,
    forEachClient: (fn: (c: FakeClient) => void, except?: FakeClient) => clients.filter((c) => c !== except).forEach(fn)
  } as unknown as GameRoom
  return { room, clients }
}

function chats(client: FakeClient) {
  return client.sent.filter((m) => m.type === 'user_chat').map((m) => m.payload)
}

afterEach(() => mock.timers.reset())

test('chatText trims and collapses spaces', () => {
  assert.equal(chatText('  hello \n  world  '), 'hello world')
})

test('chatText refuses an empty or blank message', () => {
  assert.equal(chatText(''), null)
  assert.equal(chatText('   '), null)
})

test('chatText accepts exactly 120 characters and refuses 121', () => {
  assert.equal(chatText('a'.repeat(CHAT_MAX_LENGTH)), 'a'.repeat(CHAT_MAX_LENGTH))
  assert.equal(chatText('a'.repeat(CHAT_MAX_LENGTH + 1)), null)
})

test('chatText counts an emoji as one character', () => {
  assert.equal(chatText('🍺'.repeat(CHAT_MAX_LENGTH)), '🍺'.repeat(CHAT_MAX_LENGTH))
})

test('chatText refuses anything but a string', () => {
  assert.equal(chatText(42), null)
  assert.equal(chatText(undefined), null)
})

test('a player at 30 m hears the message, one at 30.01 m does not, the speaker gets no echo', () => {
  const { room, clients } = fakeRoom([fakePlayer('a', 0, 0), fakePlayer('b', 18, 24), fakePlayer('c', 30.01, 0)])
  onChat(room, clients[0], { text: 'hi' })
  assert.deepEqual(chats(clients[1]), [{ sessionId: 'a', text: 'hi' }])
  assert.deepEqual(chats(clients[2]), [])
  assert.deepEqual(chats(clients[0]), [])
})

test('a player inside a house does not hear one outside', () => {
  const house = { model_key: 'house_05', interior_bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 } }
  const { room, clients } = fakeRoom([fakePlayer('a', 20, 0), fakePlayer('b', 40, 0)], [house])
  assert.notEqual(unitAt(room.housingUnits, 20, 0), unitAt(room.housingUnits, 40, 0))
  onChat(room, clients[0], { text: 'hi' })
  assert.deepEqual(chats(clients[1]), [])
})

test('a second message before the 1 s cooldown is dropped, at 1 s it goes through', () => {
  mock.timers.enable({ apis: ['Date'], now: 10_000 })
  const { room, clients } = fakeRoom([fakePlayer('a', 0, 0), fakePlayer('b', 1, 0)])
  onChat(room, clients[0], { text: 'one' })
  mock.timers.tick(CHAT_COOLDOWN_MS - 1)
  onChat(room, clients[0], { text: 'two' })
  mock.timers.tick(1)
  onChat(room, clients[0], { text: 'three' })
  assert.deepEqual(chats(clients[1]).map((p) => (p as { text: string }).text), ['one', 'three'])
})
