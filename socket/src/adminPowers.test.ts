import assert from 'node:assert/strict'
import { test } from 'node:test'
import { boostedStats, parseBoost, parseToggle, withPowers, withToggle } from './adminPowers.ts'

const LOW = { health: 20, hunger: 10, thirst: 5 }

test('no power leaves the gauges alone', () => {
  assert.equal(withPowers(LOW, undefined), LOW)
  assert.equal(withPowers(LOW, new Set()), LOW)
})

test('each toggle holds its own gauge full', () => {
  assert.deepEqual(withPowers(LOW, new Set(['god'])), { health: 100, hunger: 10, thirst: 5 })
  assert.deepEqual(withPowers(LOW, new Set(['endless_food'])), { health: 20, hunger: 100, thirst: 5 })
  assert.deepEqual(withPowers(LOW, new Set(['endless_water', 'god'])), { health: 100, hunger: 10, thirst: 100 })
})

test('a toggle turns on and off without touching the others', () => {
  const on = withToggle(undefined, 'god', true)
  const both = withToggle(on, 'endless_food', true)
  assert.deepEqual([...both].sort(), ['endless_food', 'god'])
  assert.deepEqual([...withToggle(both, 'god', false)], ['endless_food'])
  assert.deepEqual([...on], ['god'], 'the previous set is not changed')
})

test('boosts fill one gauge, sober and clear_wanted fill none', () => {
  assert.deepEqual(boostedStats(LOW, 'heal'), { health: 100, hunger: 10, thirst: 5 })
  assert.deepEqual(boostedStats(LOW, 'feed'), { health: 20, hunger: 100, thirst: 5 })
  assert.deepEqual(boostedStats(LOW, 'drink'), { health: 20, hunger: 10, thirst: 100 })
  assert.equal(boostedStats(LOW, 'sober'), LOW)
  assert.equal(boostedStats(LOW, 'clear_wanted'), LOW)
})

test('only known powers are parsed', () => {
  assert.equal(parseToggle('god'), 'god')
  assert.equal(parseToggle('heal'), null)
  assert.equal(parseBoost('heal'), 'heal')
  assert.equal(parseBoost('fly'), null)
  assert.equal(parseBoost(undefined), null)
})
