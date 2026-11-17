import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Team } from './signup.ts'
import { type TennisScore, awardPoint, newScore, parseFormat, pointLabels } from './tennisScore.ts'

function play(score: TennisScore, ...teams: Team[]): void {
  for (const team of teams) awardPoint(score, team)
}

function games(score: TennisScore, team: Team, count: number): void {
  for (let i = 0; i < count; i++) play(score, team, team, team, team)
}

test('a game goes 0, 15, 30, 40, game, and the serve passes to the other team', () => {
  const score = newScore('short_set_4', 'red')
  assert.deepEqual(pointLabels(score), { red: '0', blue: '0' })
  play(score, 'red')
  assert.deepEqual(pointLabels(score), { red: '15', blue: '0' })
  play(score, 'blue', 'red', 'red')
  assert.deepEqual(pointLabels(score), { red: '40', blue: '15' })
  play(score, 'red')
  assert.deepEqual(score.games, { red: 1, blue: 0 })
  assert.deepEqual(pointLabels(score), { red: '0', blue: '0' })
  assert.equal(score.serving, 'blue')
})

test('deuce and advantage: a game needs two points clear', () => {
  const score = newScore('short_set_4', 'red')
  play(score, 'red', 'red', 'red', 'blue', 'blue', 'blue')
  assert.deepEqual(pointLabels(score), { red: '40', blue: '40' })
  play(score, 'blue')
  assert.deepEqual(pointLabels(score), { red: '40', blue: 'AD' })
  play(score, 'red')
  assert.deepEqual(pointLabels(score), { red: '40', blue: '40' })
  play(score, 'red', 'red')
  assert.deepEqual(score.games, { red: 1, blue: 0 })
})

test('the short set ends at 4 games', () => {
  const score = newScore('short_set_4', 'blue')
  games(score, 'red', 3)
  assert.equal(score.winner, null)
  games(score, 'red', 1)
  assert.deepEqual(score.games, { red: 4, blue: 0 })
  assert.equal(score.winner, 'red')
  assert.throws(() => awardPoint(score, 'blue'))
})

test('at 3-3 the set goes to a tie-break to 7, two clear, that gives the set 4-3', () => {
  const score = newScore('short_set_4', 'red')
  for (let i = 0; i < 3; i++) {
    games(score, 'red', 1)
    games(score, 'blue', 1)
  }
  assert.equal(score.tiebreak, true)
  assert.equal(score.serving, 'red')
  const servers: Team[] = [score.serving]
  for (let i = 0; i < 6; i++) {
    play(score, i % 2 === 0 ? 'red' : 'blue')
    servers.push(score.serving)
  }
  assert.deepEqual(servers, ['red', 'blue', 'blue', 'red', 'red', 'blue', 'blue'])
  assert.deepEqual(pointLabels(score), { red: '3', blue: '3' })
  play(score, 'red', 'red', 'red')
  assert.equal(score.winner, null)
  play(score, 'blue', 'blue', 'blue')
  assert.deepEqual(pointLabels(score), { red: '6', blue: '6' })
  play(score, 'blue', 'blue')
  assert.equal(score.winner, 'blue')
  assert.deepEqual(score.games, { red: 3, blue: 4 })
})

test('the tie-break format is one tie-break to 7, two clear, without games', () => {
  const score = newScore('tiebreak_7', 'blue')
  assert.equal(score.tiebreak, true)
  play(score, 'red', 'red', 'red', 'red', 'red', 'red', 'blue', 'blue', 'blue', 'blue', 'blue')
  assert.equal(score.winner, null)
  play(score, 'red')
  assert.equal(score.winner, 'red')
  assert.deepEqual(score.points, { red: 7, blue: 5 })
  assert.deepEqual(score.games, { red: 0, blue: 0 })
})

test('an unknown format is refused', () => {
  assert.equal(parseFormat('tiebreak_7'), 'tiebreak_7')
  assert.throws(() => parseFormat('five_sets'))
})
