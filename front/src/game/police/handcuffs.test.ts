import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CELL_DOOR_PROMPT_REACH, CUFF_PROMPT_REACH, cellAtDoor, nearestCuffTarget, someoneInside } from './handcuffs.ts'
import type { JailCellLayout } from './jailCell.ts'

const cell = (id: string, z: number): JailCellLayout => ({
  id,
  position: [109.4, 1.8, z],
  door: [108.4, 0.2, z + 1],
  tap: [111.8, 1.06, z],
  hatch: [108.4, 1.14, z - 0.5],
  bounds: { minX: 108.5, maxX: 112, minZ: z - 1.9, maxZ: z + 1.5 },
})
const cells = [cell('cell_01', 8.6), cell('cell_02', 12.2)]
const EYE = 1.8

test('the nearest player within reach is the one to handcuff', () => {
  const me = { x: 0, y: EYE, z: 0 }
  assert.equal(nearestCuffTarget(me, []), null)
  assert.equal(nearestCuffTarget(me, [{ sessionId: 'far', x: CUFF_PROMPT_REACH + 0.01, z: 0 }]), null)
  assert.equal(
    nearestCuffTarget(me, [
      { sessionId: 'b', x: 1.5, z: 0 },
      { sessionId: 'a', x: 0, z: -1 },
    ]),
    'a',
  )
})

test('the cell door in reach is the nearest one, on the same floor', () => {
  assert.equal(cellAtDoor(cells, { x: 108.4 - CELL_DOOR_PROMPT_REACH + 0.01, y: EYE, z: 9.6 })?.id, 'cell_01')
  assert.equal(cellAtDoor(cells, { x: 107.4, y: EYE, z: 12.8 })?.id, 'cell_02')
  assert.equal(cellAtDoor(cells, { x: 108.4 - CELL_DOOR_PROMPT_REACH - 0.01, y: EYE, z: 9.6 }), null)
  assert.equal(cellAtDoor(cells, { x: 107.4, y: EYE + 3, z: 9.6 }), null)
})

test('a cell has someone inside when a player stands within its bounds', () => {
  assert.equal(someoneInside(cells[0]!, [{ x: 110, z: 8.6 }]), true)
  assert.equal(someoneInside(cells[0]!, [{ x: 107, z: 8.6 }, { x: 110, z: 12.2 }]), false)
})
