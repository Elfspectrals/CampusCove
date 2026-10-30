import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STEP_UP, capsuleLift, levelAt, parseHouseLayout, singleLevelLayout, surfaceHeight } from './houseLevels.ts'

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

// The pub: the ground floor with a hole for the cellar stair, a basement 3.2 m below, a stair going down along -z.
const pubWithCellar = parseHouseLayout({
  version: 1,
  key: 'pub',
  levels: [
    { id: 'L0', y: 0, height: 3.4, rects: [
      { minX: -10, maxX: 10, minZ: -10, maxZ: 5 },
      { minX: -10, maxX: 3.4, minZ: -16, maxZ: -10 },
      { minX: 4.6, maxX: 10, minZ: -16, maxZ: -10 },
    ] },
    { id: 'B1', y: -3.2, height: 2.6, rects: [{ minX: -2, maxX: 10, minZ: -22, maxZ: -14 }] },
  ],
  stairs: [{ name: 'Stair_Cellar', minX: 3.4, maxX: 4.6, minZ: -16, maxZ: -10, y0: 0, y1: -3.2, rise: '-z' }],
}, 'pub')

const CELLAR_X = 4

test('a level below the entrance floor is told apart by the feet height', () => {
  assert.equal(surfaceHeight(pubWithCellar, 0, -15, 0), 0)
  assert.equal(surfaceHeight(pubWithCellar, 0, -15, -3.2), -3.2)
  assert.equal(surfaceHeight(pubWithCellar, 0, -20, -3.2), -3.2)
})

test('a stair going down drops from its head to its foot', () => {
  assert.equal(surfaceHeight(pubWithCellar, CELLAR_X, -10, 0), 0)
  assert.ok(Math.abs(surfaceHeight(pubWithCellar, CELLAR_X, -13, -1.5)! - -1.6) < 1e-9)
  assert.equal(surfaceHeight(pubWithCellar, CELLAR_X, -16, -3.1), -3.2)
})

test('walking down the cellar stair in small steps reaches the basement, and back up', () => {
  const step = (z: number, feet: number): number => {
    const surface = surfaceHeight(pubWithCellar, CELLAR_X, z, feet)
    assert.notEqual(surface, null, `no surface at z=${z}`)
    return surface!
  }
  let feet = 0
  for (let z = -9; z >= -20; z -= 0.1) feet = step(z, feet)
  assert.ok(Math.abs(feet - -3.2) < 1e-9)
  for (let z = -20; z <= -9; z += 0.1) feet = step(z, feet)
  assert.equal(feet, 0)
})

test('the feet never sink through the ground floor into the cellar below it', () => {
  let feet = 0
  for (let z = -9; z >= -16; z -= 0.1) feet = surfaceHeight(pubWithCellar, 0, z, feet)!
  assert.equal(feet, 0)
  for (let x = 0; x <= 3.3; x += 0.1) feet = surfaceHeight(pubWithCellar, x, -15, feet)!
  assert.equal(feet, 0)
})

test('the basement under a point is found below the entrance floor', () => {
  assert.equal(levelAt(pubWithCellar, 0, -15, -3.2, 0.01)?.id, 'B1')
  assert.equal(levelAt(pubWithCellar, 0, -15, 0, 0.01)?.id, 'L0')
  assert.equal(levelAt(pubWithCellar, 0, -20, 0, 0.01)?.id, 'B1')
})

test('the collision capsule follows the feet down into the cellar, never below its floor', () => {
  assert.equal(capsuleLift(pubWithCellar, 0.2, 0.2), 0.2)
  assert.ok(Math.abs(capsuleLift(pubWithCellar, 0.2, -3) - -3) < 1e-9)
  assert.ok(Math.abs(capsuleLift(pubWithCellar, 0.2, -5) - -3) < 1e-9)
  assert.equal(capsuleLift(twoStoreys, 0.2, 3.2), 3.2)
  assert.equal(capsuleLift(twoStoreys, 0.2, 0), 0.2)
})
