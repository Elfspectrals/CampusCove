import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dartLanding, dartsScore, powerDropCm, scatterSigmaCm } from './darts.ts'
import { DARTS_MAX_OFFSET_CM, DARTS_POWER_DEAD_ZONE, DARTS_POWER_IDEAL } from './pubConstants.ts'

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

function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('a release inside the sweet spot flies straight, a soft one drops and a hard one rises', () => {
  assert.equal(powerDropCm(DARTS_POWER_IDEAL), 0)
  assert.equal(powerDropCm(DARTS_POWER_IDEAL + DARTS_POWER_DEAD_ZONE * 0.9), 0)
  assert.equal(powerDropCm(DARTS_POWER_IDEAL - DARTS_POWER_DEAD_ZONE * 0.9), 0)
  assert.ok(powerDropCm(DARTS_POWER_IDEAL - 0.1) < -1)
  assert.ok(powerDropCm(DARTS_POWER_IDEAL + 0.1) > 1)
  assert.ok(powerDropCm(0) < -15)
})

test('the scatter grows with drink and with a bad release', () => {
  assert.ok(scatterSigmaCm(0, DARTS_POWER_IDEAL) < 1)
  assert.ok(scatterSigmaCm(100, DARTS_POWER_IDEAL) > scatterSigmaCm(0, DARTS_POWER_IDEAL) * 3)
  assert.ok(scatterSigmaCm(0, DARTS_POWER_IDEAL + 0.2) > scatterSigmaCm(0, DARTS_POWER_IDEAL))
  const far = dartLanding(24.9, -24.9, 0, 100, seeded(3))
  assert.ok(Math.abs(far.x) <= DARTS_MAX_OFFSET_CM && Math.abs(far.y) <= DARTS_MAX_OFFSET_CM)
})

test('even a perfect bot aiming at the treble 20 rarely makes 150 with three darts', () => {
  const random = seeded(42)
  const rounds = 4000
  let total = 0
  let over150 = 0
  for (let i = 0; i < rounds; i++) {
    let round = 0
    for (let d = 0; d < 3; d++) {
      const { x, y } = dartLanding(0, 10.3, DARTS_POWER_IDEAL, 0, random)
      round += dartsScore(x, y)
    }
    total += round
    if (round >= 150) over150++
  }
  const mean = total / rounds
  assert.ok(mean > 90 && mean < 130, `bot mean ${mean}`)
  assert.ok(over150 / rounds < 0.15, `bot 150+ rate ${over150 / rounds}`)
})
