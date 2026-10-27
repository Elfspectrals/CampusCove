import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyPortion, fallDamage, fullStats, normalizeStats, respawnStats, tickStats } from './survivalStats.js'

test('gauges empty in a day of play (hunger) and 16 hours (thirst)', () => {
  const afterHalfDay = tickStats(fullStats(), 12 * 3600).stats
  assert.ok(Math.abs(afterHalfDay.hunger - 50) < 1e-9)
  assert.ok(Math.abs(afterHalfDay.thirst - 25) < 1e-9)
})

test('time scale only speeds up hunger and thirst', () => {
  const { stats } = tickStats({ health: 50, hunger: 100, thirst: 100 }, 60, 120)
  assert.ok(stats.hunger < 100 - 8)
  assert.ok(stats.health > 50, 'still regenerating while both gauges are high')
})

test('an empty gauge hurts, two hurt twice as much', () => {
  const one = tickStats({ health: 100, hunger: 0, thirst: 50 }, 60)
  const two = tickStats({ health: 100, hunger: 0, thirst: 0 }, 60)
  assert.ok(Math.abs(one.damage - 10) < 1e-9)
  assert.ok(Math.abs(two.damage - 20) < 1e-9)
  assert.equal(tickStats({ health: 3, hunger: 0, thirst: 0 }, 60).stats.health, 0)
})

test('health regenerates only when both gauges are at 80 or more', () => {
  assert.ok(tickStats({ health: 50, hunger: 90, thirst: 85 }, 90).stats.health > 59)
  assert.equal(tickStats({ health: 50, hunger: 90, thirst: 70 }, 90).stats.health, 50)
})

test('a portion restores its values, raw food also hurts', () => {
  const stats = { health: 50, hunger: 95, thirst: 20 }
  assert.deepEqual(applyPortion(stats, { hunger: 12, thirst: 0, health: 1, effect: null }), { health: 51, hunger: 100, thirst: 20 })
  assert.equal(applyPortion(stats, { hunger: 5, thirst: 0, health: 0, effect: 'food_poisoning' }).health, 42)
})

test('falls above 3 m hurt', () => {
  assert.equal(fallDamage(5, 2.5), 0)
  assert.equal(fallDamage(8, 1), 48)
})

test('respawn and normalisation', () => {
  assert.deepEqual(respawnStats({ health: 0, hunger: 0, thirst: 70 }), { health: 50, hunger: 30, thirst: 70 })
  assert.deepEqual(normalizeStats({ health: 140, hunger: 'x', thirst: -2 }), { health: 100, hunger: 100, thirst: 0 })
})
