import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FRONT_DESK_REACH, LOCKER_REACH, atFrontDesk, atLockers, type PoliceStationLayout } from './policeStation.ts'

const station: PoliceStationLayout = {
  desk: [94.605, 0.2, 12],
  officer: [95.505, 0.2, 12],
  lockers: [93.005, 0.2, 1.5],
}
const EYE = 1.8

test('the front desk is in reach in front of the counter and beside the officer', () => {
  assert.equal(atFrontDesk(station, { x: 94.605 - FRONT_DESK_REACH + 0.001, y: EYE, z: 12 }), true)
  assert.equal(atFrontDesk(station, { x: 95.505, y: EYE, z: 12 + FRONT_DESK_REACH - 0.001 }), true)
})

test('the front desk is out of reach from the entrance hall or another floor', () => {
  assert.equal(atFrontDesk(station, { x: 94.605 - FRONT_DESK_REACH - 0.01, y: EYE, z: 12 }), false)
  assert.equal(atFrontDesk(station, { x: 94.605, y: EYE + 3, z: 12 }), false)
})

test('the lockers are in reach up to their reach only', () => {
  assert.equal(atLockers(station, { x: 93.005 + LOCKER_REACH - 0.001, y: EYE, z: 1.5 }), true)
  assert.equal(atLockers(station, { x: 93.005 + LOCKER_REACH + 0.01, y: EYE, z: 1.5 }), false)
  assert.equal(atLockers(station, { x: 94.605, y: EYE, z: 12 }), false)
})

test('the front reaches stay inside the socket reaches, so a prompt is never refused for distance', () => {
  assert.ok(FRONT_DESK_REACH < 3)
  assert.ok(LOCKER_REACH < 2.5)
})
