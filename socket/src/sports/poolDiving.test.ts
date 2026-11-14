import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { GYM, clientOf, fakeRoom, installWorld, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const diving = await import('./poolDiving.ts')
await loadWorld()

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/diving.json', import.meta.url), 'utf8'))
const EDGE = { minX: -372, maxX: -371, minZ: -170, maxZ: -169 }
diving.useDivingRules(diving.parseDivingRules({ ...RAW, boards: [{ id: 'platform_5m', heightM: 5, kind: 'platform', edgeZone: EDGE }] }), 'sports_gym')
const NOW = 9_000_000

test('the ready diving rules parse: three boards up to the 5 m platform and three tricks', () => {
  const parsed = diving.parseDivingRules(RAW)
  assert.deepEqual(parsed.boards.map((b) => b.heightM), [1, 3, 5])
  assert.deepEqual(parsed.tricks, ['twist', 'somersault', 'cannonball'])
})

test('a jump counts only from the edge of the board, at its height, once per cooldown', async () => {
  const diver = await makePlayer(401, -371.5, -169.5)
  const watcher = await makePlayer(402, GYM.minX + 2, GYM.minZ + 2)
  const room = await fakeRoom([diver, watcher])
  diving.onPoolJump(room, clientOf(room, diver), { board: 'platform_5m' }, NOW)
  assert.equal(sentOf(clientOf(room, watcher), 'pool_dive').length, 0)
  diver.y = 5 + 1.6
  diving.onPoolJump(room, clientOf(room, diver), { board: 'nope' }, NOW)
  diving.onPoolJump(room, clientOf(room, diver), { board: 'platform_5m' }, NOW)
  diving.onPoolJump(room, clientOf(room, diver), { board: 'platform_5m' }, NOW + diving.DIVE_COOLDOWN_MS - 1)
  assert.equal(sentOf(clientOf(room, watcher), 'pool_dive').length, 1)
})

test('one listed trick per jump, only while the diver is in the air', async () => {
  const diver = await makePlayer(411, -371.5, -169.5)
  diver.y = 5 + 1.6
  const room = await fakeRoom([diver])
  diving.onPoolTrick(room, clientOf(room, diver), { trick: 'twist' }, NOW)
  diving.onPoolJump(room, clientOf(room, diver), { board: 'platform_5m' }, NOW)
  diving.onPoolTrick(room, clientOf(room, diver), { trick: 'moonwalk' }, NOW + 100)
  diving.onPoolTrick(room, clientOf(room, diver), { trick: 'somersault' }, NOW + 200)
  diving.onPoolTrick(room, clientOf(room, diver), { trick: 'twist' }, NOW + 300)
  assert.deepEqual(sentOf(clientOf(room, diver), 'pool_dive_trick'), [{ sessionId: diver.sessionId, name: diver.pseudo, board: 'platform_5m', trick: 'somersault' }])
  diving.onPoolJump(room, clientOf(room, diver), { board: 'platform_5m' }, NOW + 5000)
  diving.onPoolTrick(room, clientOf(room, diver), { trick: 'twist' }, NOW + 5000 + diving.airTimeMs(5) + 1)
  assert.equal(sentOf(clientOf(room, diver), 'pool_dive_trick').length, 1)
})
