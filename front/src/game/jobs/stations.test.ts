import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { JobStation } from '../world/worldManifest.ts'
import { aimedStation, formatClock, salaryPerMinute, shiftDisplay, stationPose, workingEye, workingLook } from './stations.ts'

// Two Tech Hub desks as apply-jobs.mjs writes them (the building is turned by π: workers face +Z), and one upstairs.
const station = (id: string, x: number, floorY = 0.2): JobStation => ({
  id,
  job: 'dev',
  building: 'tech_hub',
  seat: [x, floorY + 0.51, 71.955],
  seatHeight: 0.51,
  yaw: 3.1416,
  lookAt: [x, floorY + 1, 72.905],
})
const DESKS = [station('station_dev_01', -14.8), station('station_dev_02', -18.2), station('station_dev_up', -14.8, 4.2)]
const FACING_DESKS = Math.PI
const eyeAt = (x: number, z: number, floorY = 0.2) => ({ x, y: floorY + 1.6, z })

test('the desk aimed at in reach on the same floor is picked', () => {
  assert.equal(aimedStation(eyeAt(-14.8, 71), FACING_DESKS, DESKS)?.id, 'station_dev_01')
  assert.equal(aimedStation(eyeAt(-18.4, 71), FACING_DESKS, DESKS)?.id, 'station_dev_02')
  assert.equal(aimedStation(eyeAt(-14.8, 71, 4.2), FACING_DESKS, DESKS)?.id, 'station_dev_up')
})

test('no desk when looking away, too far or between two desks out of reach', () => {
  assert.equal(aimedStation(eyeAt(-14.8, 71), 0, DESKS), null)
  assert.equal(aimedStation(eyeAt(-14.8, 68.5), FACING_DESKS, DESKS), null)
  assert.equal(aimedStation(eyeAt(-16.5, 69.5), FACING_DESKS, DESKS), null)
})

test('a worker sits on the chair facing the screen, eyes slightly down', () => {
  const desk = DESKS[0]!
  const eye = workingEye(desk)
  assert.deepEqual([eye.x, eye.z], [-14.8, 71.955])
  assert.ok(Math.abs(eye.y - (0.71 + 0.88)) < 1e-9)
  const look = workingLook(desk)
  // wrapped to (-π, π]: same direction as the station's 3.1416
  assert.ok(look.yaw > -Math.PI && look.yaw <= Math.PI)
  assert.ok(Math.abs(Math.sin(look.yaw) - Math.sin(3.1416)) < 1e-9 && Math.abs(Math.cos(look.yaw) - Math.cos(3.1416)) < 1e-9)
  assert.ok(look.pitch < 0 && look.pitch > -0.5, `${look.pitch}`)
  assert.deepEqual(stationPose(desk), { x: -14.8, y: 0.71, z: 71.955, yaw: 3.1416 })
})

test('the panel clock runs from the last server sync', () => {
  const clock = { periodMs: 60_000, workedMs: 61_000, syncedAt: 1000 }
  assert.deepEqual(shiftDisplay(clock, 1000), { workedMs: 61_000, nextPaymentInMs: 59_000 })
  assert.deepEqual(shiftDisplay(clock, 30_000), { workedMs: 90_000, nextPaymentInMs: 30_000 })
  assert.deepEqual(shiftDisplay(clock, 500), { workedMs: 61_000, nextPaymentInMs: 59_000 })
})

test('salary per minute and clock labels', () => {
  assert.equal(salaryPerMinute(10, 60_000), 10)
  assert.equal(salaryPerMinute(10, 30_000), 20)
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(247_400), '4:07')
  assert.equal(formatClock(3_729_000), '1:02:09')
})
