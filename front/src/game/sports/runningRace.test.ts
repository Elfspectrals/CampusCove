import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SportsRunResultPayload, SportsRunStatePayload, SportsRunner } from '../../types/gameRealtime'
import { readFileSync } from 'node:fs'
import { cadenceBar, footOfButton, formatRaceTime, isRacing, liveBoardRows, myRunner, parseBoardIds, parseScoreboard, predictPosition, raceClockMs, poseChange, relativeBearing, resultBoardRows, weekBoardSections, weekNumber } from './runningRace.ts'
import { parseSportsBoard } from '../../api/running.ts'

const runner: SportsRunner = {
  sessionId: 'me', name: 'Me', lane: 1, x: -500, z: -333, ry: -Math.PI / 2, speed: 8, quality: 1, lastStepAt: null,
  state: 'running', gate: 1, lap: 1, next: { x: -481.8, z: -333 }, timeMs: null, dnf: null,
}
const state: SportsRunStatePayload = {
  venue: 'athletics_track', distanceM: 100, laps: 1, gateCount: 4, phase: 'running', beepAt: 10_000, endsAt: 50_000,
  serverNow: 12_000, goodStepMs: 170, toleranceMs: 40, runners: [runner],
}

test('the runner is found by session and races until finished or out', () => {
  assert.equal(myRunner(state, 'me'), runner)
  assert.equal(myRunner(state, 'other'), null)
  assert.equal(isRacing(runner), true)
  assert.equal(isRacing({ ...runner, state: 'finished' }), false)
  assert.equal(isRacing(null), false)
})

test('the left and right mouse buttons are the two feet', () => {
  assert.deepEqual([0, 1, 2].map(footOfButton), ['left', null, 'right'])
})

test('the race clock starts at the beep and reads in seconds and hundredths', () => {
  assert.equal(raceClockMs({ ...state, beepAt: null }, 12_000), null)
  assert.equal(raceClockMs(state, 11_890 + 10_000), 11_890)
  assert.equal(formatRaceTime(11_890), '11.89')
  assert.equal(formatRaceTime(62_345), '1:02.34')
  assert.equal(formatRaceTime(5_000), '5.00')
})

test('the cadence bar shows the good window around the target step', () => {
  const bar = cadenceBar(170, 40, 170)
  assert.equal(bar.marker, 0.5)
  assert.ok(Math.abs(bar.windowStart - 130 / 340) < 1e-9)
  assert.ok(Math.abs(bar.windowEnd - 210 / 340) < 1e-9)
  assert.equal(bar.inWindow, true)
  assert.equal(cadenceBar(170, 40, 100).inWindow, false)
  assert.equal(cadenceBar(170, 40, 1000).marker, 1)
  assert.equal(cadenceBar(170, 40, null).inWindow, false)
})

test('the gate arrow points by the angle from the look direction, positive to the left', () => {
  assert.ok(Math.abs(relativeBearing(0, 0, -Math.PI / 2, 10, 0)) < 1e-9)
  assert.ok(Math.abs(relativeBearing(0, 0, -Math.PI / 2, 0, -10) - Math.PI / 2) < 1e-9)
})

test('the runner position is carried forward from the last server state, a quarter second at most', () => {
  const ahead = predictPosition(runner, 100)
  assert.ok(Math.abs(ahead.x - (-499.2)) < 1e-9 && Math.abs(ahead.z - -333) < 1e-9)
  assert.ok(Math.abs(predictPosition(runner, 5000).x - (-498)) < 1e-9)
})

test('the live board puts the finished first by time, then the runners by gates passed, the disqualified last', () => {
  const live: SportsRunStatePayload = {
    ...state,
    runners: [
      { ...runner, sessionId: 'a', name: 'A', lane: 1, gate: 2 },
      { ...runner, sessionId: 'b', name: 'B', lane: 2, state: 'dnf', dnf: 'false_start', gate: 0 },
      { ...runner, sessionId: 'c', name: 'C', lane: 3, state: 'finished', gate: 4, timeMs: 12_100 },
      { ...runner, sessionId: 'd', name: 'D', lane: 4, gate: 3 },
    ],
  }
  assert.deepEqual(liveBoardRows(live).map((r) => [r.name, r.place, r.status]), [
    ['C', 1, { kind: 'time', ms: 12_100 }],
    ['D', 2, { kind: 'progress', percent: 75 }],
    ['A', 3, { kind: 'progress', percent: 50 }],
    ['B', null, { kind: 'dnf', dnf: 'false_start' }],
  ])
})

test('the result board lists the places then the runners who did not finish', () => {
  const result: SportsRunResultPayload = {
    venue: 'athletics_track',
    distanceM: 100,
    results: [
      { sessionId: 'x', name: 'X', accountId: 1, result: 'dnf', dnf: 'missed_gate' },
      { sessionId: 'y', name: 'Y', accountId: 2, result: 'finished', place: 1, timeMs: 11_900, dnf: null },
    ],
  }
  assert.deepEqual(resultBoardRows(result).map((r) => [r.name, r.place]), [['Y', 1], ['X', null]])
})

test('the scoreboard spot comes from the running rules', () => {
  const rules = JSON.parse(readFileSync(new URL('../../../public/assets/sports/rules/running.json', import.meta.url), 'utf8'))
  assert.deepEqual(parseScoreboard(rules), { x: -436, z: -342, heightM: 4.5 })
  assert.throws(() => parseScoreboard({}), /scoreboard/)
})

test('the weekly board shows the top three of each distance, shortest distance first, and the week number', () => {
  const entry = (i: number) => ({ rank: i, accountId: i, name: `R${i}`, value: 11_000 + i })
  const run100 = parseSportsBoard({ board: { board: 'run_100', week: '2026-W46', entries: [1, 2, 3, 4].map(entry), champion: null } })
  assert.deepEqual(run100.entries[0], { accountId: 1, name: 'R1', timeMs: 11_001 })
  const sections = weekBoardSections({ week: run100.week, boards: { 1500: [], 100: run100.entries, 400: [{ accountId: 9, name: 'Z', timeMs: 50_000 }] } })
  assert.deepEqual(sections.map((s) => [s.distanceM, s.rows.map((r) => r.name)]), [[100, ['R1', 'R2', 'R3']], [400, ['Z']], [1500, []]])
  assert.equal(weekNumber(run100.week), 46)
  assert.throws(() => parseSportsBoard({ board: { week: '2026-W46', entries: [{ name: 'x' }] } }))
})

test('the boards come from the running rules, one per distance', () => {
  const rules = JSON.parse(readFileSync(new URL('../../../public/assets/sports/rules/running.json', import.meta.url), 'utf8'))
  assert.deepEqual(parseBoardIds(rules), [{ id: 'run_100', distanceM: 100 }, { id: 'run_400', distanceM: 400 }, { id: 'run_1500', distanceM: 1500 }])
  assert.throws(() => parseBoardIds({ boards: ['swim_50'] }), /board id/)
})

test('other runners crouch on the line, dip at the finish and stand up when out', () => {
  assert.equal(poseChange(undefined, 'set'), 'set')
  assert.equal(poseChange('set', 'running'), 'clear')
  assert.equal(poseChange('running', 'running'), null)
  assert.equal(poseChange('running', 'finished'), 'lean')
  assert.equal(poseChange('set', 'dnf'), 'clear')
})
