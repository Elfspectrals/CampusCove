import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SLOT_COPIES, SHELF_KIT, lighterStock, shelfPieces, shelfUnits, slotBoxes, slotCapacity, slotCopies, emptySlotCube, EMPTY_SLOT_COLORS, type ShelfArrange, type SlotCopy } from './shelves.ts'
import type { Vec3 } from '../mallTemplates/mallTemplate.ts'

const gondola = { shelf: 'gondola', length: 3, levels: 4, slots: 2 } as const
const can: Vec3 = [0.08, 0.12, 0.08]
const box: Vec3 = [0.5, 0.3, 0.4]
const round = (v: Vec3) => v.map((n) => Number(n.toFixed(3)))

function inside(copies: SlotCopy[], slot: Vec3, size: Vec3): boolean {
  return copies.every(({ position: [x, y, z], yaw, tipped }) => {
    const a = (tipped ? size[1] : size[0]) / 2
    const b = size[2] / 2
    const cx = tipped ? x - a * Math.cos(yaw) : x
    const cz = tipped ? z + a * Math.sin(yaw) : z
    const ex = Math.abs(Math.cos(yaw)) * a + Math.abs(Math.sin(yaw)) * b
    const ez = Math.abs(Math.sin(yaw)) * a + Math.abs(Math.cos(yaw)) * b
    const top = tipped ? y + size[0] / 2 : y + size[1]
    return Math.abs(cx) + ex <= slot[0] / 2 + 1e-6 && Math.abs(cz) + ez <= slot[2] / 2 + 1e-6 && top <= slot[1] + 1e-6 && y >= -1e-6
  })
}

test('a shelf is one kit unit per metre with an upright at each end', () => {
  assert.deepEqual(shelfUnits(gondola).map((u) => u.center[0]), [-1, 0, 1])
  const pieces = shelfPieces(gondola)
  assert.deepEqual(pieces.filter((p) => p.key === SHELF_KIT.upright).map((p) => p.position[0]), [-1.48, 1.48])
  assert.equal(pieces.filter((p) => p.key === SHELF_KIT.back).length, 3)
  assert.equal(pieces.filter((p) => p.key === SHELF_KIT.board).length, 3 * 4 * 2)
  assert.deepEqual(shelfPieces({ ...gondola, shelf: 'wall' }).filter((p) => p.key === SHELF_KIT.board).length, 3 * 4)
})

test('a fridge has a frame and a glass door per unit, a chiller a tub and no boards', () => {
  const fridge = shelfPieces({ shelf: 'fridge', length: 2, levels: 5, slots: 3 })
  assert.equal(fridge.filter((p) => p.key === SHELF_KIT.fridge).length, 2)
  assert.equal(fridge.filter((p) => p.key === SHELF_KIT.door).length, 2)
  assert.equal(fridge.filter((p) => p.key === SHELF_KIT.board).length, 10)
  const chiller = shelfPieces({ shelf: 'chiller', length: 4, levels: 1, slots: 4 })
  assert.equal(chiller.filter((p) => p.key === SHELF_KIT.tub).length, 4)
  assert.equal(chiller.filter((p) => p.key === SHELF_KIT.board).length, 0)
})

test('levels rise evenly from the bottom board, boards carry their level', () => {
  const boards = shelfPieces(gondola).filter((p) => p.key === SHELF_KIT.board && p.position[0] === -1 && p.position[2] > 0)
  assert.deepEqual(boards.map((p) => Number(p.position[1].toFixed(3))), [0.09, 0.46, 0.83, 1.2])
  const bottoms = slotBoxes(gondola).filter((b) => b.key.startsWith('0.') && b.key.endsWith('.0')).map((b) => Number((b.center[1] - b.size[1] / 2).toFixed(3)))
  assert.deepEqual(bottoms, [0.12, 0.49, 0.86, 1.23])
})

test('a gondola has slots on both faces, slot 0 on the left seen from each aisle', () => {
  const boxes = slotBoxes(gondola)
  assert.equal(boxes.length, 2 * 4 * 2)
  const front = boxes.find((b) => b.key === '0.0.0')!
  const back = boxes.find((b) => b.key === '1.0.0')!
  assert.ok(front.center[0] < 0 && front.center[2] > 0 && front.yaw === 0)
  assert.ok(back.center[0] > 0 && back.center[2] < 0 && back.yaw === Math.PI)
  assert.deepEqual(round(front.size), [1.44, 0.31, 0.435])
  assert.equal(slotBoxes({ ...gondola, shelf: 'wall' }).length, 4 * 2)
  assert.deepEqual(slotBoxes({ shelf: 'chiller', length: 2, levels: 1, slots: 4 }).map((b) => b.key), ['0.0.0', '0.0.1', '0.0.2', '0.0.3'])
})

test('an empty slot holds a coloured cube that fits inside it and rests on its floor', () => {
  for (const box of slotBoxes(gondola)) {
    const cube = emptySlotCube(box, `s1#${box.key}`)
    assert.ok(cube.side > 0 && cube.side <= Math.min(...box.size))
    assert.ok(Math.abs(cube.position[1] - cube.side / 2 - (box.center[1] - box.size[1] / 2)) < 1e-9)
    assert.equal(cube.yaw, box.yaw)
    assert.ok((EMPTY_SLOT_COLORS as readonly string[]).includes(cube.color))
  }
  const box = slotBoxes(gondola)[0]!
  assert.equal(emptySlotCube(box, 's1#0.0.0').color, emptySlotCube(box, 's1#0.0.0').color)
  const colors = new Set(slotBoxes(gondola).map((b) => emptySlotCube(b, `s1#${b.key}`).color))
  assert.ok(colors.size > 1, 'one shelf mixes colours')
})

test('capacity depends on the arrangement and the item size, capped', () => {
  const slot: Vec3 = [0.5, 0.3, 0.4]
  assert.equal(slotCapacity(slot, can, 'rows'), 5 * 4)
  assert.equal(slotCapacity(slot, can, 'messy'), 5 * 4)
  assert.equal(slotCapacity(slot, can, 'front'), 5)
  assert.equal(slotCapacity(slot, can, 'stack'), 4 * (5 + 4))
  assert.equal(slotCapacity([4, 0.3, 0.4], can, 'rows'), MAX_SLOT_COPIES)
  assert.equal(slotCapacity(slot, [0.1, 0.5, 0.1], 'rows'), 0)
  assert.throws(() => slotCopies(slot, [0.1, 0.5, 0.1], 1, 'rows', 's'), /too big for this slot/)
  assert.throws(() => slotCopies(slot, can, 6, 'front', 's'), /6 copies do not fit, the slot holds 1 to 5/)
  assert.throws(() => slotCopies(slot, can, 0, 'rows', 's'), /0 copies do not fit/)
})

test('every arrangement places the asked count inside the slot box', () => {
  for (const arrange of ['rows', 'messy', 'stack', 'front'] as ShelfArrange[]) {
    for (const size of [can, [0.2, 0.06, 0.12] as Vec3, [0.45, 0.28, 0.35] as Vec3]) {
      const capacity = slotCapacity(box, size, arrange)
      for (const count of [1, Math.ceil(capacity / 2), capacity]) {
        const copies = slotCopies(box, size, count, arrange, `g1#0.0.${count}`)
        assert.equal(copies.length, count, `${arrange} ${count}`)
        assert.ok(inside(copies, box, size), `${arrange} ${size.join('x')} ${count}`)
      }
    }
  }
})

test('rows fill the front row first, front pushes one row to the edge', () => {
  const rows = slotCopies(box, can, 7, 'rows', 's')
  const frontZ = box[2] / 2 - can[2] / 2
  assert.equal(rows.filter((c) => Math.abs(c.position[2] - frontZ) < 1e-9).length, 5)
  const front = slotCopies(box, can, 3, 'front', 's')
  assert.ok(front.every((c) => Math.abs(c.position[2] - frontZ) < 1e-9))
  assert.deepEqual(front.map((c) => Number(c.position[0].toFixed(3))), [-0.09, 0, 0.09])
})

test('stack piles copies into a pyramid, flat while two fit side by side', () => {
  assert.deepEqual(slotCopies(box, can, 2, 'stack', 's').map((c) => c.position[1]), [0, 0])
  const pile = slotCopies([0.5, 0.4, 0.4], can, 6, 'stack', 's')
  assert.deepEqual(pile.map((c) => Number(c.position[1].toFixed(2))), [0, 0, 0, 0.12, 0.12, 0.24])
  assert.equal(Number(pile[5]!.position[0].toFixed(3)), 0)
})

test('messy is seeded: the same slot always looks the same, and it differs from rows', () => {
  const a = slotCopies(box, can, 20, 'messy', 'g1#0.1.2')
  assert.deepEqual(slotCopies(box, can, 20, 'messy', 'g1#0.1.2'), a)
  assert.notDeepEqual(slotCopies(box, can, 20, 'messy', 'g1#0.1.3'), a)
  assert.notDeepEqual(a, slotCopies(box, can, 20, 'rows', 'g1#0.1.2'))
  const knocked = Array.from({ length: 30 }, (_, i) => slotCopies(box, can, 20, 'messy', `seed${i}`)).flat().filter((c) => c.tipped).length
  assert.ok(knocked > 40 && knocked < 160, `${knocked} of 600 knocked over`)
})

test('the low quality shelf shows half the copies of each slot, never an empty one', () => {
  const fill = { '0.0.0': { code: 'grocery_apple', key: 'apple', price: 2, count: 7, arrange: 'rows' as const }, '0.1.0': { code: 'grocery_apple', key: 'apple', price: 2, count: 1, arrange: 'front' as const } }
  assert.deepEqual(Object.values(lighterStock({ fill }).fill).map((slot) => slot.count), [4, 1])
  assert.equal(fill['0.0.0'].count, 7)
})
