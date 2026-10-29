import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FOV,
  MAX_FOV,
  MIN_FOV,
  cameraMotionScale,
  clampFov,
  createStepSmoother,
  parseComfort,
  verticalFovFor,
} from './comfort.ts'

function close(actual: number, expected: number, epsilon = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
}

test('the field of view stays in a comfortable range', () => {
  assert.equal(clampFov(10), MIN_FOV)
  assert.equal(clampFov(200), MAX_FOV)
  assert.equal(clampFov(Number.NaN), DEFAULT_FOV)
  assert.equal(clampFov(82.4), 82)
})

test('saved comfort settings are read defensively', () => {
  assert.deepEqual(parseComfort(null), { fov: DEFAULT_FOV, reduceCameraMotion: false })
  assert.deepEqual(parseComfort('not json'), { fov: DEFAULT_FOV, reduceCameraMotion: false })
  assert.deepEqual(parseComfort('{"fov":300,"reduceCameraMotion":true}'), { fov: MAX_FOV, reduceCameraMotion: true })
  assert.deepEqual(parseComfort('{"fov":"wide","reduceCameraMotion":"yes"}'), { fov: DEFAULT_FOV, reduceCameraMotion: false })
})

test('a wide window keeps the chosen vertical fov, a narrow one keeps the horizontal view', () => {
  assert.equal(verticalFovFor(80, 16 / 9), 80)
  assert.equal(verticalFovFor(80, 4 / 3), 80)
  const narrow = verticalFovFor(80, 2 / 3)
  assert.ok(narrow > 80 && narrow <= 100)
})

test('reduced camera motion removes shake, roll and the fov kick; roll is damped by default', () => {
  assert.deepEqual(cameraMotionScale(true), { shake: 0, roll: 0, fovKick: 0 })
  const normal = cameraMotionScale(false)
  assert.equal(normal.shake, 1)
  assert.ok(normal.roll < 1)
})

test('a stair step eases the camera instead of snapping it', () => {
  const smoother = createStepSmoother()
  const dt = 1 / 60
  close(smoother.update(1.6, dt), 1.6)
  const first = smoother.update(1.8, dt)
  assert.ok(first > 1.6 && first < 1.75, `camera jumped to ${first}`)
  let y = first
  for (let i = 0; i < 30; i++) y = smoother.update(1.8, dt)
  close(y, 1.8, 1e-3)
})

test('slopes and jumps are followed exactly', () => {
  const smoother = createStepSmoother()
  const dt = 1 / 60
  smoother.update(1.6, dt)
  // 6.5 m/s vertical: a jump take-off (JUMP_VELOCITY) or a steep slope
  close(smoother.update(1.6 + 6.5 * dt, dt), 1.6 + 6.5 * dt)
})

test('a teleport moves the camera at once', () => {
  const smoother = createStepSmoother()
  smoother.update(1.6, 1 / 60)
  close(smoother.update(5.6, 1 / 60), 5.6)
})
