import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aimedTarget } from './marketAim.ts'

const eye = { x: 0, y: 1.6, z: 0 }
const ahead = { x: 0, y: -0.4, z: -1 }
const lots = [
  { point: [-0.5, 1, -1.5] as [number, number, number], value: 'left' },
  { point: [0, 1, -1.5] as [number, number, number], value: 'middle' },
  { point: [0.5, 1, -1.5] as [number, number, number], value: 'right' },
]

test('the target closest to the crosshair wins, not the nearest one', () => {
  assert.equal(aimedTarget(eye, ahead, lots, 2.5, 0.2), 'middle')
  assert.equal(aimedTarget(eye, { x: 0.33, y: -0.4, z: -1 }, lots, 2.5, 0.2), 'right')
})

test('nothing is aimed beyond the reach or outside the aim cone', () => {
  assert.equal(aimedTarget(eye, ahead, lots, 1.4, 0.2), null)
  assert.equal(aimedTarget(eye, { x: 0, y: 0.5, z: -1 }, lots, 2.5, 0.2), null)
  assert.equal(aimedTarget(eye, ahead, [], 2.5, 0.2), null)
})
