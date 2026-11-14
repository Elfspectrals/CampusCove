import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type BoxingStatePayload, boxerFor, clockLabel, isFighting, percentOf, punchKindFor, secondsUntil, serverClock } from './boxing.ts'

const boxer = (sessionId: string, corner: 'red' | 'blue') => ({
  sessionId, name: sessionId, corner, health: 120, maxHealth: 120, endurance: 100, maxEndurance: 100,
  guard: false, knockdowns: 0, countEndsAt: null, canGetUp: false, points: 0,
})

function state(phase: BoxingStatePayload['phase']): BoxingStatePayload {
  return { venue: 'boxing_ring', phase, round: 1, rounds: 3, maxKnockdowns: 3, phaseEndsAt: 70_000, serverNow: 10_000, boxers: [boxer('a', 'red'), boxer('b', 'blue')], result: null }
}

test('left click is a jab, right click a cross, Shift with either a hook, other buttons nothing', () => {
  assert.equal(punchKindFor(0, false), 'jab')
  assert.equal(punchKindFor(2, false), 'cross')
  assert.equal(punchKindFor(0, true), 'hook')
  assert.equal(punchKindFor(2, true), 'hook')
  assert.equal(punchKindFor(1, false), null)
  assert.equal(punchKindFor(1, true), null)
})

test('the round clock runs on the server clock and shows whole seconds, never below zero', () => {
  const now = serverClock(state('round'), 5_000, 5_500)
  assert.equal(now, 10_500)
  assert.equal(secondsUntil(70_000, now), 60)
  assert.equal(secondsUntil(70_000, 69_001), 1)
  assert.equal(secondsUntil(70_000, 70_000), 0)
  assert.equal(secondsUntil(70_000, 80_000), 0)
  assert.deepEqual([clockLabel(60), clockLabel(65), clockLabel(9), clockLabel(0)], ['1:00', '1:05', '0:09', '0:00'])
})

test('bars are whole percents clamped to 0-100, and a zero maximum is an error', () => {
  assert.deepEqual([percentOf(60, 120), percentOf(0, 120), percentOf(130, 120), percentOf(-5, 100)], [50, 0, 100, 0])
  assert.throws(() => percentOf(1, 0), /maximum/)
})

test('a player fights while their bout is not over; a spectator never does', () => {
  assert.equal(boxerFor(state('round'), 'b')?.corner, 'blue')
  assert.equal(isFighting(state('intro'), 'a'), true)
  assert.equal(isFighting(state('over'), 'a'), false)
  assert.equal(isFighting(state('round'), 'spectator'), false)
  assert.equal(isFighting(null, 'a'), false)
})
