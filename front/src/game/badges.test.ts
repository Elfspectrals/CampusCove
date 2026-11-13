import assert from 'node:assert/strict'
import { test } from 'node:test'
import { overHeadBadges, shownBadges } from './badges.ts'

test('known badges are shown in the order the account earned them', () => {
  assert.deepEqual(shownBadges(['new_citizen']), ['new_citizen'])
  assert.deepEqual(shownBadges([]), [])
})

test('a badge this build does not draw yet is left out, and a player without the field has none', () => {
  assert.deepEqual(shownBadges(['future_badge', 'new_citizen', 'constructor']), ['new_citizen'])
  assert.deepEqual(shownBadges(undefined), [])
})

test('New citizen is shown over the head', () => {
  assert.deepEqual(overHeadBadges(['new_citizen']), ['new_citizen'])
  assert.deepEqual(overHeadBadges([]), [])
})
