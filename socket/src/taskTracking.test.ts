import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ACTIVE_WINDOW_MS, isActiveDayToReport, parisDay, trackActivity, type ActivityDay } from './taskTracking.ts'

const NOON_PARIS = Date.parse('2026-11-13T11:00:00Z')

function walk(windows: number, metresPerWindow: number, start = NOON_PARIS): ActivityDay {
  let state: ActivityDay | undefined
  for (let i = 0; i <= windows; i++) state = trackActivity(state, start + i * ACTIVE_WINDOW_MS, i === 0 ? 0 : metresPerWindow)
  return state!
}

test('the day changes at midnight in Paris, not in UTC', () => {
  assert.equal(parisDay(Date.parse('2026-11-13T22:59:59Z')), '2026-11-13')
  assert.equal(parisDay(Date.parse('2026-11-13T23:00:00Z')), '2026-11-14')
  assert.equal(parisDay(Date.parse('2026-07-13T21:59:59Z')), '2026-07-13')
  assert.equal(parisDay(Date.parse('2026-07-13T22:00:00Z')), '2026-07-14')
})

test('a minute counts once two metres are walked in it', () => {
  assert.equal(walk(1, 3).minutes, 1)
  assert.equal(walk(1, 2).minutes, 1)
  assert.equal(walk(1, 1.5).minutes, 0)
})

test('a minute is only closed after sixty seconds', () => {
  const started = trackActivity(undefined, NOON_PARIS, 0)
  assert.equal(trackActivity(started, NOON_PARIS + ACTIVE_WINDOW_MS - 1, 50).minutes, 0)
})

test('the tenth active minute of the day is reported once', () => {
  assert.equal(isActiveDayToReport(walk(9, 5)), false)
  const tenth = walk(10, 5)
  assert.equal(isActiveDayToReport(tenth), true)
  assert.equal(isActiveDayToReport({ ...trackActivity({ ...tenth, reported: true }, NOON_PARIS + 11 * ACTIVE_WINDOW_MS, 5) }), false)
})

test('active minutes start again from zero the next day in Paris', () => {
  const evening = walk(10, 5, Date.parse('2026-11-13T22:40:00Z'))
  const nextDay = trackActivity(evening, Date.parse('2026-11-13T23:01:00Z'), 5)
  assert.equal(nextDay.day, '2026-11-14')
  assert.equal(nextDay.minutes, 0)
  assert.equal(nextDay.reported, false)
})
