import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NOTE_LEAD_MS, NOTE_TAIL_MS, danceBoardId, danceTimeScale, fallingNotes, laneOfKey, parseDanceStart, songTimeMs } from './danceHud.ts'

const azerty = (action: string, code: string) =>
  ({ moveForward: 'KeyW', moveBack: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD' } as Record<string, string>)[action] === code

const START = {
  venue: 'dance_studio',
  mode: 'duel',
  song: 'cove_groove',
  difficulty: 'easy',
  bpm: 112,
  lengthMs: 90_000,
  startAt: 10_000,
  serverNow: 6_000,
  notes: [[2143, 1], [3214, 3], [4286, 0]],
  dancers: [{ sessionId: 'a', name: 'Ana' }],
}

test('arrows and the bound movement keys pick the four lanes, left down up right', () => {
  assert.deepEqual(['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'].map((c) => laneOfKey(c, azerty)), [0, 1, 2, 3])
  assert.deepEqual(['KeyA', 'KeyS', 'KeyW', 'KeyD'].map((c) => laneOfKey(c, azerty)), [0, 1, 2, 3])
  assert.equal(laneOfKey('KeyE', azerty), null)
})

test('dance_start is parsed into indexed notes and refuses a bad lane', () => {
  const start = parseDanceStart(START)
  assert.deepEqual(start.notes[1], { index: 1, t: 3214, lane: 3 })
  assert.throws(() => parseDanceStart({ ...START, notes: [[100, 4]] }), /lane/)
  assert.throws(() => parseDanceStart({ ...START, mode: 'battle' }), /mode/)
})

test('song time follows the server clock through the offset', () => {
  const start = parseDanceStart(START)
  assert.equal(songTimeMs(start, 5_000, 5_000), 0)
  assert.equal(songTimeMs(start, 5_500, 5_000), 500)
})

test('a note shows from its lead time, reaches the line at progress 1 and drops once judged or past its tail', () => {
  const notes = parseDanceStart(START).notes
  const t = notes[0].t
  assert.equal(fallingNotes(notes, t - NOTE_LEAD_MS - 1, new Set()).length, 0)
  assert.equal(fallingNotes(notes, t - NOTE_LEAD_MS, new Set())[0].progress, 0)
  assert.equal(fallingNotes(notes, t, new Set())[0].progress, 1)
  assert.equal(fallingNotes(notes, t + NOTE_TAIL_MS, new Set())[0]?.index, 0)
  assert.equal(fallingNotes(notes, t + NOTE_TAIL_MS + 1, new Set())[0]?.index, 1)
  assert.equal(fallingNotes(notes, t, new Set([0]))[0]?.index, 1)
})

test('the 4-beat dance clip plays at song speed', () => {
  assert.equal(danceTimeScale(120), 1)
  assert.equal(danceTimeScale(90), 0.75)
})

test('a song and difficulty name their solo and team core boards', () => {
  assert.equal(danceBoardId('cove_groove', 'hard', 'solo'), 'dance_cove_groove_hard_solo')
  assert.equal(danceBoardId('night_sprint', 'easy', 'team'), 'dance_night_sprint_easy_team')
})
