import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { type Match, type MatchPlayer, type SettingSpec, type Settings, type Team, activePlayers, matchPlayer } from './signup.ts'
import { isRobot, placeRobot, sportsPlayer } from './robots.ts'
import { type Aim, type Court, type Rally, hit, playAreaFor, serveWait, sideSign, step, strokeOf, trackReady } from './tennisRally.ts'
import { type Spot, type TennisBrain, netFacing, newTennisBrain, thinkTennis } from './tennisRobot.ts'
import {
  BASELINE_STANDBY_M,
  COURT_HALF_LENGTH,
  COVE_STROKES,
  type CoveStroke,
  GAUGE_FULL,
  GAUGE_GAIN,
  KNOCK_BACK_M,
  KNOCK_ROOT_MS,
  type ShotKind,
  DOUBLES_HALF_WIDTH,
  DOUBLES_SPREAD_M,
  REJOIN_GRACE_MS,
  SINGLES_HALF_WIDTH,
  TENNIS_COACH,
  TENNIS_COURTS,
  TENNIS_GEAR,
  TENNIS_HIT_COOLDOWN_MS,
  TENNIS_NET_Z,
  TENNIS_WHIFF_RECOVERY_MS,
  TENNIS_ZONE
} from './tennisConstants.ts'
import { type TennisScore, awardPoint, newScore, other, parseFormat, pointLabels } from './tennisScore.ts'
import { freeHit, sendStroke, stopFreeRally } from './tennisFree.ts'
import { type MatchEnd, type MatchResult, endMatch, recordMatch, registerCoach, registerVenue } from './venues.ts'

export const TENNIS_SETTINGS: readonly SettingSpec[] = [
  { key: 'mode', label: 'Mode', options: ['singles', 'doubles'] },
  { key: 'format', label: 'Format', options: ['short_set_4', 'tiebreak_7'] },
  { key: 'rules', label: 'Rules', options: ['classic', 'cove'] }
]

export interface TennisGame {
  venue: string
  court: Court
  score: TennisScore
  rally: Rally
  turns: Record<Team, number>
  lastHitAt: Map<number, number>
  brains: Map<number, TennisBrain>
  random: () => number
  gauges: Map<number, number> | null
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

function putBehindBaseline(room: GameRoom, court: Court, team: Team, sessionId: string, x: number, reason: string, now: number): void {
  const player = sportsPlayer(room, sessionId)
  if (!player) return
  const z = court.netZ + sideSign(team) * (COURT_HALF_LENGTH + BASELINE_STANDBY_M)
  if (isRobot(player.accountId)) {
    placeRobot(room, player, x, player.y, z, netFacing(team), now)
    return
  }
  const client = room.clients.find((c) => c.sessionId === sessionId)
  if (!client) return
  player.x = x
  player.z = z
  client.send('position_correction', { x, y: player.y, z, reason })
  room.broadcastMove(client, player)
}

function placeServer(room: GameRoom, court: Court, team: Team, sessionId: string, now: number): void {
  const player = sportsPlayer(room, sessionId)
  if (!player) return
  const x = Math.min(court.cx + court.halfWidth, Math.max(court.cx - court.halfWidth, player.x))
  putBehindBaseline(room, court, team, sessionId, x, 'tennis_serve', now)
}

function nextServe(room: GameRoom, match: Match, game: TennisGame, now: number): Rally {
  const server = serverOf(match, game)
  if (server) placeServer(room, game.court, game.score.serving, server, now)
  return serveWait(server ?? '', game.score.serving, now)
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
    bounces: rally.phase === 'flight' ? rally.bounces : 0,
    shot: rally.phase === 'flight' ? rally.shot : null,
    call: rally.phase === 'point' ? rally.call : null,
    pointWinner: rally.phase === 'point' ? rally.winner : null,
    winner: game.score.winner,
    players: activePlayers(match).map(({ sessionId, team }) => ({ sessionId, team })),
    rules: game.gauges ? 'cove' : 'classic',
    gauges: game.gauges ? Object.fromEntries(activePlayers(match).map((p) => [p.sessionId, game.gauges?.get(p.accountId) ?? 0])) : null,
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

function placeOnBaselines(room: GameRoom, match: Match, court: Court, now: number): void {
  for (const team of ['red', 'blue'] as const) {
    const players = teamPlayers(match, team)
    players.forEach((mp, i) => {
      if (mp.awaySince !== null) return
      const x = court.cx + (players.length === 1 ? 0 : (i === 0 ? -DOUBLES_SPREAD_M : DOUBLES_SPREAD_M))
      putBehindBaseline(room, court, team, mp.sessionId, x, 'tennis_kickoff', now)
    })
  }
}

function robotBrains(room: GameRoom, match: Match, now: number): Map<number, TennisBrain> {
  const brains = new Map<number, TennisBrain>()
  for (const mp of match.players) {
    const robot = isRobot(mp.accountId) ? sportsPlayer(room, mp.sessionId) : undefined
    if (robot) brains.set(mp.accountId, newTennisBrain(match.robots ?? 'normal', robot, now))
  }
  return brains
}

export function startTennis(room: GameRoom, match: Match, cx: number, firstServer: Team, now: number, random: () => number = Math.random): TennisGame {
  const court = courtFor(cx, match.settings)
  const score = newScore(parseFormat(match.settings.format), firstServer)
  const game: TennisGame = { venue: match.venue, court, score, rally: serveWait('', firstServer, now), turns: { [firstServer]: 0, [other(firstServer)]: -1 } as Record<Team, number>, lastHitAt: new Map(), brains: new Map(), random, gauges: match.settings.rules === 'cove' ? new Map() : null }
  game.rally = nextServe(room, match, game, now)
  roomGames(room).set(match.venue, game)
  stopFreeRally(room, match.venue, now)
  placeOnBaselines(room, match, court, now)
  game.brains = robotBrains(room, match, now)
  broadcast(room, match, game, now)
  return game
}

function score(game: TennisGame, winner: Team): void {
  const before = game.score.serving
  awardPoint(game.score, winner)
  if (game.score.serving !== before) game.turns[game.score.serving] += 1
}

function someoneAway(match: Match): boolean {
  return activePlayers(match).some((p) => p.awaySince !== null)
}

function advanceRally(room: GameRoom, match: Match, game: TennisGame, now: number): void {
  const where = (sessionId: string) => sportsPlayer(room, sessionId) ?? null
  if (game.rally.phase === 'point') {
    if (now < game.rally.until) return
    if (game.score.winner) {
      endMatch(room, match.venue, { reason: 'finished' }, now)
      return
    }
    game.rally = nextServe(room, match, game, now)
    broadcast(room, match, game, now)
    return
  }
  if (game.rally.phase === 'serve_wait' && someoneAway(match)) {
    game.rally = { ...game.rally, since: now }
    return
  }
  const next = step(game.rally, now, game.court, where)
  for (const mp of match.players) {
    const player = sportsPlayer(room, mp.sessionId)
    if (player && !mp.out && mp.team !== null) trackReady(player, next, game.court, { sessionId: mp.sessionId, team: mp.team, x: player.x, z: player.z }, now)
  }
  if (next === game.rally) return
  const before = game.rally
  game.rally = next
  if (next.phase === 'point') score(game, next.winner)
  afterShots(room, match, game, before, next, now)
  broadcast(room, match, game, now)
}

function newShot(before: Rally, after: Rally) {
  const previous = before.phase === 'flight' ? before.shot : null
  return after.phase === 'flight' && after.shot && after.shot !== previous ? after.shot : null
}

function knockBack(room: GameRoom, match: Match, game: TennisGame, sessionId: string, now: number): void {
  const mp = match.players.find((p) => p.sessionId === sessionId)
  const player = sportsPlayer(room, sessionId)
  if (!mp || mp.team === null || !player) return
  const area = playAreaFor(game.court.cx, game.court.netZ)
  const z = Math.min(area.maxZ, Math.max(area.minZ, player.z + sideSign(mp.team) * KNOCK_BACK_M))
  const until = now + KNOCK_ROOT_MS
  const brain = game.brains.get(mp.accountId)
  if (brain) {
    brain.stunnedUntil = until
    placeRobot(room, player, player.x, player.y, z, netFacing(mp.team), now)
    return
  }
  const client = room.clients.find((c) => c.sessionId === sessionId)
  if (!client) return
  player.z = z
  client.send('position_correction', { x: player.x, y: player.y, z, reason: 'tennis_knocked' })
  client.send('tennis_knocked', { until })
  room.broadcastMove(client, player)
}

function afterShots(room: GameRoom, match: Match, game: TennisGame, before: Rally, after: Rally, now: number): void {
  const shot = newShot(before, after)
  if (!shot || !game.gauges) return
  if (shot.knocked) {
    knockBack(room, match, game, shot.sessionId, now)
    return
  }
  const mp = match.players.find((p) => p.sessionId === shot.sessionId)
  if (!mp || shot.kind === 'special' || (shot.timing !== 'smash' && shot.timing !== 'perfect' && shot.timing !== 'good')) return
  game.gauges.set(mp.accountId, Math.min(GAUGE_FULL, (game.gauges.get(mp.accountId) ?? 0) + GAUGE_GAIN[shot.timing]))
}

function spotsOf(room: GameRoom, players: MatchPlayer[]): Spot[] {
  return players.flatMap((mp) => {
    const player = sportsPlayer(room, mp.sessionId)
    return player ? [{ x: player.x, z: player.z }] : []
  })
}

function driveRobots(room: GameRoom, match: Match, game: TennisGame, now: number): void {
  for (const [accountId, brain] of game.brains) {
    if (tennisGame(room, match.venue) !== game) return
    const mp = matchPlayer(match, accountId)
    const robot = mp && sportsPlayer(room, mp.sessionId)
    if (!mp || !robot || mp.out || mp.team === null) continue
    const team = mp.team
    const mates = spotsOf(room, teamPlayers(match, team).filter((p) => p.accountId !== accountId))
    const foes = spotsOf(room, teamPlayers(match, other(team)))
    const cove = game.gauges ? { gauge: game.gauges.get(accountId) ?? 0 } : null
    const actions = thinkTennis(brain, { rally: game.rally, court: game.court, team, sessionId: robot.sessionId, at: robot, mates, foes, now, random: game.random, cove })
    for (const action of actions) {
      if (action.kind === 'move') placeRobot(room, robot, action.x, robot.y, action.z, action.ry, now)
      else matchHit(room, match, game, team, robot, action.aim, action.shot, now)
    }
  }
}

export function runTennis(room: GameRoom, match: Match, now: number): void {
  const game = tennisGame(room, match.venue)
  if (!game) return
  advanceRally(room, match, game, now)
  driveRobots(room, match, game, now)
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function specialReady(game: TennisGame, accountId: number): boolean {
  return game.rally.phase === 'flight' && (game.gauges?.get(accountId) ?? 0) >= GAUGE_FULL
}

function matchHit(room: GameRoom, match: Match, game: TennisGame, team: Team, player: Player, aim: Aim, kind: ShotKind, now: number): void {
  if (kind === 'special' && !specialReady(game, player.accountId)) return
  const last = game.lastHitAt.get(player.accountId) ?? -Infinity
  if (now - last < TENNIS_HIT_COOLDOWN_MS) return
  game.lastHitAt.set(player.accountId, now)
  advanceRally(room, match, game, now)
  if (tennisGame(room, match.venue) !== game) return
  if (game.rally.phase === 'serve_wait' && someoneAway(match)) return
  const hitter = { sessionId: player.sessionId, team, x: player.x, z: player.z }
  const before = game.rally
  const next = hit(before, hitter, aim, kind, now, game.court, trackReady(player, before, game.court, hitter, now))
  if (!next) {
    if (before.phase === 'flight' && before.hitter !== team && !before.swing) game.lastHitAt.set(player.accountId, now + TENNIS_WHIFF_RECOVERY_MS - TENNIS_HIT_COOLDOWN_MS)
    return
  }
  game.rally = next
  if (kind === 'special' && before.phase === 'flight') game.gauges?.set(player.accountId, 0)
  afterShots(room, match, game, before, next, now)
  broadcast(room, match, game, now)
  sendStroke(room, player.sessionId, strokeOf(before, next, hitter, kind))
}

function matchShot(game: TennisGame, accountId: number, lob: boolean, stroke: CoveStroke | undefined, special: boolean): ShotKind | null {
  if (!game.gauges) return lob ? 'lob' : 'drive'
  if (!stroke) return null
  return special && specialReady(game, accountId) ? 'special' : stroke
}

export function onTennisHit(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || !finite(payload?.aimX) || !finite(payload?.aimZ) || (payload?.lob !== undefined && typeof payload.lob !== 'boolean')) return
  if (payload?.special !== undefined && typeof payload.special !== 'boolean') return
  if (payload?.stroke !== undefined && !COVE_STROKES.includes(payload.stroke as CoveStroke)) return
  const stroke = payload?.stroke as CoveStroke | undefined
  const aim = { x: payload.aimX, z: payload.aimZ }
  for (const [venue, game] of roomGames(room)) {
    const match = room.sports.matches.get(venue)
    const mp = match && matchPlayer(match, player.accountId)
    if (!match || !mp || mp.awaySince !== null || mp.team === null) continue
    const kind = matchShot(game, player.accountId, payload.lob === true, stroke, payload.special === true)
    if (kind) matchHit(room, match, game, mp.team, player, aim, kind, now)
    return
  }
  freeHit(room, player, aim, payload.lob === true, now)
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
    robots: true,
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
