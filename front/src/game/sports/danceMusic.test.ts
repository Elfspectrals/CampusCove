import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dueBeats } from './danceMusic.ts'

const BEAT = 441
const START = 4000
const AHEAD = 600

test('beats are scheduled only once they are 600 ms away or less, each with its delay on the wall clock', () => {
  assert.deepEqual(dueBeats(0, 204, BEAT, START, 0, AHEAD), { due: [], next: 0 })
  assert.deepEqual(dueBeats(0, 204, BEAT, START, 3399, AHEAD), { due: [], next: 0 })
  assert.deepEqual(dueBeats(0, 204, BEAT, START, 3400, AHEAD), { due: [{ beat: 0, inMs: 600 }], next: 1 })
  assert.deepEqual(dueBeats(1, 204, BEAT, START, 3500, AHEAD), { due: [], next: 1 })
  assert.deepEqual(dueBeats(1, 204, BEAT, START, 4000, AHEAD), { due: [{ beat: 1, inMs: 441 }], next: 2 })
})

test('after a stall the beats already past are dropped and the next ones stay on time, instead of the whole song sliding late', () => {
  assert.deepEqual(dueBeats(1, 204, BEAT, START, 5000, AHEAD), { due: [{ beat: 3, inMs: 323 }], next: 4 })
  assert.deepEqual(dueBeats(0, 204, BEAT, START, START, AHEAD), { due: [{ beat: 0, inMs: 0 }, { beat: 1, inMs: 441 }], next: 2 })
})

test('the last beat ends the schedule', () => {
  assert.deepEqual(dueBeats(1, 3, BEAT, START, START + 2 * BEAT - 100, AHEAD), { due: [{ beat: 2, inMs: 100 }], next: 3 })
  assert.deepEqual(dueBeats(0, 3, BEAT, START, 99_000, AHEAD), { due: [], next: 3 })
  assert.deepEqual(dueBeats(3, 3, BEAT, START, 0, AHEAD), { due: [], next: 3 })
})
