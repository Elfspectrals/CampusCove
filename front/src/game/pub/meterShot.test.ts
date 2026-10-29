import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SHOT_COUNT, shotLayout, shotsScore } from './meterShot.ts'

test('the shot order is a permutation of the ten glasses, fixed by the seed', () => {
  const order = shotLayout(21)
  assert.equal(order.length, SHOT_COUNT)
  assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: SHOT_COUNT }, (_, i) => i))
  assert.deepEqual(shotLayout(21), order)
  assert.notDeepEqual(shotLayout(22), order)
})

test('the coins mirror the reward tiers of POST /pub/reward', () => {
  assert.deepEqual(shotsScore(1500), { coins: 30 })
  assert.deepEqual(shotsScore(5999), { coins: 30 })
  assert.deepEqual(shotsScore(6000), { coins: 15 })
  assert.deepEqual(shotsScore(8999), { coins: 15 })
  assert.deepEqual(shotsScore(9000), { coins: 0 })
  assert.deepEqual(shotsScore(20000), { coins: 0 })
})
