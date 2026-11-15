import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  type DanceGame,
  INTRO_BEATS,
  OUTRO_BEATS,
  beatMs,
  buildChart,
  danceResults,
  expireNotes,
  newDanceGame,
  parseDanceRules,
  pressError,
  pressLane,
  songOver,
  teamScore
} from './danceGame.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/dance.json', import.meta.url), 'utf8'))
const rules = parseDanceRules(RAW)
const song = rules.songs[0]
const START = 1_000_000

function game(mode: 'solo' | 'team' | 'duel' = 'solo', count = 1): DanceGame {
  const dancers = Array.from({ length: count }, (_, i) => ({ accountId: i + 1, sessionId: `s${i + 1}`, name: `P${i + 1}` }))
  return newDanceGame(mode, song, 'easy', START, dancers)
}

function pressFirstAt(g: DanceGame, offsetMs: number, dancer = 0) {
  const note = g.notes[0]
  return pressLane(g, g.dancers[dancer], note.lane, START + note.t + offsetMs, rules)
}

test('the shipped rules parse with the windows the contract states', () => {
  assert.deepEqual(rules.windowsMs, { perfect: 45, good: 110 })
  assert.equal(rules.allowanceMs, 120)
  assert.deepEqual(rules.songs.map((s) => s.id), ['harbour_sway', 'cove_groove', 'night_sprint'])
})

test('pressError: zero inside the allowance window, distance to it outside', () => {
  assert.equal(pressError(1000, 1000, 120), 0)
  assert.equal(pressError(1000, 1120, 120), 0)
  assert.equal(pressError(1000, 1165, 120), 45)
  assert.equal(pressError(1000, 955, 120), 45)
})

test('judgement boundaries: late side includes the 120 ms allowance', () => {
  const cases: [number, string][] = [
    [0, 'perfect'], [120, 'perfect'], [165, 'perfect'], [166, 'good'], [230, 'good'], [231, 'stray'],
    [-45, 'perfect'], [-46, 'good'], [-110, 'good'], [-111, 'stray']
  ]
  for (const [offset, expected] of cases) {
    const outcome = pressFirstAt(game(), offset)
    const got = outcome.kind === 'judged' ? outcome.judged.judgement : outcome.kind
    assert.equal(got, expected, `offset ${offset} ms`)
  }
})

test('a stray press breaks the combo and a second press on the same lane within 80 ms is ignored', () => {
  const g = game()
  assert.equal(pressFirstAt(g, 0).kind, 'judged')
  assert.equal(g.dancers[0].combo, 1)
  assert.equal(pressFirstAt(g, 79).kind, 'ignored')
  assert.equal(pressFirstAt(g, 80).kind, 'stray')
  assert.equal(g.dancers[0].combo, 0)
})

test('presses outside a lane or before the song are ignored', () => {
  const g = game()
  assert.equal(pressLane(g, g.dancers[0], 4, START + g.notes[0].t, rules).kind, 'ignored')
  assert.equal(pressLane(g, g.dancers[0], Number.NaN, START + g.notes[0].t, rules).kind, 'ignored')
  assert.equal(pressLane(g, g.dancers[0], 0, START - 111, rules).kind, 'ignored')
})

test('a note is missed once its late window is past, not before', () => {
  const g = game()
  const t = g.notes[0].t
  assert.equal(expireNotes(g, START + t + 230, rules).length, 0)
  const missed = expireNotes(g, START + t + 231, rules)
  assert.equal(missed.length, 1)
  assert.equal(missed[0].judgement, 'miss')
  assert.equal(expireNotes(g, START + t + 231, rules).length, 0)
})

test('score doubles once the combo reaches 40', () => {
  const g = game()
  for (let i = 0; i <= 40; i++) {
    const n = g.notes[i]
    pressLane(g, g.dancers[0], n.lane, START + n.t, rules)
  }
  const expected = Array.from({ length: 41 }, (_, i) => Math.round(300 * (1 + Math.min(i, 40) / 40))).reduce((a, b) => a + b, 0)
  assert.equal(g.dancers[0].score, expected)
  assert.equal(g.dancers[0].maxCombo, 41)
})

test('charts are seeded: same song and difficulty give the same notes, no lane three times in a row', () => {
  for (const s of rules.songs) {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      const a = buildChart(s, d)
      assert.deepEqual(a, buildChart(s, d))
      const beat = beatMs(s)
      assert.equal(a[0].t, Math.round(INTRO_BEATS * beat))
      assert.ok(a[a.length - 1].t <= s.lengthSec * 1000 - OUTRO_BEATS * beat + 1)
      for (let i = 2; i < a.length; i++) assert.ok(!(a[i].lane === a[i - 1].lane && a[i].lane === a[i - 2].lane))
      assert.ok(a.every((n) => Number.isInteger(n.lane) && n.lane >= 0 && n.lane < 4))
    }
  }
  assert.equal(buildChart(song, 'normal').length > buildChart(song, 'easy').length, true)
})

test('team mode: a note hit by every active dancer adds the sync bonus once', () => {
  const g = game('team', 2)
  const first = pressFirstAt(g, 0, 0)
  assert.equal(first.kind === 'judged' && first.judged.synced, false)
  const second = pressFirstAt(g, 60, 1)
  assert.equal(second.kind === 'judged' && second.judged.synced, true)
  assert.equal(teamScore(g), 600 + rules.syncBonus)
})

test('team mode: a dancer who left no longer blocks the sync bonus and keeps the score earned', () => {
  const g = game('team', 2)
  pressFirstAt(g, 0, 1)
  g.dancers[1].out = true
  const solo = pressFirstAt(g, 0, 0)
  assert.equal(solo.kind === 'judged' && solo.judged.synced, false)
  const results = danceResults(g)
  assert.deepEqual(results.map((r) => [r.result, r.score]), [['finished', 600], ['dnf', 300]])
})

test('duel results: best score wins, a tie on top is a draw, a dancer who left did not finish', () => {
  const g = game('duel', 3)
  g.dancers[0].score = 900
  g.dancers[1].score = 400
  g.dancers[2].score = 1200
  g.dancers[2].out = true
  assert.deepEqual(danceResults(g).map((r) => [r.result, r.place]), [['win', 1], ['loss', 2], ['dnf', undefined]])
  g.dancers[1].score = 900
  assert.deepEqual(danceResults(g).map((r) => r.result), ['draw', 'draw', 'dnf'])
})

test('the song is over after its length and the last late window', () => {
  const g = game()
  assert.equal(songOver(g, START + song.lengthSec * 1000 - 1, rules), false)
  assert.equal(songOver(g, START + song.lengthSec * 1000, rules), true)
})

test('rules missing a field fail fast', () => {
  assert.throws(() => parseDanceRules({ ...RAW, allowanceMs: null }), /allowanceMs/)
  assert.throws(() => parseDanceRules({ ...RAW, status: 'placeholder' }), /status/)
  assert.throws(() => parseDanceRules({ ...RAW, windowsMs: { perfect: 120, good: 110 } }), /perfect must be under good/)
})
