import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  zones: [{ buildings: [{ kind: 'house', key: 'house_05', position: [20, 0.5, 0], rotationY: 0, interiorOffset: [0, 0.2, 0] }] }]
}
globalThis.fetch = async (url) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  return new Response(JSON.stringify({ cooked: { code: 'fish_cooked' } }))
}

const { loadWorld } = await import('./world.js')
const { onCook, onSurvivalMove } = await import('./survival.js')
await loadWorld()

function fakeClient() {
  const sent = []
  return { sessionId: 's1', sent, send: (type, payload) => sent.push({ type, payload }) }
}

function walkingPlayer(y) {
  return { y, fallPeakY: y, stats: { health: 100, hunger: 100, thirst: 100 }, knockedOutUntil: 0 }
}

function moveTo(client, player, y, distXZ) {
  const previousY = player.y
  player.y = y
  onSurvivalMove({}, client, player, previousY, distXZ)
}

test('walking down a 3.2 m stair does not hurt', () => {
  const client = fakeClient()
  const player = walkingPlayer(4.8)
  for (let y = 4.8 - 0.25; y > 1.6; y -= 0.25) moveTo(client, player, y, 0.4)
  moveTo(client, player, 1.6, 0.4)
  moveTo(client, player, 1.6, 0.4)
  assert.deepEqual(client.sent.filter((m) => m.type === 'survival_damage'), [])
})

test('dropping off a ledge still hurts', () => {
  const client = fakeClient()
  const player = walkingPlayer(7.6)
  moveTo(client, player, 1.6, 0.3)
  moveTo(client, player, 1.6, 0.4)
  assert.equal(client.sent.find((m) => m.type === 'survival_damage')?.payload.cause, 'fall')
})

function cookingRoom(cookerY) {
  return {
    housingUnits: [{ model_key: 'house_05', interior_bounds: { minX: -6, maxX: 6, minZ: -5, maxZ: 5 } }],
    houseFurniture: [{ model_key: 'house_05', objects: [{ objectKey: 'decor_stove_oven', x: 1, y: cookerY, z: 0 }] }],
    players: new Map(),
    forEachClient: () => undefined
  }
}

async function cookAt(room, eyeY) {
  const client = fakeClient()
  room.players.set(client.sessionId, { token: 't', x: 20, y: eyeY, z: 0, knockedOutUntil: 0 })
  await onCook(room, client, { code: 'fish_raw' })
  return client.sent
}

test('a stove on the ground floor cooks for a player standing next to it', async () => {
  const sent = await cookAt(cookingRoom(0), 0.7 + 1.6)
  assert.equal(sent[0]?.type, 'survival_cooked')
})

test('a stove on the ground floor is out of reach from the floor above', async () => {
  const sent = await cookAt(cookingRoom(0), 0.7 + 3 + 1.6)
  assert.equal(sent[0]?.payload.code, 'no_cooker')
})
