import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headingDegrees, labelRows, mapAreaOf, mapMarkers, worldToMap } from './minimap.ts'
import type { WorldManifest } from './worldManifest.ts'

const manifest = {
  version: 1,
  spawn: [0, 0, 0],
  spawnYaw: 0,
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [
    {
      key: 'town',
      modelUrl: '',
      bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
      buildings: [
        { kind: 'house', key: 'house_01', name: 'Maple Cottage', position: [10, 0, 32], rotationY: 0, door: [0, 0, 0], offer: 'buy', price: 1 },
        { kind: 'house', key: 'house_02', name: 'Bluebell Bungalow', position: [27, 0, 20], rotationY: 0, door: [0, 0, 0], offer: 'buy', price: 1 },
        { kind: 'work', key: 'cafe', name: 'Campus Cafe', job: 'barista', position: [20, 0, 73], rotationY: 0, door: [0, 0, 0], footprint: [1, 1] },
      ],
    },
    {
      key: 'mall',
      modelUrl: '',
      bounds: { minX: -400, maxX: -40, minZ: -100, maxZ: 100 },
      buildings: [{ kind: 'store', key: 'cove_home', name: 'Cove Home', position: [-300, 0, 50], rotationY: 0, door: [0, 0, 0], footprint: [1, 1] }],
    },
  ],
} as unknown as WorldManifest

test('the map area wraps every zone with a margin, not the far world limits', () => {
  assert.deepEqual(mapAreaOf(manifest), { minX: -412, maxX: 52, minZ: -112, maxZ: 112 })
})

test('world points map to fractions from the top-left (north-west) corner', () => {
  const area = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }
  assert.deepEqual(worldToMap(-100, -50, area), { u: 0, v: 0 })
  assert.deepEqual(worldToMap(0, 0, area), { u: 0.5, v: 0.5 })
  assert.deepEqual(worldToMap(100, 50, area), { u: 1, v: 1 })
})

test('the arrow points up facing north and turns left with a positive yaw', () => {
  assert.equal(headingDegrees(0), -0)
  assert.equal(headingDegrees(Math.PI / 2), -90)
})

test('markers list shops and jobs, and only the player home among houses', () => {
  const kinds = (home: string | null) => mapMarkers(manifest, home).map((m) => `${m.kind}:${m.id}`)
  assert.deepEqual(kinds(null), ['store:cove_home', 'work:cafe'])
  assert.deepEqual(kinds('house_02'), ['store:cove_home', 'work:cafe', 'home:house_02'])
  assert.deepEqual(kinds('nope'), ['store:cove_home', 'work:cafe'])
})

test('a label that would overlap its neighbour moves to a free row', () => {
  const map = { w: 1000, h: 500 }
  const row = [
    { u: 0.5, v: 0.5, name: 'Tech Hub' },
    { u: 0.52, v: 0.5, name: 'Boutique' },
    { u: 0.54, v: 0.5, name: 'Campus Cafe' },
  ]
  assert.deepEqual(labelRows(row, map), [1, -1, 2])
  assert.deepEqual(labelRows([row[0], { u: 0.9, v: 0.5, name: 'Far' }], map), [1, 1])
})
