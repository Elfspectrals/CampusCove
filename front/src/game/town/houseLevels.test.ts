import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STEP_UP, levelAt, parseHouseLayout, singleLevelLayout, surfaceHeight } from './houseLevels.ts'

const twoStoreys = parseHouseLayout({
  version: 1,
  key: 'house_05',
  levels: [
    { id: 'L0', y: 0, height: 2.8, rects: [{ minX: -5.9, maxX: 5.9, minZ: -4.6, maxZ: 5.0 }] },
    { id: 'L1', y: 3, height: 2.6, rects: [
      { minX: -4.7, maxX: 5.9, minZ: -4.6, maxZ: 5.0 },
      { minX: -5.9, maxX: -4.7, minZ: -4.6, maxZ: -0.6 },
    ] },
  ],
  stairs: [{ name: 'Stair_Main', minX: -5.9, maxX: -4.7, minZ: -0.6, maxZ: 4.0, y0: 0, y1: 3, rise: '-z' }],
}, 'house_05')

const STAIR_X = -5.3

test('the ground floor and the floor above are told apart by the feet height', () => {
  assert.equal(surfaceHeight(twoStoreys, 0, 0, 0), 0)
  assert.equal(surfaceHeight(twoStoreys, 0, 0, 3), 3)
})

test('the stair rises from its foot to its head along its rise axis', () => {
  assert.equal(surfaceHeight(twoStoreys, STAIR_X, 4.0, 0), 0)
  assert.ok(Math.abs(surfaceHeight(twoStoreys, STAIR_X, 1.7, 1.4)! - 1.5) < 1e-9)
  assert.equal(surfaceHeight(twoStoreys, STAIR_X, -0.6, 2.9), 3)
  assert.equal(surfaceHeight(twoStoreys, STAIR_X, 6, 0), null)
})

test('walking up the stair in small steps reaches the floor above, and back down', () => {
  let feet = 0
  for (let z = 4.0; z >= -2; z -= 0.1) feet = surfaceHeight(twoStoreys, STAIR_X, z, feet)!
  assert.equal(feet, 3)
  for (let z = -2; z <= 4.5; z += 0.1) feet = surfaceHeight(twoStoreys, STAIR_X, z, feet)!
  assert.equal(feet, 0)
})

test('a surface higher than the step-up is out of reach, the lowest one is used from below', () => {
  assert.equal(surfaceHeight(twoStoreys, 0, 0, 3 - STEP_UP - 0.1), 0)
  assert.equal(surfaceHeight(twoStoreys, 0, 0, -2), 0)
})

test('outside every rect there is no surface', () => {
  assert.equal(surfaceHeight(twoStoreys, 7, 0, 0), null)
})

test('the level under a point is the highest one below it', () => {
  assert.equal(levelAt(twoStoreys, 0, 0, 0, 0.01)?.id, 'L0')
  assert.equal(levelAt(twoStoreys, 0, 0, 4, 0.01)?.id, 'L1')
  assert.equal(levelAt(twoStoreys, STAIR_X, 2, 4, 0.01)?.id, 'L0')
  assert.equal(levelAt(twoStoreys, 0, 0, -0.5, 0.01), null)
})

test('a house without a layout is one level over its collision bounds', () => {
  const layout = singleLevelLayout('house_01', { minX: -4, maxX: 4, minZ: -4, maxZ: 5 }, 3)
  assert.deepEqual(layout.stairs, [])
  assert.equal(surfaceHeight(layout, 1, 1, 0), 0)
  assert.equal(levelAt(layout, 1, 1, 2.5, 0.01)?.height, 3)
})

test('an invalid layout is rejected', () => {
  assert.throws(() => parseHouseLayout({ version: 1, levels: [] }, 'house_02'), /no levels/)
  assert.throws(() => parseHouseLayout({
    version: 1,
    levels: [{ id: 'L0', y: 0, height: 3, rects: [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }] }],
    stairs: [{ minX: 0, maxX: 1, minZ: 0, maxZ: 1, y0: 0, y1: 3, rise: 'up' }],
  }, 'house_02'), /invalid rise/)
})
