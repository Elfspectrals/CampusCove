import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FULL_STATS, SPEED_BOOST_FACTOR, mostUrgentGauge, portionSegments, screenEffects, walkSpeedFactor } from './survival.ts'

test('no effect while every gauge is fine', () => {
  const fx = screenEffects(FULL_STATS)
  assert.equal(fx.hungerVignette, 0)
  assert.equal(fx.desaturation, 0)
  assert.equal(fx.edgeBlur, 0)
  assert.equal(fx.healthVignette, 0)
})

test('effects grow as gauges drop, reduced mode softens them', () => {
  const starving = { health: 10, hunger: 5, thirst: 2 }
  const fx = screenEffects(starving)
  assert.ok(fx.hungerVignette > 0.4)
  assert.ok(fx.desaturation > 0.4)
  assert.ok(fx.edgeBlur > 0.7)
  assert.ok(fx.heartbeatPeriod < 0.7)
  const reduced = screenEffects(starving, true)
  assert.ok(reduced.hungerVignette < fx.hungerVignette)
  assert.equal(reduced.edgeBlur, 0)
})

test('walking speed', () => {
  assert.equal(walkSpeedFactor(FULL_STATS, false), 1)
  assert.equal(walkSpeedFactor({ ...FULL_STATS, thirst: 5 }, false), 0.8)
  assert.equal(walkSpeedFactor({ ...FULL_STATS, thirst: 5 }, true), SPEED_BOOST_FACTOR)
})

test('most urgent gauge', () => {
  assert.equal(mostUrgentGauge(FULL_STATS), null)
  assert.equal(mostUrgentGauge({ health: 90, hunger: 20, thirst: 12 }), 'thirst')
})

test('portion bar only for items eaten in several bites', () => {
  assert.deepEqual(portionSegments(4, 3), { total: 4, filled: 3 })
  assert.equal(portionSegments(1, 1), null)
  assert.equal(portionSegments(null, null), null)
})
