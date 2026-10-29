import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
  zones: [{ buildings: [{ kind: 'house', key: 'house_05', position: [20, 0.5, 0], rotationY: 0, interiorOffset: [0, 0.2, 0] }] }],
  clinic: {
    nurse: [40, 0.2, 0],
    pharmacy: [44, 0.2, 0],
    beds: [{ id: 'bed_01', position: [38, 1.8, 4], bed: [38, 0.7, 5], yaw: 0 }]
  }
}
globalThis.fetch = async (url) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  if (String(url).endsWith('/survival/clinic-heal')) return new Response(JSON.stringify({ billed: 30, balance_after: 70 }))
  if (String(url).endsWith('/survival')) return new Response(JSON.stringify({}))
  return new Response(JSON.stringify({ cooked: { code: 'fish_cooked' } }))
}

const { loadWorld } = await import('./world.js')
const { onClinicHeal, onCook, onSurvivalMove } = await import('./survival.js')
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

async function healAt(x, eyeY, health) {
  const client = fakeClient()
  const player = { token: 't', x, y: eyeY, z: 0, knockedOutUntil: 0, lastClinicHealAt: 0, stats: { health, hunger: 50, thirst: 50 } }
  await onClinicHeal({ players: new Map([[client.sessionId, player]]) }, client, undefined)
  return { sent: client.sent, player }
}

test('the nurse heals a hurt player standing at the desk to full health', async () => {
  const { sent, player } = await healAt(41, 0.2 + 1.6, 40)
  assert.deepEqual(sent[0], { type: 'clinic_healed', payload: { billed: 30, balanceAfter: 70 } })
  assert.equal(player.stats.health, 100)
})

test('the nurse is out of reach from afar or from another floor', async () => {
  assert.equal((await healAt(45, 0.2 + 1.6, 40)).sent[0]?.payload.code, 'no_nurse')
  assert.equal((await healAt(41, 0.2 + 3 + 1.6, 40)).sent[0]?.payload.code, 'no_nurse')
})

test('the nurse does not charge a player in full health', async () => {
  const { sent } = await healAt(41, 0.2 + 1.6, 100)
  assert.deepEqual(sent.map((m) => m.payload?.code), ['already_healthy'])
})
