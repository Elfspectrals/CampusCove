import type { Bounds, ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { callRealtimeBackend } from '../backend.ts'
import { readSportRules } from '../world.ts'
import { ownedGear } from './gear.ts'
import { inPassArea } from './pass.ts'
import {
  type Ball,
  type EndScore,
  type ThrowMode,
  type ThrowResult,
  meterPower,
  placeJack,
  pointHolder,
  scoreEnd,
  simulateThrow,
  validJackSpot
} from './petanqueSim.ts'
import { type PetanqueFormat, type PetanquePiste, type PetanqueRules, parsePetanqueRules } from './petanqueRules.ts'
import { type Match, type MatchPlayer, type Settings, type Team, TEAMS, matchPlayer } from './signup.ts'
import { type MatchEnd, type MatchResult, endMatch, recordMatch, registerCoach, registerVenue } from './venues.ts'

type Phase = 'jack' | 'boules' | 'between'

interface Game {
  venue: string
  piste: Bounds
  format: PetanqueFormat
  target: number
  score: Record<Team, number>
  end: number
  southCircle: boolean
  jackTeam: Team
  phase: Phase
  balls: Ball[]
  left: Map<number, number>
  thrower: number | null
  pressAt: number | null
  lastTeam: Team | null
  busyUntil: number
  turnEndsAt: number
  lastEnd: EndScore | null
  lastSyncAt: number
  carreaux: Map<number, number>
}

interface FreePiste {
  venue: string
  piste: Bounds
  balls: Ball[]
  busyUntil: number
  lastAt: number
  press: { accountId: number, at: number } | null
}

const SYNC_MS = 5_000
const games = new WeakMap<Match, Game>()
const FREE_IDLE_MS = 120_000
const GEAR_CHECK_MS = 60_000
const freePistes = new WeakMap<GameRoom, Map<string, FreePiste>>()
const gearChecks = new WeakMap<Player, { owned: boolean, at: number }>()

let rules: PetanqueRules | null = null
const pistes = new Map<string, PetanquePiste>()

function loaded(): PetanqueRules {
  if (!rules) throw new Error('petanque rules are not loaded')
  return rules
}

function formatOf(settings: Settings): PetanqueFormat {
  const format = loaded().formats.find((f) => f.id === settings.format)
  if (!format) throw new Error(`petanque: unknown format ${String(settings.format)}`)
  return format
}

function circleOf(game: Game): { x: number, z: number, axisZ: 1 | -1 } {
  const x = (game.piste.minX + game.piste.maxX) / 2
  const offset = loaded().circleFromEndM
  return game.southCircle ? { x, z: game.piste.maxZ - offset, axisZ: -1 } : { x, z: game.piste.minZ + offset, axisZ: 1 }
}

function other(team: Team): Team {
  return team === 'red' ? 'blue' : 'red'
}

function teamLeft(game: Game, match: Match, team: Team): number {
  return match.players.filter((p) => p.team === team && !p.out).reduce((sum, p) => sum + (game.left.get(p.accountId) ?? 0), 0)
}

function pickThrower(game: Game, match: Match, team: Team): number | null {
  let best: MatchPlayer | null = null
  for (const p of match.players) {
    if (p.team !== team || p.out) continue
    if (game.phase === 'boules' && (game.left.get(p.accountId) ?? 0) === 0) continue
    if (!best || (game.left.get(p.accountId) ?? 0) > (game.left.get(best.accountId) ?? 0)) best = p
  }
  return best?.accountId ?? null
}

function startEnd(game: Game, match: Match, now: number): void {
  game.balls = []
  game.left = new Map(match.players.filter((p) => !p.out).map((p) => [p.accountId, game.format.boules]))
  game.phase = 'jack'
  game.lastTeam = null
  game.pressAt = null
  game.thrower = pickThrower(game, match, game.jackTeam) ?? pickThrower(game, match, other(game.jackTeam))
  game.busyUntil = now
  game.turnEndsAt = now + loaded().shotClockMs
}

function finishEnd(game: Game, match: Match, readyAt: number): void {
  const left = { red: teamLeft(game, match, 'red'), blue: teamLeft(game, match, 'blue') }
  const result = scoreEnd(game.balls, left, loaded())
  if (result.team) game.score[result.team] += result.points
  game.lastEnd = result
  if (result.team) game.jackTeam = result.team
  game.phase = 'between'
  game.thrower = null
  game.pressAt = null
  game.busyUntil = readyAt + loaded().endPauseMs
  game.turnEndsAt = game.busyUntil
}

function nextTurn(game: Game, match: Match, readyAt: number): void {
  const jack = game.balls.find((b) => b.kind === 'jack')
  const red = teamLeft(game, match, 'red')
  const blue = teamLeft(game, match, 'blue')
  if (!jack || jack.dead || red + blue === 0) {
    finishEnd(game, match, readyAt)
    return
  }
  const left = { red, blue }
  const holder = pointHolder(game.balls, loaded())
  const wanted = holder ? other(holder.team) : game.lastTeam ? other(game.lastTeam) : game.jackTeam
  const team = left[wanted] > 0 ? wanted : other(wanted)
  game.thrower = pickThrower(game, match, team)
  game.pressAt = null
  game.busyUntil = readyAt
  game.turnEndsAt = readyAt + loaded().shotClockMs
}

function participants(room: GameRoom, match: Match): Set<string> {
  return new Set(match.players.map((p) => p.sessionId).filter((id) => room.players.has(id)))
}

function sendToSite(room: GameRoom, match: Match, type: string, payload: unknown): void {
  const inMatch = participants(room, match)
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && (inMatch.has(c.sessionId) || inPassArea(listener.x, listener.z))) c.send(type, payload)
  })
}

function gameView(game: Game, match: Match, now: number) {
  const holder = pointHolder(game.balls, loaded())
  const circle = circleOf(game)
  return {
    venue: game.venue,
    phase: game.phase,
    format: game.format.id,
    target: game.target,
    score: game.score,
    end: game.end,
    circle,
    jackTeam: game.jackTeam,
    thrower: game.thrower === null ? null : matchPlayer(match, game.thrower)?.sessionId ?? null,
    busyUntil: game.busyUntil,
    turnEndsAt: game.turnEndsAt,
    serverNow: now,
    players: match.players.map((p) => ({ sessionId: p.sessionId, name: p.name, team: p.team, out: p.out, left: game.left.get(p.accountId) ?? 0 })),
    balls: game.balls,
    point: holder ? { team: holder.team, ball: holder.ballId } : null,
    distancesCm: holder?.distancesCm ?? [],
    lastEnd: game.lastEnd
  }
}

function sync(room: GameRoom, match: Match, game: Game, now: number): void {
  game.lastSyncAt = now
  sendToSite(room, match, 'petanque_state', gameView(game, match, now))
}

function kickoff(room: GameRoom, match: Match): void {
  const piste = pistes.get(match.venue) as PetanquePiste
  const now = match.startedAt
  const game: Game = {
    venue: match.venue,
    piste: piste.bounds,
    format: formatOf(match.settings),
    target: Number(match.settings.targetPoints),
    score: { red: 0, blue: 0 },
    end: 1,
    southCircle: true,
    jackTeam: TEAMS[Math.floor(Math.random() * TEAMS.length)],
    phase: 'jack',
    balls: [],
    left: new Map(),
    thrower: null,
    pressAt: null,
    lastTeam: null,
    busyUntil: now,
    turnEndsAt: now,
    lastEnd: null,
    lastSyncAt: now,
    carreaux: new Map()
  }
  clearFree(room, match.venue, now)
  games.set(match, game)
  startEnd(game, match, now)
  sync(room, match, game, now)
}

function timeOut(game: Game, match: Match, now: number): void {
  if (game.phase === 'jack') {
    const circle = circleOf(game)
    const jack = placeJack({ id: 1, kind: 'jack', team: null, owner: null, x: circle.x, z: circle.z, dead: true }, circle, circle.axisZ, game.piste, loaded())
    game.balls = [jack]
    game.phase = 'boules'
    game.thrower = pickThrower(game, match, game.jackTeam)
    game.pressAt = null
    game.turnEndsAt = now + loaded().shotClockMs
    return
  }
  if (game.thrower !== null) game.left.set(game.thrower, Math.max(0, (game.left.get(game.thrower) ?? 0) - 1))
  const team = game.thrower === null ? null : matchPlayer(match, game.thrower)?.team ?? null
  if (team) game.lastTeam = team
  nextTurn(game, match, now)
}

function tick(room: GameRoom, match: Match, elapsedMs: number): void {
  const game = games.get(match)
  if (!game) return
  const now = match.startedAt + elapsedMs
  if (game.phase === 'between') {
    if (now < game.busyUntil) return
    if (game.score.red >= game.target || game.score.blue >= game.target) {
      endMatch(room, match.venue, { reason: 'finished' }, now)
      return
    }
    game.end += 1
    game.southCircle = !game.southCircle
    startEnd(game, match, now)
    sync(room, match, game, now)
    return
  }
  if (now >= game.turnEndsAt || (game.thrower === null && now >= game.busyUntil)) {
    timeOut(game, match, now)
    sync(room, match, game, now)
    return
  }
  if (now - game.lastSyncAt >= SYNC_MS) sync(room, match, game, now)
}

function leave(room: GameRoom, match: Match, accountId: number): void {
  const game = games.get(match)
  if (!game) return
  game.left.set(accountId, 0)
  if (game.thrower !== accountId) return
  const now = Date.now()
  if (game.phase === 'jack') game.thrower = pickThrower(game, match, game.jackTeam) ?? pickThrower(game, match, other(game.jackTeam))
  else if (game.phase === 'boules') nextTurn(game, match, Math.max(now, game.busyUntil))
  sync(room, match, game, now)
}

function matchResults(match: Match, game: Game | undefined, end: MatchEnd): MatchResult[] {
  const winner: Team | null = end.reason === 'forfeit'
    ? end.loser === null ? null : other(end.loser)
    : !game || game.score.red === game.score.blue ? null : game.score.red > game.score.blue ? 'red' : 'blue'
  return match.players.map((p) => ({
    accountId: p.accountId,
    team: p.team,
    result: winner === null ? (end.reason === 'forfeit' ? 'dnf' : 'draw') : p.team === winner ? 'win' : 'loss',
    ...(game && p.team ? { score: game.score[p.team] } : {})
  }))
}

function finish(room: GameRoom, match: Match, end: MatchEnd): void {
  const game = games.get(match)
  games.delete(match)
  sendToSite(room, match, 'petanque_closed', { venue: match.venue, score: game?.score ?? null, reason: end.reason })
  void recordAndTally(room, match, game, end)
}

async function recordAndTally(room: GameRoom, match: Match, game: Game | undefined, end: MatchEnd): Promise<void> {
  await recordMatch(room, match, matchResults(match, game, end))
  if (end.reason !== 'finished' || !game) return
  await Promise.all(match.players.map((p) => tally(room, p.accountId, '/sports/petanque/tally', { ref: match.id, carreaux: game.carreaux.get(p.accountId) ?? 0 })))
}

function warn(context: string, error: unknown): void {
  console.warn(`[petanque] ${context}:`, error instanceof Error ? error.message : error)
}

async function tally(room: GameRoom, accountId: number, path: string, body: Record<string, unknown>): Promise<void> {
  const player = [...room.players.values()].find((p) => p.accountId === accountId && p.token)
  if (!player) {
    warn(`${path} for account ${accountId} not sent`, 'player offline')
    return
  }
  try {
    await callRealtimeBackend(player.token, path, 'POST', body)
  } catch (error) {
    warn(`${path} for account ${accountId} failed`, error)
  }
}

function activeGame(room: GameRoom, client: GameClient): { player: Player, match: Match, game: Game } | null {
  const player = room.players.get(client.sessionId)
  if (!player) return null
  for (const match of room.sports.matches.values()) {
    const game = games.get(match)
    if (game && matchPlayer(match, player.accountId)) return { player, match, game }
  }
  return null
}

function refusal(player: Player, game: Game, now: number): { code: string, message: string } | null {
  if (game.phase === 'between' || game.thrower !== player.accountId) return { code: 'petanque_not_your_turn', message: 'Wait for your turn.' }
  if (now < game.busyUntil) return { code: 'petanque_wait', message: 'Wait until the boules stop.' }
  const circle = circleOf(game)
  if (Math.hypot(player.x - circle.x, player.z - circle.z) > loaded().circleReachM) return { code: 'petanque_not_in_circle', message: 'Stand in the circle to throw.' }
  return null
}

export async function onPetanqueAim(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const active = activeGame(room, client)
  if (!active) {
    await freeAim(room, client, now)
    return
  }
  const refused = refusal(active.player, active.game, now)
  if (refused) {
    client.send('sports_error', refused)
    return
  }
  active.game.pressAt = now
}

function parseThrow(payload: ClientPayload): { yaw: number, mode: ThrowMode } | null {
  const yaw = payload?.yaw
  const mode = payload?.mode
  if (typeof yaw !== 'number' || !Number.isFinite(yaw) || Math.abs(yaw) > Math.PI) return null
  if (mode !== 'point' && mode !== 'shoot') return null
  return { yaw, mode }
}

function applyThrow(game: Game, match: Match, player: Player, result: ThrowResult, now: number): void {
  const readyAt = now + result.airMs + result.rollMs
  game.busyUntil = readyAt
  if (result.ball.kind === 'jack') {
    const circle = circleOf(game)
    const jack = validJackSpot(result.ball, circle, game.piste, loaded()) ? result.ball : placeJack(result.ball, circle, circle.axisZ, game.piste, loaded())
    game.balls = [jack]
    game.phase = 'boules'
    game.thrower = pickThrower(game, match, game.jackTeam)
    game.pressAt = null
    game.turnEndsAt = readyAt + loaded().shotClockMs
    return
  }
  game.balls = result.balls
  if (result.carreau) game.carreaux.set(player.accountId, (game.carreaux.get(player.accountId) ?? 0) + 1)
  game.left.set(player.accountId, Math.max(0, (game.left.get(player.accountId) ?? 0) - 1))
  game.lastTeam = matchPlayer(match, player.accountId)?.team ?? null
  nextTurn(game, match, readyAt)
}

export function onPetanqueThrow(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now(), random: () => number = Math.random): void {
  const active = activeGame(room, client)
  const input = parseThrow(payload)
  if (!input) return
  if (!active) {
    freeThrow(room, client, input, now, random)
    return
  }
  const { player, match, game } = active
  const refused = refusal(player, game, now)
  if (refused) {
    client.send('sports_error', refused)
    return
  }
  if (game.pressAt === null) return
  const power = meterPower(now - game.pressAt, loaded().riseMs)
  const circle = circleOf(game)
  const kind = game.phase === 'jack' ? 'jack' : 'boule'
  const team = matchPlayer(match, player.accountId)?.team ?? null
  const result = simulateThrow(game.balls, {
    kind,
    mode: kind === 'jack' ? 'point' : input.mode,
    from: circle,
    axisZ: circle.axisZ,
    yaw: input.yaw,
    power,
    team: kind === 'jack' ? null : team,
    owner: kind === 'jack' ? null : player.accountId
  }, game.piste, loaded(), random)
  applyThrow(game, match, player, result, now)
  sendToSite(room, match, 'petanque_throw', {
    venue: game.venue,
    kind,
    mode: kind === 'jack' ? 'point' : input.mode,
    thrower: player.sessionId,
    team: kind === 'jack' ? null : team,
    ball: result.ball.id,
    from: { x: circle.x, z: circle.z },
    landing: result.landing,
    airMs: result.airMs,
    frames: result.frames,
    carreau: result.carreau,
    serverNow: now
  })
  sync(room, match, game, now)
}

export function registerPetanque(parsed: PetanqueRules): void {
  rules = parsed
  for (const piste of parsed.pistes) {
    pistes.set(piste.id, piste)
    registerVenue({
      id: piste.id,
      sport: 'petanque',
      zone: parsed.zone,
      coach: parsed.coach,
      playArea: piste.bounds,
      teams: true,
      settings: parsed.settings,
      players: (settings) => {
        const count = formatOf(settings).teamSize * 2
        return { min: count, max: count }
      },
      rejoinGraceMs: parsed.rejoinGraceMs,
      gear: parsed.gear,
      onKickoff: kickoff,
      onTick: tick,
      onLeave: leave,
      onEnd: finish
    })
  }
  registerCoach({ id: parsed.coachId, x: parsed.coach.x, z: parsed.coach.z, venues: parsed.pistes.map((p) => p.id) })
}

export async function loadPetanque(): Promise<void> {
  registerPetanque(parsePetanqueRules(await readSportRules('petanque')))
  console.log(`[sports] petanque: ${pistes.size} pistes loaded`)
}

function sendToPassArea(room: GameRoom, type: string, payload: unknown): void {
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && inPassArea(listener.x, listener.z)) c.send(type, payload)
  })
}

function freeCircle(piste: Bounds): { x: number, z: number, axisZ: 1 | -1 } {
  return { x: (piste.minX + piste.maxX) / 2, z: piste.maxZ - loaded().circleFromEndM, axisZ: -1 }
}

function freeView(free: FreePiste, now: number) {
  const holder = pointHolder(free.balls, loaded())
  return {
    venue: free.venue,
    circle: freeCircle(free.piste),
    balls: free.balls,
    point: holder ? { team: holder.team, ball: holder.ballId } : null,
    distancesCm: holder?.distancesCm ?? [],
    busyUntil: free.busyUntil,
    serverNow: now
  }
}

function clearFree(room: GameRoom, venue: string, now: number): void {
  const free = freePistes.get(room)?.get(venue)
  if (!free) return
  freePistes.get(room)?.delete(venue)
  sendToPassArea(room, 'petanque_free', { ...freeView(free, now), balls: [], point: null, distancesCm: [] })
}

function freePisteAt(room: GameRoom, player: Player, now: number): FreePiste | null {
  for (const piste of pistes.values()) {
    if (room.sports.matches.has(piste.id)) continue
    const circle = freeCircle(piste.bounds)
    if (Math.hypot(player.x - circle.x, player.z - circle.z) > loaded().circleReachM) continue
    let byVenue = freePistes.get(room)
    if (!byVenue) {
      byVenue = new Map()
      freePistes.set(room, byVenue)
    }
    const known = byVenue.get(piste.id)
    if (known && now - known.lastAt < FREE_IDLE_MS) return known
    if (known) clearFree(room, piste.id, now)
    const fresh: FreePiste = { venue: piste.id, piste: piste.bounds, balls: [], busyUntil: now, lastAt: now, press: null }
    ;(freePistes.get(room) as Map<string, FreePiste>).set(piste.id, fresh)
    return fresh
  }
  return null
}

async function ownsBoules(player: Player, now: number): Promise<boolean> {
  const cached = gearChecks.get(player)
  if (cached && now - cached.at < GEAR_CHECK_MS) return cached.owned
  const owned = (await ownedGear(player)).includes(loaded().gear)
  gearChecks.set(player, { owned, at: now })
  return owned
}

async function freeAim(room: GameRoom, client: GameClient, now: number): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token) return
  const free = freePisteAt(room, player, now)
  if (!free) {
    client.send('sports_error', { code: 'petanque_not_in_circle', message: 'Stand in the circle of a free piste to throw.' })
    return
  }
  if (now < free.busyUntil) {
    client.send('sports_error', { code: 'petanque_wait', message: 'Wait until the boules stop.' })
    return
  }
  let owned: boolean
  try {
    owned = await ownsBoules(player, now)
  } catch (error) {
    warn('gear check failed', error)
    client.send('sports_error', { code: 'sports_gear_failed', message: 'Your gear could not be checked.' })
    return
  }
  if (!owned) {
    client.send('sports_error', { code: 'sports_no_gear', message: 'You need your own boules (Summit Sports, mall).' })
    return
  }
  free.press = { accountId: player.accountId, at: now }
}

function freeThrow(room: GameRoom, client: GameClient, input: { yaw: number, mode: ThrowMode }, now: number, random: () => number): void {
  const player = room.players.get(client.sessionId)
  if (!player) return
  const free = freePisteAt(room, player, now)
  if (!free || free.press?.accountId !== player.accountId || now < free.busyUntil) return
  const power = meterPower(now - free.press.at, loaded().riseMs)
  free.press = null
  const jack = free.balls.find((b) => b.kind === 'jack' && !b.dead)
  const kind = jack ? 'boule' : 'jack'
  const perPlayer = Math.max(...loaded().formats.map((f) => f.boules))
  const mine = free.balls.filter((b) => b.owner === player.accountId)
  const before = kind === 'jack' ? [] : mine.length >= perPlayer ? free.balls.filter((b) => b.owner !== player.accountId) : free.balls
  const circle = freeCircle(free.piste)
  const mode = kind === 'jack' ? 'point' : input.mode
  const result = simulateThrow(before, { kind, mode, from: circle, axisZ: circle.axisZ, yaw: input.yaw, power, team: kind === 'jack' ? null : 'red', owner: kind === 'jack' ? null : player.accountId }, free.piste, loaded(), random)
  free.balls = result.balls
  free.busyUntil = now + result.airMs + result.rollMs
  free.lastAt = now
  sendToPassArea(room, 'petanque_throw', {
    venue: free.venue,
    kind,
    mode,
    thrower: player.sessionId,
    team: null,
    ball: result.ball.id,
    from: { x: circle.x, z: circle.z },
    landing: result.landing,
    airMs: result.airMs,
    frames: result.frames,
    carreau: result.carreau,
    serverNow: now
  })
  sendToPassArea(room, 'petanque_free', freeView(free, now))
}
