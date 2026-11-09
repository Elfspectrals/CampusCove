import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fieldCorners, fieldPlants, fieldPlantsLocal, parseCrops } from './crops.ts'

const crops = parseCrops(JSON.parse(readFileSync(new URL('../../../public/assets/crops/crops.json', import.meta.url), 'utf8')))
const corn = crops.corn!
const field = { id: 'f1', position: [-20, 0, -170] as [number, number, number], yaw: 0, size: [8, 12] as [number, number], pattern: 'rows' as const }

test('the shared crop table lists the four crops with their item and plant model', () => {
  assert.deepEqual(Object.keys(crops), ['corn', 'potato', 'cabbage', 'pumpkin'])
  assert.equal(corn.item, 'farm_corn')
  assert.throws(() => parseCrops({ version: 1, crops: { corn: { ...corn, spacing: 0 } } }), /spacing/)
})

test('rows fill the field on a grid centred on it', () => {
  const spots = fieldPlantsLocal(field, corn)
  assert.equal(spots.length, 6 * 13)
  const xs = [...new Set(spots.map(([x]) => x))]
  assert.deepEqual(xs, [-3, -1.8, -0.6, 0.6, 1.8, 3])
  assert.deepEqual([Math.min(...spots.map((s) => s[2])), Math.max(...spots.map((s) => s[2]))], [-5.4, 5.4])
})

test('a field smaller than one step still grows one plant', () => {
  assert.equal(fieldPlantsLocal({ ...field, size: [1, 0.5] }, corn).length, 1)
})

test('staggered rows shift every other row by half a plant and drop what passes the edge', () => {
  const spots = fieldPlantsLocal({ ...field, pattern: 'staggered' }, corn)
  const second = spots.filter(([x]) => x === -1.8).map(([, , z]) => z)
  assert.equal(second[0], -4.95)
  assert.ok(second.every((z) => z <= 6))
  assert.equal(second.length, 13)
})

test('scattered plants move off the grid but stay deterministic per field', () => {
  const a = fieldPlantsLocal({ ...field, pattern: 'scattered' }, corn)
  assert.deepEqual(a, fieldPlantsLocal({ ...field, pattern: 'scattered' }, corn))
  assert.notDeepEqual(a.map(([x]) => x), fieldPlantsLocal(field, corn).map(([x]) => x))
  assert.notDeepEqual(a, fieldPlantsLocal({ ...field, id: 'f2', pattern: 'scattered' }, corn))
})

test('world plants follow the field position and yaw', () => {
  const [local] = fieldPlantsLocal(field, corn)
  const [world] = fieldPlants({ ...field, yaw: Math.PI / 2 }, corn)
  assert.ok(Math.abs(world![0] - (-20 + local![2])) < 1e-3)
  assert.ok(Math.abs(world![2] - (-170 - local![0])) < 1e-3)
  assert.deepEqual(fieldCorners(field), [[-24, -176], [-16, -176], [-16, -164], [-24, -164]])
})
