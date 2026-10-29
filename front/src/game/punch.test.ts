import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUNCH_REACH, createCameraShake, createKnockback, pickPunchTarget } from './punch.ts'

const feet = { x: 0, y: 0, z: 0 }
const north = { x: 0, z: -1 }

test('picks the player in front within reach', () => {
  const target = pickPunchTarget(feet, north, [
    { sessionId: 'behind', x: 0, feetY: 0, z: 1 },
    { sessionId: 'front', x: 0.3, feetY: 0, z: -1.2 },
    { sessionId: 'far', x: 0, feetY: 0, z: -(PUNCH_REACH + 0.5) },
  ])
  assert.equal(target, 'front')
})

test('prefers the player closest to the crosshair', () => {
  const target = pickPunchTarget(feet, north, [
    { sessionId: 'side', x: 0.9, feetY: 0, z: -1 },
    { sessionId: 'center', x: 0.1, feetY: 0, z: -1.5 },
  ])
  assert.equal(target, 'center')
})

test('ignores players on another floor', () => {
  assert.equal(pickPunchTarget(feet, north, [{ sessionId: 'upstairs', x: 0, feetY: 3, z: -1 }]), null)
})

test('the camera shake fades back to rest', () => {
  const shake = createCameraShake()
  shake.add(0.6)
  const first = shake.update(1 / 60)
  assert.ok(Math.abs(first.pitch) + Math.abs(first.roll) > 0)
  for (let i = 0; i < 120; i++) shake.update(1 / 60)
  assert.deepEqual(shake.update(1 / 60), { pitch: 0, roll: 0 })
})

test('a camera jolt kicks in at once then fades back to rest', () => {
  const shake = createCameraShake()
  shake.jolt(0.05, -0.06)
  const first = shake.update(0.03)
  assert.ok(Math.abs(first.pitch - 0.05) < 1e-9 && Math.abs(first.roll + 0.06) < 1e-9)
  const later = shake.update(0.1)
  assert.ok(later.pitch > 0 && later.pitch < first.pitch)
  for (let i = 0; i < 30; i++) shake.update(1 / 60)
  const rest = shake.update(1 / 60)
  assert.equal(Math.abs(rest.pitch) + Math.abs(rest.roll), 0)
})

test('a camera shake does not move while no time passes', () => {
  const shake = createCameraShake()
  shake.add(0.5)
  shake.jolt(0.05, 0)
  const moving = shake.update(1 / 60)
  assert.deepEqual(shake.update(0), moving)
})

test('a knockback travels its distance then stops', () => {
  const knockback = createKnockback()
  knockback.push(3, 4, 0.6)
  let x = 0
  let z = 0
  for (let i = 0; i < 120; i++) {
    const step = knockback.step(1 / 60)
    x += step.dx
    z += step.dz
  }
  assert.ok(Math.abs(Math.hypot(x, z) - 0.6) < 0.01)
  assert.ok(Math.abs(x / z - 3 / 4) < 1e-9)
})
