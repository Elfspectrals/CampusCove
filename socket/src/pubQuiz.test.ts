import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QUIZ_ANSWER_MS, QUIZ_QUESTION_COUNT } from './pubConstants.ts'
import {
  answerPoints,
  answerQuiz,
  closeQuestion,
  createQuiz,
  joinQuiz,
  openNextQuestion,
  parseQuizChoice,
  pickQuizQuestions,
  quizRanking,
  quizStartAfter,
  withdrawFromQuiz,
  type QuizQuestion
} from './pubQuiz.ts'
import { QUIZ_BANK } from './pubQuizQuestions.ts'

const T0 = 1_000_000

function question(answer: 0 | 1 | 2 | 3): QuizQuestion {
  const t = { fr: 'x', en: 'x' }
  return { topic: 'general', prompt: t, choices: [t, t, t, t], answer }
}

function quizWith(...answers: Array<0 | 1 | 2 | 3>) {
  const quiz = createQuiz('quiz-1', T0, answers.map(question))
  joinQuiz(quiz, 'a', 1, 'Ana')
  joinQuiz(quiz, 'b', 2, 'Bob')
  return quiz
}

test('the quiz starts at 21:00 Paris time, winter and summer', () => {
  assert.equal(quizStartAfter(Date.parse('2026-11-13T12:00:00Z')), Date.parse('2026-11-13T20:00:00Z'))
  assert.equal(quizStartAfter(Date.parse('2026-07-01T12:00:00Z')), Date.parse('2026-07-01T19:00:00Z'))
})

test('at or after 21:00 the next quiz is the next evening', () => {
  assert.equal(quizStartAfter(Date.parse('2026-11-13T20:00:00Z')), Date.parse('2026-11-14T20:00:00Z'))
  assert.equal(quizStartAfter(Date.parse('2026-11-13T19:59:59Z')), Date.parse('2026-11-13T20:00:00Z'))
  assert.equal(quizStartAfter(Date.parse('2026-11-13T23:30:00Z')), Date.parse('2026-11-14T20:00:00Z'))
})

test('the start follows the clock change days', () => {
  assert.equal(quizStartAfter(Date.parse('2026-03-29T00:30:00Z')), Date.parse('2026-03-29T19:00:00Z'))
  assert.equal(quizStartAfter(Date.parse('2026-10-25T00:30:00Z')), Date.parse('2026-10-25T20:00:00Z'))
})

test('a right answer is worth 1000 at once, 750 at half time, 500 at the buzzer', () => {
  assert.equal(answerPoints(0), 1000)
  assert.equal(answerPoints(7500), 750)
  assert.equal(answerPoints(QUIZ_ANSWER_MS - 1), 500)
})

test('an answer at 15 s or later is refused', () => {
  const quiz = quizWith(0)
  openNextQuestion(quiz, T0)
  assert.equal(answerQuiz(quiz, 'a', 0, T0 + QUIZ_ANSWER_MS - 1), 'ok')
  assert.equal(answerQuiz(quiz, 'b', 0, T0 + QUIZ_ANSWER_MS), 'too_late')
})

test('one answer per question, contestants only, while a question is open', () => {
  const quiz = quizWith(0)
  assert.equal(answerQuiz(quiz, 'a', 0, T0), 'no_question')
  openNextQuestion(quiz, T0)
  assert.equal(answerQuiz(quiz, 'stranger', 0, T0), 'not_contestant')
  assert.equal(answerQuiz(quiz, 'a', 1, T0 + 100), 'ok')
  assert.equal(answerQuiz(quiz, 'a', 0, T0 + 200), 'already_answered')
})

test('joining is open only before the first question', () => {
  const quiz = quizWith(0)
  assert.equal(joinQuiz(quiz, 'a', 1, 'Ana'), 'already_joined')
  openNextQuestion(quiz, T0)
  assert.equal(joinQuiz(quiz, 'c', 3, 'Cy'), 'started')
})

test('closing scores right answers, counts answers and charges a silent player the full time', () => {
  const quiz = quizWith(2)
  openNextQuestion(quiz, T0)
  answerQuiz(quiz, 'a', 2, T0 + 3000)
  assert.equal(closeQuestion(quiz), 2)
  const [first, second] = quizRanking(quiz)
  assert.deepEqual([first.sessionId, first.points, first.answered, first.answerMs], ['a', 900, 1, 3000])
  assert.deepEqual([second.sessionId, second.points, second.answered, second.answerMs], ['b', 0, 0, QUIZ_ANSWER_MS])
})

test('a wrong answer scores nothing but counts as answered', () => {
  const quiz = quizWith(2)
  openNextQuestion(quiz, T0)
  answerQuiz(quiz, 'a', 1, T0)
  closeQuestion(quiz)
  const ana = quiz.contestants.get('a')!
  assert.deepEqual([ana.points, ana.answered], [0, 1])
})

test('equal points are split by the smaller total answer time', () => {
  const quiz = quizWith(0, 1)
  openNextQuestion(quiz, T0)
  answerQuiz(quiz, 'a', 0, T0 + 1000)
  answerQuiz(quiz, 'b', 3, T0 + 1500)
  closeQuestion(quiz)
  openNextQuestion(quiz, T0 + 20_000)
  answerQuiz(quiz, 'a', 3, T0 + 22_000)
  answerQuiz(quiz, 'b', 1, T0 + 21_000)
  closeQuestion(quiz)
  assert.deepEqual(quizRanking(quiz).map((r) => [r.sessionId, r.points, r.answerMs]), [['b', 967, 2500], ['a', 967, 3000]])
})

test('the quiz finishes after its last question', () => {
  const quiz = quizWith(0)
  assert.notEqual(openNextQuestion(quiz, T0), null)
  closeQuestion(quiz)
  assert.equal(openNextQuestion(quiz, T0 + 20_000), null)
  assert.equal(quiz.phase.kind, 'finished')
})

test('a player who leaves drops out of the ranking', () => {
  const quiz = quizWith(0)
  openNextQuestion(quiz, T0)
  answerQuiz(quiz, 'b', 0, T0)
  assert.equal(withdrawFromQuiz(quiz, 'b'), true)
  closeQuestion(quiz)
  assert.deepEqual(quizRanking(quiz).map((r) => r.sessionId), ['a'])
})

test('only 0 to 3 are valid choices', () => {
  assert.equal(parseQuizChoice(3), 3)
  for (const raw of [4, -1, 1.5, '1', null, undefined]) assert.equal(parseQuizChoice(raw), null)
})

test('questions are drawn without repeats', () => {
  let seed = 7
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const picked = pickQuizQuestions(QUIZ_BANK, QUIZ_QUESTION_COUNT, random)
  assert.equal(picked.length, QUIZ_QUESTION_COUNT)
  assert.equal(new Set(picked).size, QUIZ_QUESTION_COUNT)
  assert.throws(() => pickQuizQuestions(QUIZ_BANK.slice(0, 2), 3, random))
})

test('the bank holds distinct, filled, bilingual questions with four distinct choices', () => {
  assert.ok(QUIZ_BANK.length >= QUIZ_QUESTION_COUNT * 3)
  assert.equal(new Set(QUIZ_BANK.map((q) => q.prompt.en)).size, QUIZ_BANK.length)
  for (const q of QUIZ_BANK) {
    for (const lang of ['fr', 'en'] as const) {
      assert.ok(q.prompt[lang].trim(), q.prompt.en)
      assert.equal(new Set(q.choices.map((c) => c[lang])).size, 4, `${q.prompt.en} (${lang})`)
    }
  }
  assert.ok(QUIZ_BANK.filter((q) => q.topic === 'world').length >= QUIZ_BANK.length / 4)
})
