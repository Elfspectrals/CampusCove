import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RACE_MAX_PROGRESS_PER_S } from '../gameRoomConstants.ts'
import {
  DRINK_FAST_BANDS,
  SLIPPERY_S,
  createDrinkFastSim,
  drinkFastBand,
  seededRandom,
  type DrinkFastState,
} from './drinkFast.ts'

const DT = 1 / 60

function close(actual: number, expected: number, epsilon = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
}

function run(seed: number, frames: number, holding: (state: DrinkFastState, frame: number) => boolean): DrinkFastState[] {
  const sim = createDrinkFastSim(seed)
  const states: DrinkFastState[] = []
  let state = sim.step(0, false)
  for (let i = 0; i < frames; i++) {
    state = sim.step(DT, holding(state, i))
    states.push(state)
  }
  return states
}

function keepCentred(state: DrinkFastState): boolean {
  return state.y < 0.5
}

test('the seeded random source repeats itself and stays in [0, 1)', () => {
  const a = seededRandom(99)
  const b = seededRandom(99)
  for (let i = 0; i < 100; i++) {
    const value = a()
    assert.equal(value, b())
    assert.ok(value >= 0 && value < 1)
  }
  assert.notEqual(seededRandom(1)(), seededRandom(2)())
})

test('the same seed and inputs replay the same race', () => {
  const alternate = (_: DrinkFastState, frame: number) => frame % 7 < 4
  assert.deepEqual(run(42, 600, alternate), run(42, 600, alternate))
  assert.notDeepEqual(run(42, 600, alternate), run(43, 600, alternate))
})

test('the cursor never leaves the gauge', () => {
  for (const holding of [() => true, () => false, (_: DrinkFastState, frame: number) => frame % 5 === 0]) {
    for (const state of run(7, 1800, holding)) {
      assert.ok(state.y >= 0 && state.y <= 1, `y = ${state.y}`)
      assert.ok(state.progress >= 0 && state.progress <= 1, `progress = ${state.progress}`)
    }
  }
})

test('the bands match the contract and progress follows the band rate', () => {
  assert.equal(drinkFastBand(0.5)?.zone, 'sweet')
  assert.equal(drinkFastBand(0.42)?.zone, 'sweet')
  assert.equal(drinkFastBand(0.58)?.zone, 'sweet')
  assert.equal(drinkFastBand(0.3)?.zone, 'fair')
  assert.equal(drinkFastBand(0.7)?.zone, 'fair')
  assert.equal(drinkFastBand(0.15)?.zone, 'poor')
  assert.equal(drinkFastBand(0.88)?.zone, 'poor')
  assert.equal(drinkFastBand(0.1), null)
  assert.equal(drinkFastBand(0.9), null)
  assert.deepEqual(
    DRINK_FAST_BANDS.map((band) => band.ratePerS),
    [RACE_MAX_PROGRESS_PER_S, 0.07, 0.03],
  )

  const sim = createDrinkFastSim(3)
  const first = sim.step(DT, false)
  assert.equal(first.zone, 'sweet')
  close(first.progress, RACE_MAX_PROGRESS_PER_S * DT)
})

test('progress is capped at the sweet-zone rate, so a pint takes at least 8 s', () => {
  const states = run(1234, 60 * 8 - 1, keepCentred)
  assert.ok(states.every((state, i) => state.progress <= RACE_MAX_PROGRESS_PER_S * DT * (i + 1) + 1e-9))
  assert.ok(states[states.length - 1]!.progress < 1)
  const finished = run(1234, 60 * 8, keepCentred)
  close(finished[finished.length - 1]!.progress, 1)
})

test('leaving the gauge is slippery: no progress and weak controls for 0.6 s after coming back', () => {
  const sim = createDrinkFastSim(11)
  let state = sim.step(0, false)
  while (state.zone !== 'slippery') state = sim.step(DT, false)
  assert.ok(state.y < 0.12)
  const stuck = state.progress
  for (let i = 0; i < 6; i++) {
    state = sim.step(DT, true)
    assert.equal(state.zone, 'slippery')
    assert.equal(state.progress, stuck)
  }

  let backInside = 0
  while (state.y < 0.12) state = sim.step(DT, true)
  const reentry = state.progress
  while (state.zone === 'slippery' && state.y >= 0.12) {
    state = sim.step(DT, state.y < 0.5)
    backInside += DT
  }
  assert.ok(backInside >= SLIPPERY_S - 2 * DT && backInside <= SLIPPERY_S + 2 * DT, `${backInside}s of slippery after re-entry`)
  assert.ok(state.progress > reentry)
})

test('while slippery the hold push is weakened to 0.35', () => {
  const sim = createDrinkFastSim(11)
  let state = sim.step(0, false)
  while (state.y > 0) state = sim.step(DT, false)
  const weak = sim.step(DT, true).y - state.y

  const fresh = createDrinkFastSim(11)
  let healthy = fresh.step(0, false)
  const before = healthy.y
  healthy = fresh.step(DT, true)
  assert.ok(healthy.y - before > weak)
})

test('the perturbations are part of the seed, not of the player', () => {
  const a = createDrinkFastSim(500)
  const b = createDrinkFastSim(500)
  a.step(0, false)
  b.step(0, false)
  for (let i = 0; i < 300; i++) {
    const sa = a.step(DT, i % 2 === 0)
    const sb = b.step(DT, i % 2 === 0)
    assert.equal(sa.y, sb.y)
  }
})
