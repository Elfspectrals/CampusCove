import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTutorial } from './tutorial.ts'

test('a tutorial in progress or skipped keeps its step', () => {
  assert.deepEqual(parseTutorial({ status: 'active', step: 'pick_apples' }), { status: 'active', step: 'pick_apples' })
  assert.deepEqual(parseTutorial({ status: 'skipped', step: 'deposit_cash' }), { status: 'skipped', step: 'deposit_cash' })
})

test('no tutorial and a finished one carry no step', () => {
  assert.deepEqual(parseTutorial({ status: 'none', step: null }), { status: 'none' })
  assert.deepEqual(parseTutorial({ status: 'done', step: null }), { status: 'done' })
})

test('an unknown status or step is an error, not a default', () => {
  assert.throws(() => parseTutorial({ status: 'active', step: 'buy_food' }))
  assert.throws(() => parseTutorial({ status: 'active', step: null }))
  assert.throws(() => parseTutorial({ status: 'paused', step: 'pick_apples' }))
  assert.throws(() => parseTutorial(null))
})
