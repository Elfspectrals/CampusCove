import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NO_PASS_TOAST_GAP_MS, noPassToastDue, passValid } from './sportsPass.ts'

test('a pass is valid strictly before its end, never without one', () => {
  assert.equal(passValid(null, 1_000), false)
  assert.equal(passValid(2_000, 1_999), true)
  assert.equal(passValid(2_000, 2_000), false)
  assert.equal(passValid(2_000, 2_001), false)
})

test('a no_pass correction shows the toast at most once per gap, other corrections never', () => {
  assert.equal(noPassToastDue('no_pass', null, 10_000), true)
  assert.equal(noPassToastDue('no_pass', 10_000, 10_000 + NO_PASS_TOAST_GAP_MS - 1), false)
  assert.equal(noPassToastDue('no_pass', 10_000, 10_000 + NO_PASS_TOAST_GAP_MS), true)
  assert.equal(noPassToastDue('venue_reserved', null, 10_000), false)
  assert.equal(noPassToastDue(undefined, null, 10_000), false)
})
