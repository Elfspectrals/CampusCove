import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBadges } from './badges.ts'

test('the badges of the account pass through as codes', () => {
  assert.deepEqual(parseBadges([]), [])
  assert.deepEqual(parseBadges(['new_citizen']), ['new_citizen'])
  assert.deepEqual(parseBadges(['new_citizen', 'task:orchard:2']), ['new_citizen', 'task:orchard:2'])
})

test('a missing or malformed badge list is an error, not an empty list', () => {
  assert.throws(() => parseBadges(undefined))
  assert.throws(() => parseBadges('new_citizen'))
  assert.throws(() => parseBadges(['New Citizen']))
  assert.throws(() => parseBadges([42]))
})
