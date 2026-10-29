import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PUNCH_IMPACT_S } from './punch.ts'
import {
  HIT_STOP_S,
  advanceHitStop,
  cameraJolt,
  confirmsFromServer,
  easeOutBack,
  idleHitStop,
  punchKick,
  remoteHitTiming,
  scheduleHitStop,
} from './punchFeel.ts'

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`)

test('the punch kick peaks at impact and settles back to rest', () => {
  close(punchKick(0).pitch, 0)
  const peak = punchKick(PUNCH_IMPACT_S)
  close(peak.pitch, -0.02)
  close(peak.fov, -3)
  const returning = punchKick(PUNCH_IMPACT_S + 0.1)
  assert.ok(returning.fov < 0 && returning.fov > -3)
  close(punchKick(PUNCH_IMPACT_S + 0.2).fov, 0)
  close(punchKick(Infinity).pitch, 0)
})

test('a hit from the front tips the view up, a hit from behind tips it down', () => {
  const yaw = 0
  const pushedBack = cameraJolt(0, 1, yaw, 1)
  assert.ok(pushedBack.pitch > 0)
  close(pushedBack.roll, 0)
  assert.ok(cameraJolt(0, -1, yaw, 1).pitch < 0)
})

test('a hit from the left rolls the view to the right, relative to the yaw', () => {
  const pushedRight = cameraJolt(1, 0, 0, 1)
  assert.ok(pushedRight.roll < 0)
  close(pushedRight.pitch, 0)
  const facingWest = cameraJolt(0, -1, Math.PI / 2, 1)
  assert.ok(facingWest.roll < 0)
  close(facingWest.pitch, 0)
})

test('the jolt scales with its strength and ignores a zero direction', () => {
  close(cameraJolt(0, 2, 0, 0.5).pitch, cameraJolt(0, 1, 0, 1).pitch / 2)
  assert.deepEqual(cameraJolt(0, 0, 0, 1), { pitch: 0, roll: 0 })
})

test('a hit-stop runs until its delay, holds, then runs again', () => {
  const stop = idleHitStop()
  close(advanceHitStop(stop, 0.016), 0.016)
  scheduleHitStop(stop, 0.01, 0.05)
  close(advanceHitStop(stop, 0.016), 0.01)
  close(advanceHitStop(stop, 0.016), 0)
  close(advanceHitStop(stop, 0.016), 0)
  close(advanceHitStop(stop, 0.016), 0.004)
  close(advanceHitStop(stop, 0.016), 0.016)
})

test('my own hit lands on the target at my impact time, with a hit-stop', () => {
  assert.deepEqual(remoteHitTiming(false, 0.05), { delay: PUNCH_IMPACT_S, hitStop: 0 })
  const mine = remoteHitTiming(true, 0.05)
  close(mine.delay, PUNCH_IMPACT_S - 0.05)
  assert.equal(mine.hitStop, HIT_STOP_S)
  assert.equal(remoteHitTiming(true, 1).delay, 0)
})

test('the server confirms a hit only when it was not already predicted', () => {
  assert.equal(confirmsFromServer(true, true), false)
  assert.equal(confirmsFromServer(true, false), false)
  assert.equal(confirmsFromServer(false, true), true)
  assert.equal(confirmsFromServer(false, false), false)
  assert.equal(confirmsFromServer(null, true), true)
})

test('the overshoot ease pops past its size then lands on it', () => {
  close(easeOutBack(0), 0)
  assert.ok(easeOutBack(0.6) > 1)
  close(easeOutBack(1), 1)
  close(easeOutBack(3), 1)
})
