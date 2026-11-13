import assert from 'node:assert/strict'
import { test } from 'node:test'
import { choiceForKey, quizRows, quizText, secondsLeft, seesQuizBoard } from './quiz.ts'

test('the question shows in the player language', () => {
  const text = { fr: 'Capitale ?', en: 'Capital?' }
  assert.equal(quizText(text, 'fr'), 'Capitale ?')
  assert.equal(quizText(text, 'en'), 'Capital?')
})

test('the timer rounds up and stops at zero', () => {
  assert.equal(secondsLeft(15_000, 0), 15)
  assert.equal(secondsLeft(15_000, 14_001), 1)
  assert.equal(secondsLeft(15_000, 15_000), 0)
  assert.equal(secondsLeft(15_000, 16_000), 0)
})

test('keys 1 to 4 pick an answer, other keys do not', () => {
  assert.equal(choiceForKey('Digit1'), 0)
  assert.equal(choiceForKey('Digit4'), 3)
  assert.equal(choiceForKey('Numpad2'), 1)
  assert.equal(choiceForKey('Digit5'), null)
  assert.equal(choiceForKey('KeyW'), null)
})

test('ranking rows number the places and flag the player', () => {
  const rows = quizRows([{ sessionId: 'b', pseudo: 'Bob', points: 900 }, { sessionId: 'a', pseudo: 'Ana', points: 900 }], 'a')
  assert.deepEqual(rows.map((r) => [r.place, r.pseudo, r.me]), [[1, 'Bob', false], [2, 'Ana', true]])
})

test('only nearby players who are not playing see the board over the host', () => {
  const host = [94.6, 0.2, -129.8] as const
  assert.equal(seesQuizBoard({ x: 90, y: 1.8, z: -130 }, host, false), true)
  assert.equal(seesQuizBoard({ x: 90, y: 1.8, z: -130 }, host, true), false)
  assert.equal(seesQuizBoard({ x: 80, y: 1.8, z: -130 }, host, false), false)
  assert.equal(seesQuizBoard({ x: 90, y: -1.4, z: -130 }, host, false), false)
})
