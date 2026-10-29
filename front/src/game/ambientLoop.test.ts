import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fadeTowards } from './ambientLoop.ts'

test('fades in and out at the given pace without overshooting', () => {
  assert.equal(fadeTowards(0, 1, 0.5, 2), 0.25)
  assert.equal(fadeTowards(0.9, 1, 0.5, 2), 1)
  assert.equal(fadeTowards(0.5, 0, 0.5, 2), 0.25)
  assert.equal(fadeTowards(0.1, 0, 0.5, 2), 0)
})
