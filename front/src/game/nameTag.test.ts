import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nameTagVisible } from './nameTag.ts'

test('shows the name of a player standing on you', () => {
  assert.equal(nameTagVisible(0, 0), true)
})

test('shows the name at exactly 25 m', () => {
  assert.equal(nameTagVisible(15, 20), true)
})

test('hides the name just past 25 m', () => {
  assert.equal(nameTagVisible(25.01, 0), false)
})
