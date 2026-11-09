import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fieldAt } from './farm.ts'

const fields = [
  { crop: 'corn' as const, minX: -40, maxX: -24, minZ: -194, maxZ: -162 },
  { crop: 'potato' as const, minX: -20, maxX: -5, minZ: -194, maxZ: -162 },
]

test('the field under the player is the one to pick, edges included', () => {
  assert.equal(fieldAt(fields, { x: -30, z: -170 }), 0)
  assert.equal(fieldAt(fields, { x: -40, z: -162 }), 0)
  assert.equal(fieldAt(fields, { x: -5, z: -194 }), 1)
})

test('between the fields or past an edge there is nothing to pick', () => {
  assert.equal(fieldAt(fields, { x: -22, z: -170 }), null)
  assert.equal(fieldAt(fields, { x: -30, z: -161.99 }), null)
  assert.equal(fieldAt([], { x: 0, z: 0 }), null)
})
