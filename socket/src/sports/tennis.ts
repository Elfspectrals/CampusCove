import type { ClientPayload, GameClient, GameRoom } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { type Match, type MatchPlayer, type SettingSpec, type Settings, type Team, activePlayers, matchPlayer } from './signup.ts'
import { type Court, type Rally, hit, playAreaFor, serveWait, sideSign, step, strokeOf } from './tennisRally.ts'
import {
  BASELINE_STANDBY_M,
  COURT_HALF_LENGTH,
  DOUBLES_HALF_WIDTH,
  DOUBLES_SPREAD_M,
  REJOIN_GRACE_MS,
  SINGLES_HALF_WIDTH,
  TENNIS_COACH,
  TENNIS_COURTS,
  TENNIS_GEAR,
  TENNIS_HIT_COOLDOWN_MS,
  TENNIS_NET_Z,
  TENNIS_ZONE
} from './tennisConstants.ts'
import { type TennisScore, awardPoint, newScore, other, parseFormat, pointLabels } from './tennisScore.ts'
import { freeHit, sendStroke, stopFreeRally } from './tennisFree.ts'
import { type MatchEnd, type MatchResult, endMatch, recordMatch, registerCoach, registerVenue } from './venues.ts'

export const TENNIS_SETTINGS: readonly SettingSpec[] = [
  { key: 'mode', label: 'Mode', options: ['singles', 'doubles'] },
  { key: 'format', label: 'Format', options: ['short_set_4', 'tiebreak_7'] }
]

export interface TennisGame {
  venue: string
  court: Court
  score: TennisScore
  rally: Rally
  turns: Record<Team, number>
  lastHitAt: Map<number, number>
}

const games = new WeakMap<GameRoom, Map<string, TennisGame>>()

function roomGames(room: GameRoom): Map<string, TennisGame> {
  let map = games.get(room)
  if (!map) {
    map = new Map()
    games.set(room, map)
  }
  return map
}

export function tennisGame(room: GameRoom, venue: string): TennisGame | null {
  return roomGames(room).get(venue) ?? null
}

export function playersFor(settings: Settings): { min: number, max: number } {
  return settings.mode === 'doubles' ? { min: 4, max: 4 } : { min: 2, max: 2 }
}

export function courtFor(cx: number, settings: Settings): Court {
  return { cx, netZ: TENNIS_NET_Z, halfWidth: settings.mode === 'doubles' ? DOUBLES_HALF_WIDTH : SINGLES_HALF_WIDTH }
}

function teamPlayers(match: Match, team: Team): MatchPlayer[] {
  return activePlayers(match).filter((p) => p.team === team)
}

function serverOf(match: Match, game: TennisGame): string | null {
  const team = teamPlayers(match, game.score.serving)
  return team.length === 0 ? null : team[game.turns[game.score.serving] % team.length].sessionId
}

function nextServe(match: Match, game: TennisGame, now: number): Rally {
  return serveWait(serverOf(match, game) ?? '', game.score.serving, now)
}

function stateView(match: Match, game: TennisGame, now: number, ended = false) {
  const rally = game.rally
  return {
    venue: game.venue,
    court: game.court,
    mode: match.settings.mode,
    format: game.score.format,
    phase: ended ? 'ended' : rally.phase,
    games: game.score.games,
    points: pointLabels(game.score),
    tiebreak: game.score.tiebreak,
    serving: game.score.serving,
    server: rally.phase === 'serve_wait' || rally.phase === 'toss' ? rally.server : null,
    ball: rally.phase === 'serve_wait' ? null : rally.ball,
    hitter: rally.phase === 'flight' ? rally.hitter : null,
    call: rally.phase === 'point' ? rally.call : null,
    pointWinner: rally.phase === 'point' ? rally.winner : null,
    winner: game.score.winner,
    players: activePlayers(match).map(({ sessionId, team }) => ({ sessionId, team })),
    serverNow: now
  }
}

function broadcast(room: GameRoom, match: Match, game: TennisGame, now: number, ended = false): void {
  const zone = worldSportsPassArea(TENNIS_ZONE)
  const payload = stateView(match, game, now, ended)
  room.forEachClient((client) => {
    const p = room.players.get(client.sessionId)
    if (!p) return
    const watching = zone !== null && p.x >= zone.minX && p.x <= zone.maxX && p.z >= zone.minZ && p.z <= zone.maxZ
    if (watching || match.players.some((m) => m.accountId === p.accountId)) client.send('tennis_state', payload)
  })
}

function placeOnBaselines(room: GameRoom, match: Match, court: Court): void {
  for (const team of ['red', 'blue'] as const) {
    const players = teamPlayers(match, team)
    players.forEach((mp, i) => {
      const player = room.players.get(mp.sessionId)
      const client = room.clients.find((c) => c.sessionId === mp.sessionId)
      if (!player || !client || mp.awaySince !== null) return
      player.x = court.cx + (players.length === 1 ? 0 : (i === 0 ? -DOUBLES_SPREAD_M : DOUBLES_SPREAD_M))
      player.z = court.netZ + sideSign(team) * (COURT_HALF_LENGTH + BASELINE_STANDBY_M)
      client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason: 'tennis_kickoff' })
      room.broadcastMove(client, player)
    })
  }
}

export function startTennis(room: GameRoom, match: Match, cx: number, firstServer: Team, now: number): TennisGame {
  const court = courtFor(cx, match.settings)
  const score = newScore(parseFormat(match.settings.format), firstServer)
  const game: TennisGame = { venue: match.venue, court, score, rally: serveWait('', firstServer, now), turns: { [firstServer]: 0, [other(firstServer)]: -1 } as Record<Team, number>, lastHitAt: new Map() }
  game.rally = nextServe(match, game, now)
  roomGames(room).set(match.venue, game)
  stopFreeRally(room, match.venue, now)
  placeOnBaselines(room, match, court)
  broadcast(room, match, game, now)
  return game
}

function score(game: TennisGame, winner: Team): void {
  const before = game.score.serving
  awardPoint(game.score, winner)
  if (game.score.serving !== before) game.turns[game.score.serving] += 1
}

export function runTennis(room: GameRoom, match: Match, now: number): void {
  const game = tennisGame(room, match.venue)
  if (!game) return
  const where = (sessionId: string) => room.players.get(sessionId) ?? null
  if (game.rally.phase === 'point') {
    if (now < game.rally.until) return
    if (game.score.winner) {
      endMatch(room, match.venue, { reason: 'finished' }, now)
      return
    }
    game.rally = nextServe(match, game, now)
    broadcast(room, match, game, now)
    return
  }
  const next = step(game.rally, now, game.court, where)
  if (next === game.rally) return
  game.rally = next
  if (next.phase === 'point') score(game, next.winner)
  broadcast(room, match, game, now)
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function onTennisHit(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || !finite(payload?.aimX) || !finite(payload?.aimZ) || (payload?.lob !== undefined && typeof payload.lob !== 'boolean')) return
  for (const [venue, game] of roomGames(room)) {
    const match = room.sports.matches.get(venue)
    const mp = match && matchPlayer(match, player.accountId)
    if (!match || !mp || mp.awaySince !== null || mp.team === null) continue
    const last = game.lastHitAt.get(player.accountId) ?? -Infinity
    if (now - last < TENNIS_HIT_COOLDOWN_MS) return
    game.lastHitAt.set(player.accountId, now)
    runTennis(room, match, now)
    if (roomGames(room).get(venue) !== game) return
    const hitter = { sessionId: player.sessionId, team: mp.team, x: player.x, z: player.z }
    const before = game.rally
    const next = hit(before, hitter, { x: payload.aimX, z: payload.aimZ }, payload.lob === true, now, game.court)
    if (!next) return
    game.rally = next
    broadcast(room, match, game, now)
    sendStroke(room, player.sessionId, strokeOf(before, next, hitter, payload.lob === true))
    return
  }
  freeHit(room, player, { x: payload.aimX, z: payload.aimZ }, payload.lob === true, now)
}

export function tennisResults(match: Match, game: TennisGame | null, end: MatchEnd): MatchResult[] {
  const winner = end.reason === 'finished' ? game?.score.winner ?? null : end.loser === null ? null : other(end.loser)
  return match.players.map((p) => {
    const team = p.team
    const result = p.out || winner === null || team === null ? 'dnf' : team === winner ? 'win' : 'loss'
    if (!game || team === null) return { accountId: p.accountId, team, result }
    const tally = game.score.format === 'tiebreak_7' ? game.score.points[team] : game.score.games[team]
    return { accountId: p.accountId, team, result, score: tally }
  })
}

function endTennis(room: GameRoom, match: Match, end: MatchEnd): void {
  const game = tennisGame(room, match.venue)
  roomGames(room).delete(match.venue)
  if (game) broadcast(room, match, game, Date.now(), true)
  const winner = end.reason === 'finished' ? game?.score.winner : end.loser && other(end.loser)
  for (const p of activePlayers(match)) if (winner && p.team === winner) sendStroke(room, p.sessionId, 'celebrate')
  void recordMatch(room, match, tennisResults(match, game, end))
}

for (const { id, cx } of TENNIS_COURTS) {
  registerVenue({
    id,
    sport: 'tennis',
    zone: TENNIS_ZONE,
    coach: { x: TENNIS_COACH.x, z: TENNIS_COACH.z },
    playArea: playAreaFor(cx, TENNIS_NET_Z),
    gear: TENNIS_GEAR,
    teams: true,
    settings: TENNIS_SETTINGS,
    players: playersFor,
    rejoinGraceMs: REJOIN_GRACE_MS,
    onKickoff: (room, match) => void startTennis(room, match, cx, Math.random() < 0.5 ? 'red' : 'blue', match.startedAt),
    onTick: (room, match, elapsedMs) => runTennis(room, match, match.startedAt + elapsedMs),
    onLeave: () => undefined,
    onEnd: endTennis
  })
}
registerCoach({ id: TENNIS_COACH.id, x: TENNIS_COACH.x, z: TENNIS_COACH.z, venues: TENNIS_COURTS.map((c) => c.id) })
