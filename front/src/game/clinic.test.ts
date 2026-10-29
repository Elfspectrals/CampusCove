import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAimingAtNurse, lookAngles, recoveryProgress } from './clinic.ts'

const nurse: [number, number, number] = [0, 0, -2]
const eye = { x: 0, y: 1.6, z: 0 }

test('aiming at the nurse needs reach and the crosshair on her', () => {
  assert.equal(isAimingAtNurse(eye, { x: 0, y: 0, z: -1 }, nurse), true)
  assert.equal(isAimingAtNurse(eye, { x: 1, y: 0, z: 0 }, nurse), false)
  assert.equal(isAimingAtNurse({ x: 0, y: 1.6, z: 3 }, { x: 0, y: 0, z: -1 }, nurse), false)
  assert.equal(isAimingAtNurse({ x: 0, y: 5, z: 0 }, { x: 0, y: -1, z: -1 }, nurse), false)
})

test('look angles follow the camera convention (yaw 0 looks down -Z, positive pitch looks up)', () => {
  const ahead = lookAngles(eye, [0, 1.6, -5])
  assert.ok(Math.abs(ahead.yaw) < 1e-9)
  assert.ok(Math.abs(ahead.pitch) < 1e-9)
  const left = lookAngles(eye, [-5, 1.6, 0])
  assert.ok(Math.abs(left.yaw - Math.PI / 2) < 1e-9)
  assert.ok(lookAngles(eye, [0, 0.5, -1]).pitch < 0)
})

test('recovery progress is clamped between 0 and 1', () => {
  assert.equal(recoveryProgress(1000, 2000, 500), 0)
  assert.equal(recoveryProgress(1000, 2000, 2000), 0.5)
  assert.equal(recoveryProgress(1000, 2000, 9000), 1)
})
