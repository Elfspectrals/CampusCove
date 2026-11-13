import {
  QUIZ_ANSWER_MS,
  QUIZ_POINTS_BASE,
  QUIZ_POINTS_SPEED,
  QUIZ_START_HOUR,
  QUIZ_TIME_ZONE
} from './pubConstants.ts'

export interface QuizText {
  fr: string
  en: string
}

export type QuizChoice = 0 | 1 | 2 | 3

export interface QuizQuestion {
  topic: 'world' | 'general'
  prompt: QuizText
  choices: readonly [QuizText, QuizText, QuizText, QuizText]
  answer: QuizChoice
}

export interface QuizContestant {
  accountId: number
  pseudo: string
  points: number
  answered: number
  answerMs: number
}

interface QuizAnswer {
  choice: QuizChoice
  elapsedMs: number
}

export type QuizPhase =
  | { kind: 'registration' }
  | { kind: 'question', index: number, openedAt: number, answers: Map<string, QuizAnswer> }
  | { kind: 'finished' }

export interface PubQuiz {
  id: string
  startsAt: number
  questions: readonly QuizQuestion[]
  contestants: Map<string, QuizContestant>
  phase: QuizPhase
}

export type QuizJoinResult = 'ok' | 'already_joined' | 'started'
export type QuizAnswerResult = 'ok' | 'not_contestant' | 'no_question' | 'too_late' | 'already_answered'

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const zoneParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: QUIZ_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})

function wallClockAsUtc(ms: number): number {
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(zoneParts.formatToParts(ms).find((p) => p.type === type)?.value)
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
}

function zoneOffsetMs(ms: number): number {
  return wallClockAsUtc(ms) - Math.floor(ms / 1000) * 1000
}

function quizStartOnWallDay(wallDayUtc: number): number {
  const wallStart = wallDayUtc + QUIZ_START_HOUR * HOUR_MS
  const firstGuess = wallStart - zoneOffsetMs(wallStart)
  return wallStart - zoneOffsetMs(firstGuess)
}

export function quizStartAfter(nowMs: number): number {
  const wallNow = wallClockAsUtc(nowMs)
  const wallToday = wallNow - (wallNow % DAY_MS)
  const today = quizStartOnWallDay(wallToday)
  return today > nowMs ? today : quizStartOnWallDay(wallToday + DAY_MS)
}

export function pickQuizQuestions(bank: readonly QuizQuestion[], count: number, random: () => number): QuizQuestion[] {
  if (count > bank.length) throw new Error(`quiz bank holds ${bank.length} questions, ${count} asked`)
  const pool = [...bank]
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (pool.length - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, count)
}

export function createQuiz(id: string, startsAt: number, questions: readonly QuizQuestion[]): PubQuiz {
  return { id, startsAt, questions, contestants: new Map(), phase: { kind: 'registration' } }
}

export function joinQuiz(quiz: PubQuiz, sessionId: string, accountId: number, pseudo: string): QuizJoinResult {
  if (quiz.phase.kind !== 'registration') return 'started'
  if (quiz.contestants.has(sessionId)) return 'already_joined'
  quiz.contestants.set(sessionId, { accountId, pseudo, points: 0, answered: 0, answerMs: 0 })
  return 'ok'
}

export function withdrawFromQuiz(quiz: PubQuiz, sessionId: string): boolean {
  if (quiz.phase.kind === 'question') quiz.phase.answers.delete(sessionId)
  return quiz.contestants.delete(sessionId)
}

export function openNextQuestion(quiz: PubQuiz, now: number): QuizQuestion | null {
  const index = quiz.phase.kind === 'question' ? quiz.phase.index + 1 : 0
  if (quiz.phase.kind === 'finished' || index >= quiz.questions.length) {
    quiz.phase = { kind: 'finished' }
    return null
  }
  quiz.phase = { kind: 'question', index, openedAt: now, answers: new Map() }
  return quiz.questions[index]
}

export function answerQuiz(quiz: PubQuiz, sessionId: string, choice: QuizChoice, now: number): QuizAnswerResult {
  if (!quiz.contestants.has(sessionId)) return 'not_contestant'
  if (quiz.phase.kind !== 'question') return 'no_question'
  const elapsedMs = now - quiz.phase.openedAt
  if (elapsedMs >= QUIZ_ANSWER_MS) return 'too_late'
  if (quiz.phase.answers.has(sessionId)) return 'already_answered'
  quiz.phase.answers.set(sessionId, { choice, elapsedMs })
  return 'ok'
}

export function answerPoints(elapsedMs: number): number {
  return Math.round(QUIZ_POINTS_BASE + (QUIZ_POINTS_SPEED * (QUIZ_ANSWER_MS - elapsedMs)) / QUIZ_ANSWER_MS)
}

export function closeQuestion(quiz: PubQuiz): QuizChoice {
  if (quiz.phase.kind !== 'question') throw new Error(`no open question to close (phase ${quiz.phase.kind})`)
  const { answers, index } = quiz.phase
  const { answer } = quiz.questions[index]
  for (const [sessionId, contestant] of quiz.contestants) {
    const given = answers.get(sessionId)
    if (!given) {
      contestant.answerMs += QUIZ_ANSWER_MS
      continue
    }
    contestant.answered += 1
    contestant.answerMs += given.elapsedMs
    if (given.choice === answer) contestant.points += answerPoints(given.elapsedMs)
  }
  return answer
}

export function quizRanking(quiz: PubQuiz): Array<QuizContestant & { sessionId: string }> {
  return [...quiz.contestants]
    .map(([sessionId, contestant]) => ({ sessionId, ...contestant }))
    .sort((a, b) => b.points - a.points || a.answerMs - b.answerMs)
}

export function parseQuizChoice(raw: unknown): QuizChoice | null {
  return raw === 0 || raw === 1 || raw === 2 || raw === 3 ? raw : null
}
