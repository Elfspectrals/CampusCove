import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextGoal } from './taskProgress.ts'

const orchard = [100, 1000, 5000]

test('the next goal is the first tier above the counter', () => {
  assert.deepEqual(nextGoal(0, orchard), { tier: 1, target: 100 })
  assert.deepEqual(nextGoal(99, orchard), { tier: 1, target: 100 })
  assert.deepEqual(nextGoal(100, orchard), { tier: 2, target: 1000 })
  assert.deepEqual(nextGoal(340, orchard), { tier: 2, target: 1000 })
  assert.deepEqual(nextGoal(4999, orchard), { tier: 3, target: 5000 })
})

test('a task past its last tier has no next goal', () => {
  assert.equal(nextGoal(5000, orchard), null)
  assert.equal(nextGoal(6200, orchard), null)
})
