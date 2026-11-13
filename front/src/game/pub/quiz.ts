import type { Locale } from '../../seo/site.ts'
import { standsOnFloor } from './npcAim.ts'

export interface QuizText {
  fr: string
  en: string
}

export type QuizChoice = 0 | 1 | 2 | 3

export interface QuizRankingEntry {
  sessionId: string
  pseudo: string
  points: number
}

export interface QuizRow extends QuizRankingEntry {
  place: number
  me: boolean
}

const SPECTATOR_RANGE = 12
const CHOICE_KEYS: Record<string, QuizChoice> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
}

type Point = { x: number; y: number; z: number }

export function quizText(text: QuizText, locale: Locale): string {
  return text[locale]
}

export function secondsLeft(closesAt: number, now: number): number {
  return Math.max(0, Math.ceil((closesAt - now) / 1000))
}

export function choiceForKey(code: string): QuizChoice | null {
  return CHOICE_KEYS[code] ?? null
}

export function quizRows(ranking: readonly QuizRankingEntry[], mySessionId: string): QuizRow[] {
  return ranking.map((entry, i) => ({ ...entry, place: i + 1, me: entry.sessionId === mySessionId }))
}

export function seesQuizBoard(eye: Point, host: readonly [number, number, number], contestant: boolean): boolean {
  if (contestant || !standsOnFloor(eye.y, host[1])) return false
  return Math.hypot(host[0] - eye.x, host[2] - eye.z) <= SPECTATOR_RANGE
}
