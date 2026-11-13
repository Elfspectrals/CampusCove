import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatJailTime } from './jail.ts'

test('the time left reads as minutes and seconds', () => {
  assert.equal(formatJailTime(600), '10:00')
  assert.equal(formatJailTime(125), '2:05')
  assert.equal(formatJailTime(59), '0:59')
  assert.equal(formatJailTime(0), '0:00')
})
