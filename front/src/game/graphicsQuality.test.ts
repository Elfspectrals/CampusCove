import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextGraphicsQuality } from './graphicsQuality.ts'

test('the quality button goes low, medium, high and back to low', () => {
  assert.equal(nextGraphicsQuality('low'), 'medium')
  assert.equal(nextGraphicsQuality('medium'), 'high')
  assert.equal(nextGraphicsQuality('high'), 'low')
})
