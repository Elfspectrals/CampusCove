import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { PubSeat } from '../world/worldManifest.ts'
import { SEATED_EYE_ABOVE_SEAT, isStool, nearestFreeSeat, seatCameraYaw, seatedAvatarFeetY, seatedEye } from './seats.ts'

const seats: PubSeat[] = [
  { id: 'stool_01', kind: 'stool', position: [0, 0.72, 0], yaw: 0 },
  { id: 'stool_02', kind: 'stool', position: [1, 0.72, 0], yaw: 0 },
  { id: 'chair_01', kind: 'chair', position: [10, 0.45, 0], yaw: Math.PI },
]

test('nearest free seat within reach, occupied seats skipped', () => {
  assert.equal(nearestFreeSeat({ x: 0.2, y: 1.6, z: 0 }, seats, new Set())?.id, 'stool_01')
  assert.equal(nearestFreeSeat({ x: 0.2, y: 1.6, z: 0 }, seats, new Set(['stool_01']))?.id, 'stool_02')
  assert.equal(nearestFreeSeat({ x: 5, y: 1.6, z: 0 }, seats, new Set()), null)
  assert.equal(nearestFreeSeat({ x: 10, y: 1.6, z: 2.4 }, seats, new Set())?.id, 'chair_01')
  assert.equal(nearestFreeSeat({ x: 10, y: 1.6, z: 2.6 }, seats, new Set()), null)
})

test('a seat on another floor is out of reach (the cellar lounge under the bar)', () => {
  assert.equal(nearestFreeSeat({ x: 0.2, y: 1.6 - 3.2, z: 0 }, seats, new Set()), null)
  const cellar: PubSeat[] = [{ id: 'sofa_01', kind: 'sofa', position: [0, 0.62 - 3.2, 0], yaw: 0 }]
  assert.equal(nearestFreeSeat({ x: 0.2, y: 1.6 - 3.2, z: 0 }, cellar, new Set())?.id, 'sofa_01')
  assert.equal(nearestFreeSeat({ x: 0.2, y: 1.6, z: 0 }, cellar, new Set()), null)
})

test('seated eye is 0.88 m above the seat top', () => {
  assert.deepEqual(seatedEye(seats[0]!), { x: 0, y: 0.72 + SEATED_EYE_ABOVE_SEAT, z: 0 })
})

test('camera yaw keeps the seat direction, wrapped', () => {
  assert.equal(seatCameraYaw({ yaw: 0 }), 0)
  assert.ok(Math.abs(seatCameraYaw({ yaw: 3 * Math.PI }) - Math.PI) < 1e-9)
  assert.ok(Math.abs(seatCameraYaw({ yaw: -Math.PI / 2 }) + Math.PI / 2) < 1e-9)
})

test('a skin with the Sit clip has its feet 0.45 m under the seat, one without is lowered 0.45 m more', () => {
  assert.ok(Math.abs(seatedAvatarFeetY(0.72, true) - 0.27) < 1e-9)
  assert.ok(Math.abs(seatedAvatarFeetY(0.72, false) + 0.18) < 1e-9)
  assert.ok(Math.abs(seatedAvatarFeetY(0.45, true) - 0) < 1e-9)
})

test('only stools qualify for Drink Fast', () => {
  assert.equal(isStool(seats[0]!), true)
  assert.equal(isStool(seats[2]!), false)
})
