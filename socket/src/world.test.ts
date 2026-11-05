import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAdminDestinations } from './world.ts'

test('admin destinations from the manifest land at eye height and keep their yaw', () => {
  const out = parseAdminDestinations([{ key: 'cove_heights_gate', name: 'Cove Heights gate', position: [-247, 0, -158], yaw: 0.5 }])
  assert.deepEqual(out, [{ key: 'cove_heights_gate', name: 'Cove Heights gate', position: { x: -247, y: 1.6, z: -158 }, yaw: 0.5 }])
})

test('malformed admin destinations are skipped, a missing list is empty', () => {
  assert.deepEqual(parseAdminDestinations(undefined), [])
  assert.deepEqual(parseAdminDestinations([{ key: 'a', name: 'A' }, { name: 'B', position: [1, 0, 2] }, { key: 'c', name: 'C', position: [Number.NaN, 0, 2] }]), [])
  assert.equal(parseAdminDestinations([{ key: 'd', name: 'D', position: [1, 0, 2] }])[0].yaw, 0)
})
