import { test } from 'node:test'
import assert from 'node:assert/strict'
import { npcPoseAt, turnTowards } from './npcMotion.ts'

test('a moving NPC glides from its start to the arrival at the server speed', () => {
  const state = { x: 0, y: 0, z: 0, move: { x: 5, y: 0, z: 0, ms: 2000 } }
  assert.deepEqual(npcPoseAt(state, 1000), { x: 2.5, y: 0, z: 0, speed: 2.5 })
  assert.deepEqual(npcPoseAt(state, 5000), { x: 5, y: 0, z: 0, speed: 0 })
  assert.deepEqual(npcPoseAt({ x: 1, y: 2, z: 3, move: null }, 100), { x: 1, y: 2, z: 3, speed: 0 })
})

test('turning takes the short way round', () => {
  assert.equal(turnTowards(0, 0.1, 1), 0.1)
  assert.equal(turnTowards(3, -3, 0.1), 3.1)
})
