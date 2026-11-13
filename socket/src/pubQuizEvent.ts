import { callRealtimeBackend, errorPayload } from './backend.ts'
import { forEachPubClient, inPubZone, isWithinPubReach, sendPubError } from './pub.ts'
import {
  QUIZ_ADMIN_LEAD_MS,
  QUIZ_ANNOUNCE_MS,
  QUIZ_ANSWER_MS,
  QUIZ_LAST_CALL_MS,
  QUIZ_MIN_CONTESTANTS,
  QUIZ_QUESTION_COUNT,
  QUIZ_REVEAL_MS,
  QUIZMASTER_REACH
} from './pubConstants.ts'
import {
  type PubQuiz,
  type QuizQuestion,
  answerQuiz,
  closeQuestion,
  createQuiz,
  joinQuiz,
  openNextQuestion,
  parseQuizChoice,
  pickQuizQuestions,
  quizRanking,
  quizStartAfter,
  withdrawFromQuiz
} from './pubQuiz.ts'
import { QUIZ_BANK } from './pubQuizQuestions.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'
import { worldPub } from './world.ts'

const ERRORS = {
  closed: 'The quiz is not taking names right now.',
  outside: 'Come and see the quiz host to join.',
  started: 'The quiz has already started.',
  already_joined: 'You are already in.',
  not_contestant: 'You are not playing this quiz.',
  no_question: 'No question is open.',
  too_late: 'Time is up.',
  already_answered: 'You already answered.',
  invalid_choice: 'Pick one of the four answers.'
} as const

function later(room: GameRoom, ms: number, task: () => void): void {
  const schedule = room.pub.quizSchedule
  room.clock.setTimeout(() => {
    if (room.pub.quizSchedule === schedule) task()
  }, Math.max(0, ms))
}

function publicRanking(quiz: PubQuiz) {
  return quizRanking(quiz).map(({ sessionId, pseudo, points }) => ({ sessionId, pseudo, points }))
}

function lobby(quiz: PubQuiz) {
  return { startsAt: quiz.startsAt, contestants: [...quiz.contestants].map(([sessionId, c]) => ({ sessionId, pseudo: c.pseudo })) }
}

function questionPayload(quiz: PubQuiz, question: QuizQuestion, openedAt: number) {
  const index = quiz.phase.kind === 'question' ? quiz.phase.index : -1
  return { index, count: quiz.questions.length, prompt: question.prompt, choices: question.choices, closesAt: openedAt + QUIZ_ANSWER_MS }
}

function announce(room: GameRoom, quiz: PubQuiz): void {
  room.forEachClient((c) => c.send('pub_quiz_announce', { startsAt: quiz.startsAt }))
}

function dropAbsentContestants(room: GameRoom, quiz: PubQuiz): void {
  for (const sessionId of [...quiz.contestants.keys()]) {
    const player = room.players.get(sessionId)
    if (!player || !inPubZone(player)) withdrawFromQuiz(quiz, sessionId)
  }
}

export function scheduleNextQuiz(room: GameRoom, now = Date.now()): void {
  room.pub.quizSchedule += 1
  room.pub.quiz = null
  const startsAt = quizStartAfter(now)
  later(room, startsAt - QUIZ_ANNOUNCE_MS - now, () => openRegistration(room, startsAt, `${room.roomId}:${startsAt}`, Date.now()))
}

export function openRegistration(room: GameRoom, startsAt: number, id: string, now: number, random: () => number = Math.random): void {
  const quiz = createQuiz(id, startsAt, pickQuizQuestions(QUIZ_BANK, QUIZ_QUESTION_COUNT, random))
  room.pub.quiz = quiz
  announce(room, quiz)
  if (startsAt - QUIZ_LAST_CALL_MS > now) later(room, startsAt - QUIZ_LAST_CALL_MS - now, () => announce(room, quiz))
  later(room, startsAt - now, () => startQuiz(room, quiz, Date.now()))
}

export function startQuizSoon(room: GameRoom, now = Date.now(), random: () => number = Math.random): void {
  room.pub.quizSchedule += 1
  const startsAt = now + QUIZ_ADMIN_LEAD_MS
  openRegistration(room, startsAt, `${room.roomId}:admin:${startsAt}`, now, random)
}

function startQuiz(room: GameRoom, quiz: PubQuiz, now: number): void {
  dropAbsentContestants(room, quiz)
  if (quiz.contestants.size < QUIZ_MIN_CONTESTANTS) {
    forEachPubClient(room, (c) => c.send('pub_quiz_cancelled', { reason: 'not_enough_players' }))
    scheduleNextQuiz(room, now)
    return
  }
  nextQuestion(room, quiz, now)
}

function nextQuestion(room: GameRoom, quiz: PubQuiz, now: number): void {
  const question = openNextQuestion(quiz, now)
  if (!question) {
    finishQuiz(room, quiz, now)
    return
  }
  const payload = questionPayload(quiz, question, now)
  forEachPubClient(room, (c) => c.send('pub_quiz_question', payload))
  later(room, QUIZ_ANSWER_MS, () => revealAnswer(room, quiz))
}

function revealAnswer(room: GameRoom, quiz: PubQuiz): void {
  const index = quiz.phase.kind === 'question' ? quiz.phase.index : -1
  const answer = closeQuestion(quiz)
  dropAbsentContestants(room, quiz)
  const payload = { index, answer, ranking: publicRanking(quiz) }
  forEachPubClient(room, (c) => c.send('pub_quiz_reveal', payload))
  if (quiz.contestants.size === 0) {
    scheduleNextQuiz(room)
    return
  }
  later(room, QUIZ_REVEAL_MS, () => nextQuestion(room, quiz, Date.now()))
}

function finishQuiz(room: GameRoom, quiz: PubQuiz, now: number): void {
  const ranking = publicRanking(quiz)
  forEachPubClient(room, (c) => c.send('pub_quiz_results', { ranking }))
  scheduleNextQuiz(room, now)
  void payWinner(room, quiz)
}

async function payWinner(room: GameRoom, quiz: PubQuiz): Promise<void> {
  const [winner] = quizRanking(quiz)
  const player = winner && room.players.get(winner.sessionId)
  if (!player?.token) return
  const contestants = [...quiz.contestants.values()].map(({ accountId, answered }) => ({ account_id: accountId, answered }))
  try {
    const prize = await callRealtimeBackend(player.token, '/pub/quiz/reward', 'POST', { quiz_id: quiz.id, contestants })
    if (typeof prize?.coins !== 'number' || typeof prize?.pint !== 'boolean') throw new Error('The quiz prize answer is malformed.')
    const payload = { sessionId: winner.sessionId, pseudo: winner.pseudo, coins: prize.coins, pint: prize.pint }
    forEachPubClient(room, (c) => c.send('pub_quiz_prize', payload))
  } catch (error) {
    console.warn('[pub] quiz reward failed:', error instanceof Error ? error.message : error)
    room.clients.find((c) => c.sessionId === winner.sessionId)?.send('pub_error', errorPayload(error, 'Your quiz prize could not be paid.', 'quiz_reward_failed'))
  }
}

export function quizSnapshot(room: GameRoom): { startsAt: number } | null {
  const quiz = room.pub.quiz
  return quiz?.phase.kind === 'registration' ? { startsAt: quiz.startsAt } : null
}

export function withdrawFromPubQuiz(room: GameRoom, player: Player): void {
  const quiz = room.pub.quiz
  if (quiz && withdrawFromQuiz(quiz, player.sessionId) && quiz.phase.kind === 'registration') {
    const payload = lobby(quiz)
    forEachPubClient(room, (c) => c.send('pub_quiz_lobby', payload))
  }
}

export function onQuizJoin(room: GameRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  const quiz = room.pub.quiz
  if (!player) return
  if (!quiz) return sendPubError(client, ERRORS.closed, 'quiz_closed')
  const pub = worldPub()
  if (!pub || !isWithinPubReach(player, pub.quizmaster, QUIZMASTER_REACH)) return sendPubError(client, ERRORS.outside, 'quiz_outside')
  const result = joinQuiz(quiz, client.sessionId, player.accountId, player.pseudo)
  if (result !== 'ok') return sendPubError(client, ERRORS[result], `quiz_${result}`)
  const payload = lobby(quiz)
  forEachPubClient(room, (c) => c.send('pub_quiz_lobby', payload))
}

export function onQuizAnswer(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const quiz = room.pub.quiz
  if (!quiz) return sendPubError(client, ERRORS.no_question, 'quiz_no_question')
  const choice = parseQuizChoice(payload?.choice)
  if (choice === null) return sendPubError(client, ERRORS.invalid_choice, 'quiz_invalid_choice')
  const result = answerQuiz(quiz, client.sessionId, choice, now)
  if (result !== 'ok') return sendPubError(client, ERRORS[result], `quiz_${result}`)
  client.send('pub_quiz_answered', { choice })
}
