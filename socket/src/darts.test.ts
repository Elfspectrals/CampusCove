import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dartsScore } from './darts.ts'

function polar(rCm: number, clockwiseFromTopDeg: number): [number, number] {
  const a = (clockwiseFromTopDeg * Math.PI) / 180
  return [rCm * Math.sin(a), rCm * Math.cos(a)]
}

test('bull and outer bull', () => {
  assert.equal(dartsScore(0, 0), 50)
  assert.equal(dartsScore(0.6, 0), 50)
  assert.equal(dartsScore(0, -1.2), 25)
  assert.equal(dartsScore(1.59, 0), 25)
})

test('singles follow the clockwise sector order from the top', () => {
  assert.equal(dartsScore(0, 5), 20)
  assert.equal(dartsScore(...polar(5, 18)), 1)
  assert.equal(dartsScore(...polar(5, 36)), 18)
  assert.equal(dartsScore(5, 0), 6)
  assert.equal(dartsScore(0, -5), 3)
  assert.equal(dartsScore(-5, 0), 11)
  assert.equal(dartsScore(...polar(5, -18)), 5)
  assert.equal(dartsScore(...polar(13, 180 + 18)), 19)
  assert.equal(dartsScore(...polar(13, 180 + 36)), 7)
})

test('sector boundaries sit 9 degrees either side of each number', () => {
  assert.equal(dartsScore(...polar(5, 8.9)), 20)
  assert.equal(dartsScore(...polar(5, 9.1)), 1)
  assert.equal(dartsScore(...polar(5, -8.9)), 20)
  assert.equal(dartsScore(...polar(5, -9.1)), 5)
})

test('triples and doubles multiply the sector', () => {
  assert.equal(dartsScore(0, 10.3), 60)
  assert.equal(dartsScore(0, 9.9), 60)
  assert.equal(dartsScore(0, 10.7), 60)
  assert.equal(dartsScore(0, 9.8), 20)
  assert.equal(dartsScore(0, 10.8), 20)
  assert.equal(dartsScore(0, -16.5), 6)
  assert.equal(dartsScore(0, -16.2), 6)
  assert.equal(dartsScore(0, -17), 6)
  assert.equal(dartsScore(0, -16.1), 3)
})

test('outside the board scores nothing', () => {
  assert.equal(dartsScore(0, 17.01), 0)
  assert.equal(dartsScore(25, 25), 0)
  assert.equal(dartsScore(-12, -13), 0)
})
