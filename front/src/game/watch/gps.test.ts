import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasArrived, nearestAtm, placesByDistance, relativeBearingDegrees } from './gps.ts'
import { headingDegrees, type MapMarker } from '../world/minimap.ts'

const me = { x: 0, z: 0 }

test('arrival: within 8 m of the target on the ground, the edge included', () => {
  assert.equal(hasArrived({ x: 7.9, z: 0 }, me), true)
  assert.equal(hasArrived({ x: 0, z: 8 }, me), true)
  assert.equal(hasArrived({ x: 8.1, z: 0 }, me), false)
})

test('nearest ATM: the closest one, or none when the town has no ATM', () => {
  assert.deepEqual(nearestAtm([{ x: 50, z: 0 }, { x: 0, z: -10 }], me, 'ATM'), { id: 'atm', kind: 'atm', name: 'ATM', x: 0, z: -10 })
  assert.equal(nearestAtm([], me, 'ATM'), null)
})

test('places: the nearest ATM and the map markers, closest first', () => {
  const markers: MapMarker[] = [
    { id: 'pub', kind: 'work', name: 'Pub', x: 0, z: 300 },
    { id: 'cart', kind: 'store', name: 'GreenCart', x: 30, z: 40 },
  ]
  const places = placesByDistance(markers, { id: 'atm', kind: 'atm', name: 'ATM', x: 0, z: 84 }, me)
  assert.deepEqual(
    places.map((p) => [p.id, p.distance]),
    [
      ['cart', 50],
      ['atm', 84],
      ['pub', 300],
    ],
  )
  assert.equal(placesByDistance(markers, null, me).length, 2)
})

test('bearing: clockwise degrees from where the player looks (heading 0 faces north, -Z)', () => {
  assert.equal(relativeBearingDegrees({ x: 0, z: -10 }, { ...me, heading: 0 }), 0)
  assert.equal(relativeBearingDegrees({ x: 10, z: 0 }, { ...me, heading: 0 }), 90)
  assert.equal(relativeBearingDegrees({ x: 10, z: 0 }, { ...me, heading: headingDegrees(-Math.PI / 2) }), 0)
})
