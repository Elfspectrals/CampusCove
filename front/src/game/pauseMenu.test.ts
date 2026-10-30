import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LOCK_RELEASE_ESCAPE_MS, isLockReleaseEscape } from './pauseMenu.ts'

test('the Esc that released the lock (created before the unlock) is ignored', () => {
  assert.equal(isLockReleaseEscape(990, 1000), true)
  assert.equal(isLockReleaseEscape(1000, 1000), true)
  assert.equal(isLockReleaseEscape(1000 + LOCK_RELEASE_ESCAPE_MS - 1, 1000), true)
})

test('a real second Esc, even spammed fast, toggles the menu', () => {
  assert.equal(isLockReleaseEscape(1000 + 100, 1000), false)
  assert.equal(isLockReleaseEscape(1000 + LOCK_RELEASE_ESCAPE_MS, 1000), false)
})
