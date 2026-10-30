import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BEST_TIME_KEY,
  canSpectate,
  formatSeconds,
  ordinal,
  raceResults,
  racePintPose,
  readBestTime,
  recordBestTime,
  spillIncreases,
  spillPenaltyLabel,
} from './raceBoard.ts'

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

test('times and penalties', () => {
  assert.equal(formatSeconds(8400), '8.4 s')
  assert.equal(formatSeconds(-5), '0.0 s')
  assert.equal(spillPenaltyLabel(0), '')
  assert.equal(spillPenaltyLabel(2), '+4 s')
  assert.deepEqual([1, 2, 3, 4, 11].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th'])
})

test('race results keep the server order and flag me', () => {
  const rows = raceResults(
    [
      { sessionId: 'a', ms: 9000, spills: 0 },
      { sessionId: 'b', ms: 10_500, spills: 1 },
    ],
    'b',
  )
  assert.deepEqual(
    rows.map((r) => [r.place, r.time, r.penalty, r.me]),
    [
      [1, '9.0 s', '', false],
      [2, '10.5 s', '+2 s', true],
    ],
  )
})

test('spill increases', () => {
  assert.deepEqual(spillIncreases({ a: 1, b: 0 }, { a: 1, b: 2 }), ['b'])
  assert.deepEqual(spillIncreases({}, { a: 1, b: 0 }), ['a'])
  assert.deepEqual(spillIncreases({ a: 3 }, { a: 3 }), [])
})

test('best time: first, better, worse, unreadable', () => {
  const store = memoryStore()
  assert.equal(readBestTime(store), null)
  assert.deepEqual(recordBestTime(9000, store), { best: 9000, isNew: true })
  assert.deepEqual(recordBestTime(9500, store), { best: 9000, isNew: false })
  assert.deepEqual(recordBestTime(8400, store), { best: 8400, isNew: true })
  assert.equal(store.data.get(BEST_TIME_KEY), '8400')
  assert.equal(readBestTime(memoryStore({ [BEST_TIME_KEY]: 'junk' })), null)
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  assert.equal(readBestTime(broken), null)
  assert.deepEqual(recordBestTime(7000, broken), { best: 7000, isNew: true })
  assert.deepEqual(recordBestTime(7000, null), { best: 7000, isNew: true })
})

test('spectators: on the bar floor, close to the counter, not racing', () => {
  const counter = [0, 0, 0] as const
  assert.ok(canSpectate({ x: 3, y: 1.6, z: 4 }, counter, false))
  assert.ok(!canSpectate({ x: 3, y: 1.6, z: 4 }, counter, true))
  assert.ok(!canSpectate({ x: 9, y: 1.6, z: 9 }, counter, false))
  assert.ok(!canSpectate({ x: 1, y: -2.4, z: 1 }, counter, false), 'the cellar under the bar does not count')
})

test('racer pint pose: raised, then sipping, tipped further as it empties', () => {
  assert.deepEqual(racePintPose(0, 0), { lift: 0, tilt: 0 })
  const early = racePintPose(1.6, 0)
  const late = racePintPose(1.6, 1)
  assert.equal(early.lift, 1)
  assert.ok(late.tilt > early.tilt)
  assert.ok(racePintPose(0.25, 0).lift > 0 && racePintPose(0.25, 0).lift < 1)
})
