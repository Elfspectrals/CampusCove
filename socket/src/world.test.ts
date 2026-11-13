import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAdminDestinations, parseHouse } from './world.ts'

test('admin destinations from the manifest land at eye height and keep their yaw', () => {
  const out = parseAdminDestinations([{ key: 'cove_heights_gate', name: 'Cove Heights gate', position: [-247, 0, -158], yaw: 0.5 }])
  assert.deepEqual(out, [{ key: 'cove_heights_gate', name: 'Cove Heights gate', position: { x: -247, y: 1.6, z: -158 }, yaw: 0.5 }])
})

test('malformed admin destinations are skipped, a missing list is empty', () => {
  assert.deepEqual(parseAdminDestinations(undefined), [])
  assert.deepEqual(parseAdminDestinations([{ key: 'a', name: 'A' }, { name: 'B', position: [1, 0, 2] }, { key: 'c', name: 'C', position: [Number.NaN, 0, 2] }]), [])
  assert.equal(parseAdminDestinations([{ key: 'd', name: 'D', position: [1, 0, 2] }])[0].yaw, 0)
})

const tidewater = { kind: 'house', key: 'cove_home_b01', position: [-273.5, 0, -187], rotationY: 3.141593, interiorOffset: [0, 0.2, -1.405] }

test('a house with a back door parses it, one without leaves it undefined', () => {
  assert.deepEqual(parseHouse({ ...tidewater, backDoor: [-273.5, 1.25, -178.99] }).backDoor, { x: -273.5, y: 1.25, z: -178.99 })
  assert.equal(parseHouse(tidewater).backDoor, undefined)
})

test('a malformed back door throws', () => {
  assert.throws(() => parseHouse({ ...tidewater, backDoor: [-273.5, -178.99] }), /backDoor of cove_home_b01/)
})
