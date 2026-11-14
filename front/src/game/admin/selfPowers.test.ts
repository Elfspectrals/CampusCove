import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FLY_FAST_SPEED, FLY_SPEED, flyStep } from './selfPowers.ts'

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)

test('flying forward follows the look, up and down included', () => {
  const level = flyStep(0, 0, { forward: 1, right: 0, up: 0 }, false, 1)
  close(level.dx, 0)
  close(level.dy, 0)
  close(level.dz, -FLY_SPEED)
  const climbing = flyStep(0, Math.PI / 2, { forward: 1, right: 0, up: 0 }, false, 1)
  close(climbing.dy, FLY_SPEED)
  close(climbing.dz, 0)
})

test('strafing stays level, Space and Ctrl go straight up and down, Shift flies faster', () => {
  const strafe = flyStep(0, 0.6, { forward: 0, right: 1, up: 0 }, false, 1)
  close(strafe.dx, FLY_SPEED)
  close(strafe.dy, 0)
  close(flyStep(1, 0, { forward: 0, right: 0, up: -1 }, true, 0.5).dy, -FLY_FAST_SPEED / 2)
})
