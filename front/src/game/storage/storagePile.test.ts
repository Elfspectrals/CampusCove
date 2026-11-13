import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DOOR_CLEARANCE, UNIT_DEPTH, UNIT_WIDTH, pileLayout, uncoveredCount, type PileItem } from './storagePile.ts'

const item = (code: string, w: number, d: number, h: number, quantity = 1): PileItem => ({ code, quantity, size: { w, d, h } })

test('one or two pieces stay uncovered, never more', () => {
  assert.equal(uncoveredCount(0), 0)
  assert.equal(uncoveredCount(1), 1)
  assert.equal(uncoveredCount(5), 2)
  const pile = pileLayout([item('a', 1, 1, 1), item('b', 1, 1, 1), item('c', 1, 1, 1), item('d', 1, 1, 1)], 'lot-1')
  assert.equal(pile.filter((p) => !p.covered).length, 2)
})

test('a stack of copies stays covered and shows at most three high', () => {
  const [stack] = pileLayout([item('mug', 0.3, 0.3, 0.2, 5)], 'lot-1')
  assert.equal(stack!.covered, true)
  assert.equal(stack!.height, 0.6000000000000001)
})

test('the pile starts at the back wall with the biggest piece and stays clear of the door', () => {
  const pile = pileLayout([item('lamp', 0.4, 0.4, 1.6), item('sofa', 2.2, 0.9, 0.8), item('bed', 2, 2, 0.5)], 'lot-2')
  assert.equal(pile[0]!.code, 'bed')
  assert.equal(pile[0]!.z, 1)
  for (const p of pile) {
    assert.ok(p.z <= UNIT_DEPTH - DOOR_CLEARANCE)
    assert.ok(Math.abs(p.x) <= UNIT_WIDTH / 2)
  }
})

test('pieces that do not fit on the floor go on a second layer', () => {
  const beds = Array.from({ length: 6 }, (_, i) => item(`bed${i}`, 2, 2, 0.5))
  const pile = pileLayout(beds, 'lot-3')
  assert.equal(pile.filter((p) => p.y === 0).length, 2)
  assert.ok(pile.slice(2).every((p) => p.y >= 0.5))
})

test('the same lot always gives the same pile', () => {
  const items = [item('a', 1, 1, 1), item('b', 0.5, 0.5, 0.5), item('c', 0.8, 0.6, 1)]
  assert.deepEqual(pileLayout(items, 'lot-x'), pileLayout(items, 'lot-x'))
})
