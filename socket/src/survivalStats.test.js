import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FOUNTAIN_COOLDOWN_MS,
  FOUNTAIN_SIPS_PER_USE,
  applyPortion,
  fallDamage,
  fountainSip,
  fullStats,
  isWalkingDescent,
  normalizeStats,
  respawnStats,
  tickStats
} from './survivalStats.js'

test('hunger empties in 40 minutes of play, thirst in 30', () => {
  const after20Min = tickStats(fullStats(), 20 * 60).stats
  assert.ok(Math.abs(after20Min.hunger - 50) < 1e-9)
  assert.ok(Math.abs(after20Min.thirst - 100 / 3) < 1e-9)
})

test('time scale only speeds up hunger and thirst', () => {
  const { stats, damage } = tickStats({ health: 50, hunger: 100, thirst: 100 }, 60, 10)
  assert.ok(Math.abs(stats.hunger - 75) < 1e-9)
  assert.equal(damage, 0)
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

test('a stair or a slope is a walking descent, a ledge is not', () => {
  assert.equal(isWalkingDescent(0.26, 0.4), true)
  assert.equal(isWalkingDescent(3, 0.3), false)
  assert.equal(isWalkingDescent(0, 0.4), false)
})

test('respawn and normalisation', () => {
  assert.deepEqual(respawnStats({ health: 0, hunger: 0, thirst: 70 }), { health: 50, hunger: 30, thirst: 70 })
  assert.deepEqual(normalizeStats({ health: 140, hunger: 'x', thirst: -2 }), { health: 100, hunger: 100, thirst: 0 })
})

test('the fountains run dry for a player after a drink, then refill', () => {
  let state = null
  for (let i = 0; i < FOUNTAIN_SIPS_PER_USE; i++) {
    const sip = fountainSip(state, 1000 + i)
    assert.equal(sip.allowed, true)
    state = sip.state
  }
  const readyAt = 1000 + FOUNTAIN_SIPS_PER_USE - 1 + FOUNTAIN_COOLDOWN_MS
  assert.equal(state.readyAt, readyAt)
  assert.equal(fountainSip(state, readyAt - 1).allowed, false)
  const again = fountainSip(state, readyAt)
  assert.equal(again.allowed, true)
  assert.equal(again.state.readyAt, readyAt + FOUNTAIN_COOLDOWN_MS)
})
