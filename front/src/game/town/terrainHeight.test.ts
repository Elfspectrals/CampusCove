import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heightmapAt, terrainHeightIn, type TerrainHeightmap } from './terrainHeight.ts'

/** 3 x 2 grid from (0, 0), 1 m cells: heights rise along x. */
const ramp: TerrainHeightmap = { x0: 0, z0: 0, cell: 1, cols: 3, rows: 2, heights: [0, 1, 2, 0, 1, 2] }
const hill: TerrainHeightmap = { x0: 10, z0: 10, cell: 2, cols: 2, rows: 2, heights: [4, 4, 4, 4] }

test('a grid interpolates inside and says nothing outside', () => {
  assert.equal(heightmapAt(ramp, 0.5, 0.5), 0.5)
  assert.equal(heightmapAt(ramp, 2, 1), 2)
  assert.equal(heightmapAt(ramp, -0.1, 0.5), null)
  assert.equal(heightmapAt(ramp, 2.1, 0.5), null)
})

test('two zones keep their own relief and the rest of the map is flat', () => {
  assert.equal(terrainHeightIn([ramp, hill], 1.5, 0.5), 1.5)
  assert.equal(terrainHeightIn([ramp, hill], 11, 11), 4)
  assert.equal(terrainHeightIn([ramp, hill], 50, 50), 0)
  assert.equal(terrainHeightIn([], 1, 1), 0)
})

test('where grids overlap the higher ground wins', () => {
  const flat: TerrainHeightmap = { x0: 1, z0: 0, cell: 1, cols: 2, rows: 2, heights: [0, 0, 0, 0] }
  assert.equal(terrainHeightIn([flat, ramp], 1.5, 0.5), 1.5)
})
