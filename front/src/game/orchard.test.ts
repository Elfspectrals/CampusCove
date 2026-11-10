import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nearestTree, sellQuantity, wholeApples, withinReach } from './orchard.ts'

test('the nearest tree within reach is the one to pick', () => {
  const trees: [number, number, number][] = [[0, 0, 0], [5, 0, 0]]
  assert.equal(nearestTree(trees, { x: 2.2, z: 0 }, 2.2), 0)
  assert.equal(nearestTree(trees, { x: 2.21, z: 0 }, 2.2), null)
  assert.equal(nearestTree(trees, { x: 3, z: 0 }, 2.2), 1)
  assert.equal(nearestTree([], { x: 0, z: 0 }, 2.2), null)
})

test('a pick goes on up to the reach and stops just past it', () => {
  assert.equal(withinReach([0, 0, 0], { x: 0, z: 2.5 }, 2.5), true)
  assert.equal(withinReach([0, 0, 0], { x: 0, z: 2.51 }, 2.5), false)
})

test('a bitten apple is not counted as a whole one', () => {
  assert.equal(wholeApples(undefined), 0)
  assert.equal(wholeApples({ quantity: 7, portions: 2, portions_left: 2 }), 7)
  assert.equal(wholeApples({ quantity: 2, portions: 2, portions_left: 1 }), 1)
  assert.equal(wholeApples({ quantity: 1, portions: 2, portions_left: 1 }), 0)
  assert.equal(wholeApples({ quantity: 3 }), 3)
})

test('the quantity to sell stays between one and the apples carried', () => {
  assert.equal(sellQuantity(5, 7), 5)
  assert.equal(sellQuantity(9, 7), 7)
  assert.equal(sellQuantity(0, 7), 1)
  assert.equal(sellQuantity(3, 0), 0)
})
