import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SWAY_PERIOD_S,
  cameraSway,
  drunkScreenEffects,
  drunkWalkFactor,
  intoxicationStage,
  swayAmplitude,
} from './intoxication.ts'

function close(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`)
}

test('stages: sober below 30, tipsy from 30, drunk from 60', () => {
  assert.equal(intoxicationStage(0), 'sober')
  assert.equal(intoxicationStage(29.9), 'sober')
  assert.equal(intoxicationStage(30), 'tipsy')
  assert.equal(intoxicationStage(59.9), 'tipsy')
  assert.equal(intoxicationStage(60), 'drunk')
  assert.equal(intoxicationStage(100), 'drunk')
})

test('sway amplitude: 0 at 30, 0.012 rad at 60, 0.03 rad at 100, none with reduced camera motion', () => {
  assert.equal(swayAmplitude(0), 0)
  assert.equal(swayAmplitude(30), 0)
  close(swayAmplitude(60), 0.012)
  close(swayAmplitude(100), 0.03)
  assert.ok(swayAmplitude(45) > 0 && swayAmplitude(45) < 0.012)
  assert.equal(swayAmplitude(100, true), 0)
})

test('camera sway rolls with a ~3 s period and swings sideways', () => {
  const start = cameraSway(0.03, 0)
  close(start.roll, 0)
  const quarter = cameraSway(0.03, SWAY_PERIOD_S / 4)
  close(quarter.roll, 0.03)
  const half = cameraSway(0.03, SWAY_PERIOD_S / 2)
  close(half.roll, 0)
  assert.ok(Math.abs(cameraSway(0.03, 1).lateral) <= 0.03 * 4)
  assert.equal(cameraSway(0, 1).roll, 0)
  assert.equal(cameraSway(0, 1).lateral, 0)
})

test('screen effects: warmth from tipsy, blur and double vision from drunk, reduced keeps a softer tint only', () => {
  assert.deepEqual(drunkScreenEffects(20), { blur: 0, doubleVision: 0, warmth: 0 })
  const tipsy = drunkScreenEffects(45)
  assert.equal(tipsy.blur, 0)
  assert.equal(tipsy.doubleVision, 0)
  assert.ok(tipsy.warmth > 0 && tipsy.warmth < 1)
  const gone = drunkScreenEffects(100)
  assert.deepEqual(gone, { blur: 1, doubleVision: 1, warmth: 1 })
  const reduced = drunkScreenEffects(100, true)
  assert.equal(reduced.blur, 0)
  assert.equal(reduced.doubleVision, 0)
  close(reduced.warmth, 0.5)
})

test('walking slows from drunk down to 0.75 at the black-out', () => {
  assert.equal(drunkWalkFactor(0), 1)
  assert.equal(drunkWalkFactor(60), 1)
  close(drunkWalkFactor(80), 0.875)
  close(drunkWalkFactor(100), 0.75)
})
