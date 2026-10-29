import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FOUNTAIN_COOLDOWN_MS,
  FOUNTAIN_SIPS_PER_USE,
  HEAL_OVER_TIME_MS,
  applyPortion,
  fallDamage,
  fountainSip,
  fullStats,
  isWalkingDescent,
  normalizeStats,
  pickBed,
  respawnStats,
  startHealOverTime,
  tickHealOverTime,
  tickStats
} from './survivalStats.ts'

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
  assert.ok(state)
  assert.equal(state.readyAt, readyAt)
  assert.equal(fountainSip(state, readyAt - 1).allowed, false)
  const again = fountainSip(state, readyAt)
  assert.equal(again.allowed, true)
  assert.equal(again.state.readyAt, readyAt + FOUNTAIN_COOLDOWN_MS)
})

test('a heal-over-time portion gives no instant health, other portions still heal at once', () => {
  const stats = { health: 40, hunger: 50, thirst: 50 }
  assert.equal(applyPortion(stats, { health: 30, effect: 'heal_over_time' }).health, 40)
  assert.equal(applyPortion(stats, { health: 15, effect: null }).health, 55)
})

test('a painkiller heals 30 HP evenly over 30 s, then stops', () => {
  const stats = { health: 40, hunger: 50, thirst: 50 }
  const dose = startHealOverTime(1000, 30)
  const half = tickHealOverTime(stats, dose, 1000 + HEAL_OVER_TIME_MS / 2)
  assert.ok(Math.abs(half.stats.health - 55) < 1e-9)
  const end = tickHealOverTime(half.stats, half.healOverTime, 1000 + HEAL_OVER_TIME_MS + 5000)
  assert.ok(Math.abs(end.stats.health - 70) < 1e-9)
  assert.equal(end.healOverTime, null)
  assert.deepEqual(tickHealOverTime(end.stats, null, 99_999), { stats: end.stats, healOverTime: null })
})

test('a new dose restarts the timer instead of stacking', () => {
  const stats = { health: 40, hunger: 50, thirst: 50 }
  const first = tickHealOverTime(stats, startHealOverTime(0, 30), 10_000)
  const refill = startHealOverTime(10_000, 30)
  assert.equal(refill.until, 10_000 + HEAL_OVER_TIME_MS)
  const later = tickHealOverTime(first.stats, refill, 10_000 + HEAL_OVER_TIME_MS)
  assert.ok(Math.abs(later.stats.health - 80) < 1e-9)
})

test('a waking player gets a free bed, else the least recently used one', () => {
  const beds = [{ id: 'bed_01' }, { id: 'bed_02' }, { id: 'bed_03' }]
  const occupants = new Map([['bed_01', { sessionId: 'a', usedAt: 10 }], ['bed_02', { sessionId: null, usedAt: 20 }]])
  assert.equal(pickBed(beds, occupants).id, 'bed_03')
  occupants.set('bed_03', { sessionId: 'b', usedAt: 30 })
  assert.equal(pickBed(beds, occupants).id, 'bed_02')
  occupants.set('bed_02', { sessionId: 'c', usedAt: 40 })
  assert.equal(pickBed(beds, occupants).id, 'bed_01')
})
