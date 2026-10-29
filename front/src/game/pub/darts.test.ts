import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DARTS_MAX_OFFSET_CM } from '../gameRoomConstants.ts'
import { seededRandom } from './drinkFast.ts'
import { aimSway, dartLabel, dartsScore, sectorAt, swayAmplitudeCm, throwOffset } from './darts.ts'

function at(radiusCm: number, clockwiseDeg: number): [number, number] {
  const rad = (clockwiseDeg * Math.PI) / 180
  return [radiusCm * Math.sin(rad), radiusCm * Math.cos(rad)]
}

test('bull and outer bull', () => {
  assert.equal(dartsScore(0, 0), 50)
  assert.equal(dartsScore(0.6, 0), 50)
  assert.equal(dartsScore(0, -0.635), 50)
  assert.equal(dartsScore(1, 1), 25)
  assert.equal(dartsScore(0, 1.59), 25)
  assert.equal(dartsScore(0, 1.6), 20)
})

test('singles, triples and doubles of the 20', () => {
  assert.equal(dartsScore(0, 5), 20)
  assert.equal(dartsScore(0, 9.9), 60)
  assert.equal(dartsScore(0, 10.3), 60)
  assert.equal(dartsScore(0, 10.7), 60)
  assert.equal(dartsScore(0, 10.8), 20)
  assert.equal(dartsScore(0, 16.2), 40)
  assert.equal(dartsScore(0, 17), 40)
  assert.equal(dartsScore(0, 17.01), 0)
  assert.equal(dartsScore(30, 0), 0)
})

test('sectors run clockwise from the top: 20, 1, 18 … 5', () => {
  assert.equal(dartsScore(...at(5, 8.9)), 20)
  assert.equal(dartsScore(...at(5, 9.1)), 1)
  assert.equal(dartsScore(...at(5, 351.1)), 20)
  assert.equal(dartsScore(...at(5, 350.9)), 5)
  assert.equal(dartsScore(...at(5, 36)), 18)
  assert.equal(dartsScore(...at(5, 90)), 6)
  assert.equal(dartsScore(...at(5, 180)), 3)
  assert.equal(dartsScore(...at(5, 270)), 11)
  assert.equal(dartsScore(...at(10.2, 90)), 18)
  assert.equal(dartsScore(...at(16.5, 180)), 6)
  assert.equal(sectorAt(...at(5, 126)), 15)
  assert.equal(sectorAt(...at(5, 144)), 2)
})

test('labels read like a scoreboard', () => {
  assert.equal(dartLabel(0, 0), 'Bull')
  assert.equal(dartLabel(1, 0), '25')
  assert.equal(dartLabel(0, 10.3), 'T20')
  assert.equal(dartLabel(...at(16.5, 180)), 'D3')
  assert.equal(dartLabel(...at(5, 90)), '6')
  assert.equal(dartLabel(20, 20), 'Miss')
})

test('the crosshair sways 1.5 cm sober, 6 cm tipsy and 12 cm drunk', () => {
  assert.equal(swayAmplitudeCm(0), 1.5)
  assert.equal(swayAmplitudeCm(29), 1.5)
  assert.equal(swayAmplitudeCm(30), 6)
  assert.equal(swayAmplitudeCm(45), 9)
  assert.equal(swayAmplitudeCm(60), 12)
  assert.equal(swayAmplitudeCm(100), 12)

  for (const [intoxication, amplitude] of [
    [0, 1.5],
    [30, 6],
    [80, 12],
  ] as const) {
    let peak = 0
    for (let t = 0; t < 30; t += 1 / 60) {
      const { x, y } = aimSway(t, intoxication, 5)
      assert.ok(Math.abs(x) <= amplitude + 1e-9 && Math.abs(y) <= amplitude + 1e-9)
      peak = Math.max(peak, Math.abs(x), Math.abs(y))
    }
    assert.ok(peak > amplitude * 0.95, `peak ${peak} for ${intoxication}`)
  }
})

test('the sway is a smooth function of time, the same for a seed', () => {
  assert.deepEqual(aimSway(2.5, 50, 9), aimSway(2.5, 50, 9))
  assert.notDeepEqual(aimSway(2.5, 50, 9), aimSway(2.5, 50, 10))
  const a = aimSway(1, 50, 9)
  const b = aimSway(1 + 1 / 60, 50, 9)
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.5)
})

test('the throw adds a small error, bigger when drunk, reproducible with a seeded source', () => {
  const aim = { x: 2, y: -3 }
  assert.deepEqual(throwOffset(aim, 40, seededRandom(77)), throwOffset(aim, 40, seededRandom(77)))

  function spread(intoxication: number): number {
    const random = seededRandom(123)
    let sum = 0
    for (let i = 0; i < 2000; i++) {
      const { x, y } = throwOffset(aim, intoxication, random)
      sum += Math.hypot(x - aim.x, y - aim.y)
    }
    return sum / 2000
  }
  const sober = spread(0)
  const drunk = spread(100)
  assert.ok(sober > 0.2 && sober < 0.8, `sober spread ${sober}`)
  assert.ok(drunk > sober * 3, `drunk spread ${drunk}`)

  const far = throwOffset({ x: 24.9, y: -24.9 }, 100, seededRandom(1))
  assert.ok(Math.abs(far.x) <= DARTS_MAX_OFFSET_CM && Math.abs(far.y) <= DARTS_MAX_OFFSET_CM)
})
