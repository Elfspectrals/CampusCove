import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seededRandom } from './drinkFast.ts'
import {
  BREATH_HOLD_S,
  FULL_BREATH,
  aimDrift,
  breathStep,
  dartLabel,
  dartsScore,
  fatigueFactor,
  meterPeriodS,
  meterPower,
  sectorAt,
  swayAmplitudeCm,
  valueNoise,
  type BreathState,
} from './darts.ts'

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

function drift(t: number, intoxication: number, seed = 5, aimedS = 0, breathFactor = 1) {
  return aimDrift({ t, aimedS, intoxication, seed, breathFactor })
}

test('the drift amplitude is 2.4 cm sober, 6 cm tipsy and 12 cm drunk', () => {
  assert.equal(swayAmplitudeCm(0), 2.4)
  assert.equal(swayAmplitudeCm(29), 2.4)
  assert.equal(swayAmplitudeCm(30), 6)
  assert.equal(swayAmplitudeCm(45), 9)
  assert.equal(swayAmplitudeCm(60), 12)
  assert.equal(swayAmplitudeCm(100), 12)
})

test('the drift is smooth, seeded, bounded and does not loop', () => {
  assert.deepEqual(drift(2.5, 50, 9), drift(2.5, 50, 9))
  assert.notDeepEqual(drift(2.5, 50, 9), drift(2.5, 50, 10))
  for (let t = 0; t < 20; t += 1 / 60) {
    const a = drift(t, 0)
    const b = drift(t + 1 / 60, 0)
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 0.6, `jump at ${t}`)
    assert.ok(Math.abs(a.x) <= 2.4 + 0.25 + 1e-9 && Math.abs(a.y) <= 2.4 + 0.25 + 1e-9)
  }
  for (let t = 0; t < 50; t += 0.37) assert.ok(Math.abs(valueNoise(3, t)) <= 1)
  // A sine came back to the same point every period; the noise does not.
  const samples = Array.from({ length: 8 }, (_, i) => drift(1 + i * 4.1, 0).x.toFixed(3))
  assert.equal(new Set(samples).size, samples.length)
})

test('drink, fatigue and the breath scale the drift', () => {
  function rms(intoxication: number, aimedS: number, breathFactor: number): number {
    let sum = 0
    let n = 0
    for (let t = 0; t < 60; t += 0.05) {
      const { x, y } = drift(t, intoxication, 11, aimedS, breathFactor)
      sum += x * x + y * y
      n++
    }
    return Math.sqrt(sum / n)
  }
  const sober = rms(0, 0, 1)
  assert.ok(sober > 0.6 && sober < 2.5, `sober rms ${sober}`)
  assert.ok(rms(80, 0, 1) > sober * 3.5)
  assert.ok(rms(0, 10, 1) > sober * 1.6)
  assert.ok(rms(0, 0, 0.3) < sober * 0.5)
  assert.equal(fatigueFactor(0), 1)
  assert.equal(fatigueFactor(100), fatigueFactor(6))
})

test('holding the breath steadies for a while, then a gasp makes it worse until it recovers', () => {
  const dt = 1 / 60
  let state: BreathState = FULL_BREATH
  let step = breathStep(state, true, dt, 0)
  assert.ok(step.factor < 0.5)
  let held = 0
  while (step.gasp === 0 && held < 10) {
    state = step
    step = breathStep(state, true, dt, 0)
    held += dt
  }
  assert.ok(Math.abs(held - BREATH_HOLD_S) < 0.1, `held ${held}`)
  assert.ok(step.factor > 1)
  state = step
  step = breathStep(state, true, 0.5, 0)
  assert.ok(step.factor > 1, 'cannot hold again while gasping')
  for (let i = 0; i < 300; i++) step = breathStep(step, false, dt, 0)
  assert.equal(step.factor, 1)
  assert.ok(step.air > 0.9)
  assert.ok(breathStep(FULL_BREATH, true, dt, 100).factor > breathStep(FULL_BREATH, true, dt, 0).factor)
})

test('the power meter swings 0 → 1 → 0 at a speed that changes every dart and rises when drunk', () => {
  assert.equal(meterPower(0, 1.5), 0)
  assert.ok(Math.abs(meterPower(0.75, 1.5) - 1) < 1e-9)
  assert.ok(meterPower(1.5, 1.5) < 1e-9)
  const random = seededRandom(4)
  const periods = Array.from({ length: 5 }, () => meterPeriodS(random, 0))
  for (const p of periods) assert.ok(p >= 1.4 && p <= 1.8)
  assert.ok(new Set(periods).size > 1)
  assert.ok(meterPeriodS(() => 0.5, 100) < meterPeriodS(() => 0.5, 0))
})
