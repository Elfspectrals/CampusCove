import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MEAL_TRAY_REACH, inCellReach, trayFoodPosition, type JailCellLayout } from './jailCell.ts'

const cell: JailCellLayout = {
  id: 'cell_01',
  position: [109.405, 1.8, 8.6],
  door: [108.405, 0.2, 9.64],
  tap: [111.825, 1.06, 8.75],
  hatch: [108.405, 1.14, 8.15],
  bounds: { minX: 108.485, maxX: 112.005, minZ: 6.68, maxZ: 10.12 },
}

test('the hatch is in reach from inside the cell, next to the bars', () => {
  assert.equal(inCellReach(cell, cell.hatch, 109, 8.2, MEAL_TRAY_REACH), true)
})

test('the hatch is out of reach from the back of the cell', () => {
  assert.equal(inCellReach(cell, cell.hatch, 111.8, 8.6, MEAL_TRAY_REACH), false)
})

test('the hatch is out of reach from the office in front of the bars', () => {
  assert.equal(inCellReach(cell, cell.hatch, 108, 8.15, MEAL_TRAY_REACH), false)
})

test('the food sits on the tray, just inside the bars', () => {
  const [x, y, z] = trayFoodPosition(cell)
  assert.ok(Math.abs(x - 108.525) < 1e-9)
  assert.ok(Math.abs(y - 1.165) < 1e-9)
  assert.ok(Math.abs(z - 8.15) < 1e-9)
})
