import type { Team } from './signup.ts'

export type TennisFormat = 'short_set_4' | 'tiebreak_7'

export const TENNIS_FORMATS: readonly TennisFormat[] = ['short_set_4', 'tiebreak_7']
export const SET_GAMES = 4
export const TIEBREAK_POINTS = 7
const GAME_POINTS = 4
const CLEAR_BY = 2
const GAME_LABELS = ['0', '15', '30', '40']

export interface TennisScore {
  format: TennisFormat
  games: Record<Team, number>
  points: Record<Team, number>
  tiebreak: boolean
  tiebreakOpener: Team
  serving: Team
  winner: Team | null
}

export function other(team: Team): Team {
  return team === 'red' ? 'blue' : 'red'
}

export function parseFormat(raw: unknown): TennisFormat {
  if (!TENNIS_FORMATS.includes(raw as TennisFormat)) throw new Error(`tennis: unknown format ${JSON.stringify(raw)}`)
  return raw as TennisFormat
}

export function newScore(format: TennisFormat, firstServer: Team): TennisScore {
  return {
    format,
    games: { red: 0, blue: 0 },
    points: { red: 0, blue: 0 },
    tiebreak: format === 'tiebreak_7',
    tiebreakOpener: firstServer,
    serving: firstServer,
    winner: null
  }
}

function tiebreakServer(opener: Team, pointsPlayed: number): Team {
  return Math.floor((pointsPlayed + 1) / 2) % 2 === 0 ? opener : other(opener)
}

function wonBy(points: Record<Team, number>, team: Team, target: number): boolean {
  return points[team] >= target && points[team] - points[other(team)] >= CLEAR_BY
}

function winTiebreak(score: TennisScore, team: Team): void {
  if (score.format === 'short_set_4') score.games[team] += 1
  score.winner = team
}

function winGame(score: TennisScore, team: Team): void {
  score.games[team] += 1
  score.points = { red: 0, blue: 0 }
  if (score.games[team] === SET_GAMES) {
    score.winner = team
    return
  }
  score.serving = other(score.serving)
  if (score.games.red === SET_GAMES - 1 && score.games.blue === SET_GAMES - 1) {
    score.tiebreak = true
    score.tiebreakOpener = score.serving
  }
}

export function awardPoint(score: TennisScore, team: Team): void {
  if (score.winner) throw new Error('tennis: point awarded after the end of the match')
  score.points[team] += 1
  if (score.tiebreak) {
    if (wonBy(score.points, team, TIEBREAK_POINTS)) {
      winTiebreak(score, team)
      return
    }
    score.serving = tiebreakServer(score.tiebreakOpener, score.points.red + score.points.blue)
    return
  }
  if (wonBy(score.points, team, GAME_POINTS)) winGame(score, team)
}

export function pointLabels(score: TennisScore): Record<Team, string> {
  const { red, blue } = score.points
  if (score.tiebreak) return { red: String(red), blue: String(blue) }
  if (red >= 3 && blue >= 3) {
    if (red === blue) return { red: '40', blue: '40' }
    return red > blue ? { red: 'AD', blue: '40' } : { red: '40', blue: 'AD' }
  }
  return { red: GAME_LABELS[red], blue: GAME_LABELS[blue] }
}
