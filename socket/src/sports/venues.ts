import { randomUUID } from 'node:crypto'
import { callRealtimeBackend, errorPayload } from '../backend.ts'
import type { Bounds, ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { ownedGear } from './gear.ts'
import { hasValidPass, inPassArea } from './pass.ts'
import {
  type Lobby,
  type Match,
  type PlayerRange,
  type SettingSpec,
  type Settings,
  type Team,
  activePlayers,
  assertRange,
  expireAway,
  forfeit,
  joinLobby,
  leaveLobby,
  lobbyDue,
  markAway,
  markBack,
  matchPlayer,
  openLobby,
  parseTeam,
  startMatch,
  validateSettings
} from './signup.ts'
import { SPORTS_ACTION_COOLDOWN_MS, SPORTS_COACH_REACH } from './sportsConstants.ts'

export type MatchEnd = { reason: 'finished' } | { reason: 'forfeit', loser: Team | null }

export interface VenueSpec {
  id: string
  sport: string
  zone: string
  coach: { x: number, z: number }
  playArea: Bounds
  teams: boolean
  settings: readonly SettingSpec[]
  players(settings: Settings): PlayerRange
  rejoinGraceMs: number
  gear?: string
  playAreaId?: string
  onKickoff(room: GameRoom, match: Match): void
  onTick(room: GameRoom, match: Match, elapsedMs: number): void
  onLeave(room: GameRoom, match: Match, accountId: number): void
  onEnd(room: GameRoom, match: Match, end: MatchEnd): void
}

export interface CoachSpec {
  id: string
  x: number
  z: number
  venues: string[]
}

export interface SportsRoomState {
  lobbies: Map<string, Lobby>
  matches: Map<string, Match>
}

export type MatchResultKind = 'win' | 'loss' | 'draw' | 'finished' | 'dnf'

export interface MatchResult {
  accountId: number
  team: Team | null
  result: MatchResultKind
  place?: number
  timeMs?: number
  score?: number
}

const RESULT_KINDS: readonly MatchResultKind[] = ['win', 'loss', 'draw', 'finished', 'dnf']
const ID_PATTERN = /^[a-z0-9_]+$/

const venues = new Map<string, VenueSpec>()
const coaches = new Map<string, CoachSpec>()

function warn(context: string, error: unknown): void {
  console.warn(`[sports] ${context}:`, error instanceof Error ? error.message : error)
}

export function newSportsState(): SportsRoomState {
  return { lobbies: new Map(), matches: new Map() }
}

function addCoach(coach: CoachSpec): void {
  if (!ID_PATTERN.test(coach.id) || coaches.has(coach.id)) throw new Error(`sports coach ${coach.id}: invalid or duplicate id`)
  if (![coach.x, coach.z].every(Number.isFinite)) throw new Error(`sports coach ${coach.id}: invalid position`)
  coaches.set(coach.id, coach)
}

export function registerVenue(venue: VenueSpec): void {
  if (!ID_PATTERN.test(venue.id) || venues.has(venue.id)) throw new Error(`sports venue ${venue.id}: invalid or duplicate id`)
  const b = venue.playArea
  if (![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite) || b.minX >= b.maxX || b.minZ >= b.maxZ) {
    throw new Error(`sports venue ${venue.id}: invalid play area`)
  }
  if (!Number.isInteger(venue.rejoinGraceMs) || venue.rejoinGraceMs < 0) throw new Error(`sports venue ${venue.id}: invalid rejoinGraceMs`)
  venues.set(venue.id, venue)
  addCoach({ id: venue.id, x: venue.coach.x, z: venue.coach.z, venues: [venue.id] })
}

export function registerCoach(coach: CoachSpec): void {
  if (coach.venues.length === 0 || coach.venues.some((id) => !venues.has(id))) throw new Error(`sports coach ${coach.id}: unknown venue in ${coach.venues.join(', ')}`)
  addCoach({ ...coach, venues: [...coach.venues] })
}

export function assertVenueZones(): void {
  for (const venue of venues.values()) {
    if (worldSportsPassArea(venue.zone) === null) throw new Error(`sports venue ${venue.id}: ${venue.zone} is not a sports pass area`)
  }
}

function inside(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

function inVenueZone(venue: VenueSpec, player: Player): boolean {
  const zone = worldSportsPassArea(venue.zone)
  return zone !== null && inside(zone, player.x, player.z)
}

function coachVenues(coach: CoachSpec): VenueSpec[] {
  return coach.venues.map((id) => venues.get(id) as VenueSpec)
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function sendError(client: GameClient, code: string, message: string): void {
  client.send('sports_error', { code, message })
}

function lobbyView(venue: VenueSpec, lobby: Lobby, now: number) {
  return {
    venue: venue.id,
    coach: lobby.coach,
    sport: venue.sport,
    phase: lobby.phase,
    settings: lobby.settings,
    players: lobby.entrants.map(({ sessionId, name, team }) => ({ sessionId, name, team })),
    min: lobby.range.min,
    max: lobby.range.max,
    kickoffAt: lobby.kickoffAt,
    serverNow: now
  }
}

function matchView(venue: VenueSpec, match: Match, now: number) {
  return {
    venue: venue.id,
    coach: match.coach,
    sport: venue.sport,
    phase: 'playing' as const,
    settings: match.settings,
    players: activePlayers(match).map(({ sessionId, name, team }) => ({ sessionId, name, team })),
    min: match.range.min,
    max: match.range.max,
    kickoffAt: match.startedAt,
    serverNow: now
  }
}

function defaultRange(venue: VenueSpec): PlayerRange {
  const settings = Object.fromEntries(venue.settings.map((spec) => [spec.key, spec.options[0]]))
  return assertRange(venue.players(settings), `sports venue ${venue.id}`)
}

function idleView(venue: VenueSpec, coachId: string, now: number) {
  const { min, max } = defaultRange(venue)
  return { venue: venue.id, coach: coachId, sport: venue.sport, phase: 'open' as const, settings: null, players: [], min, max, kickoffAt: null, serverNow: now }
}

export function coachViews(room: GameRoom, coach: CoachSpec, now: number) {
  return coachVenues(coach).map((venue) => {
    const lobby = room.sports.lobbies.get(venue.id)
    const match = room.sports.matches.get(venue.id)
    if (lobby) return lobbyView(venue, lobby, now)
    if (match) return matchView(venue, match, now)
    return idleView(venue, coach.id, now)
  })
}

function areaOf(venue: VenueSpec): string {
  return venue.playAreaId ?? venue.id
}

function sharedAreaBusy(room: GameRoom, venue: VenueSpec): boolean {
  for (const other of venues.values()) {
    if (other.id === venue.id || areaOf(other) !== areaOf(venue)) continue
    if (room.sports.lobbies.has(other.id) || room.sports.matches.has(other.id)) return true
  }
  return false
}

function involvedAccounts(room: GameRoom, venueId: string): Set<number> {
  const lobby = room.sports.lobbies.get(venueId)
  const match = room.sports.matches.get(venueId)
  return new Set([...(lobby?.entrants ?? []), ...(match?.players ?? [])].map((p) => p.accountId))
}

function sendToSite(room: GameRoom, type: string, payload: unknown, accounts: ReadonlySet<number>): void {
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && (accounts.has(listener.accountId) || inPassArea(listener.x, listener.z))) c.send(type, payload)
  })
}

function broadcastLobby(room: GameRoom, venue: VenueSpec, lobby: Lobby, now: number): void {
  sendToSite(room, 'sports_lobby', lobbyView(venue, lobby, now), involvedAccounts(room, venue.id))
}

function announceKickoff(room: GameRoom, venueId: string, accounts: ReadonlySet<number>): void {
  sendToSite(room, 'sports_lobby_closed', { venue: venueId, reason: 'kickoff' }, accounts)
}

function closeLobby(room: GameRoom, venue: VenueSpec, coachId: string, reason: 'cancelled' | 'ended', accounts: ReadonlySet<number>, now: number): void {
  sendToSite(room, 'sports_lobby_closed', { venue: venue.id, reason }, accounts)
  sendToSite(room, 'sports_lobby', idleView(venue, coachId, now), accounts)
}

export function isSignedUp(room: GameRoom, accountId: number): boolean {
  for (const lobby of room.sports.lobbies.values()) if (lobby.entrants.some((e) => e.accountId === accountId)) return true
  for (const match of room.sports.matches.values()) if (matchPlayer(match, accountId)) return true
  return false
}

function nearCoach(player: Player, coach: CoachSpec): boolean {
  return Math.hypot(player.x - coach.x, player.z - coach.z) <= SPORTS_COACH_REACH
}

function coachFrom(payload: ClientPayload): CoachSpec | null {
  return typeof payload?.coach === 'string' ? coaches.get(payload.coach) ?? null : null
}

function cooledDown(player: Player, now: number): boolean {
  if (now - player.lastSportsAt < SPORTS_ACTION_COOLDOWN_MS) return false
  player.lastSportsAt = now
  return true
}

export function onSportsCoachOpen(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const coach = coachFrom(payload)
  if (!player || !coach || !cooledDown(player, now)) return
  if (!nearCoach(player, coach)) {
    sendError(client, 'sports_too_far', 'Walk up to the coach.')
    return
  }
  for (const view of coachViews(room, coach, now)) client.send('sports_lobby', view)
}

function venueFrom(coach: CoachSpec, payload: ClientPayload): VenueSpec | null {
  const id = payload?.venue
  return typeof id === 'string' && coach.venues.includes(id) ? venues.get(id) ?? null : null
}

function signupRefusal(room: GameRoom, player: Player, coach: CoachSpec, venue: VenueSpec, now: number): { code: string, message: string } | null {
  if (!nearCoach(player, coach)) return { code: 'sports_too_far', message: 'Walk up to the coach.' }
  if (!hasValidPass(player, now)) return { code: 'sports_no_pass', message: 'You need a sports pass (reception).' }
  if (isSignedUp(room, player.accountId)) return { code: 'sports_already_signed', message: 'You are already signed up for a match.' }
  if (room.sports.matches.has(venue.id)) return { code: 'sports_lobby_full', message: 'A match is already on. Come back after it.' }
  if (!room.sports.lobbies.has(venue.id) && sharedAreaBusy(room, venue)) {
    return { code: 'sports_venue_busy', message: 'The court is taken by another game. Come back after it.' }
  }
  return null
}

function applySignup(room: GameRoom, client: GameClient, player: Player, coach: CoachSpec, venue: VenueSpec, payload: ClientPayload, now: number): void {
  const team = venue.teams ? parseTeam(payload?.team) : null
  if (venue.teams && team === null) {
    sendError(client, 'sports_bad_settings', 'Pick red or blue.')
    return
  }
  const entrant = { sessionId: player.sessionId, accountId: player.accountId, name: player.pseudo, team }
  const open = room.sports.lobbies.get(venue.id)
  if (open) {
    const joined = joinLobby(open, entrant, now)
    if (joined !== 'joined') {
      sendError(client, joined === 'full' ? 'sports_lobby_full' : 'sports_already_signed', joined === 'full' ? 'This match is full.' : 'You are already signed up.')
      return
    }
    broadcastLobby(room, venue, open, now)
    runLobby(room, venue, now)
    return
  }
  const settings = validateSettings(venue.settings, payload?.settings)
  if (!settings) {
    sendError(client, 'sports_bad_settings', 'These match settings are not offered.')
    return
  }
  const lobby = openLobby(venue.id, coach.id, settings, assertRange(venue.players(settings), `sports venue ${venue.id}`), entrant, now)
  room.sports.lobbies.set(venue.id, lobby)
  broadcastLobby(room, venue, lobby, now)
  runLobby(room, venue, now)
}

export async function onSportsSignup(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const coach = coachFrom(payload)
  const venue = coach && venueFrom(coach, payload)
  if (!player?.token || !coach || !venue || player.sportsPending || !cooledDown(player, now)) return
  const refusal = signupRefusal(room, player, coach, venue, now)
  if (refusal) {
    sendError(client, refusal.code, refusal.message)
    return
  }
  if (venue.gear) {
    player.sportsPending = true
    let owned: string[]
    try {
      owned = await ownedGear(player)
    } catch (error) {
      const { code, message } = errorPayload(error, 'Your gear could not be checked.', 'sports_gear_failed')
      sendError(client, code, message)
      return
    } finally {
      player.sportsPending = false
    }
    if (room.players.get(client.sessionId) !== player) return
    if (!owned.includes(venue.gear)) {
      sendError(client, 'sports_no_gear', 'You need your own gear for this sport (Summit Sports, mall).')
      return
    }
    const late = signupRefusal(room, player, coach, venue, now)
    if (late) {
      sendError(client, late.code, late.message)
      return
    }
  }
  applySignup(room, client, player, coach, venue, payload, now)
}

function removeFromLobbies(room: GameRoom, accountId: number, now: number): void {
  for (const [venueId, lobby] of room.sports.lobbies) {
    const accounts = involvedAccounts(room, venueId)
    if (!leaveLobby(lobby, accountId, now)) continue
    const venue = venues.get(venueId) as VenueSpec
    if (lobby.entrants.length === 0) {
      room.sports.lobbies.delete(venueId)
      closeLobby(room, venue, lobby.coach, 'cancelled', accounts, now)
    } else {
      broadcastLobby(room, venue, lobby, now)
    }
  }
}

export function onSportsSignupLeave(room: GameRoom, client: GameClient, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || !cooledDown(player, now)) return
  removeFromLobbies(room, player.accountId, now)
}

function pushOutOf(area: Bounds, x: number, z: number): { x: number, z: number } {
  const margin = 0.5
  const exits = [
    { d: x - area.minX, x: area.minX - margin, z },
    { d: area.maxX - x, x: area.maxX + margin, z },
    { d: z - area.minZ, x, z: area.minZ - margin },
    { d: area.maxZ - z, x, z: area.maxZ + margin }
  ]
  const nearest = exits.reduce((a, b) => (b.d < a.d ? b : a))
  return { x: nearest.x, z: nearest.z }
}

function clearPlayArea(room: GameRoom, venue: VenueSpec, match: Match): void {
  for (const player of room.players.values()) {
    if (matchPlayer(match, player.accountId) || !inside(venue.playArea, player.x, player.z)) continue
    const edge = pushOutOf(venue.playArea, player.x, player.z)
    player.x = edge.x
    player.z = edge.z
    const client = clientOf(room, player.sessionId)
    if (!client) continue
    client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason: 'venue_reserved' })
    room.broadcastMove(client, player)
  }
}

function kickoff(room: GameRoom, venue: VenueSpec, lobby: Lobby, now: number): void {
  const accounts = involvedAccounts(room, venue.id)
  room.sports.lobbies.delete(venue.id)
  const match = startMatch(lobby, randomUUID(), venue.sport, now)
  room.sports.matches.set(venue.id, match)
  for (const p of match.players) {
    const player = room.players.get(p.sessionId)
    if (!player || !inVenueZone(venue, player)) markAway(match, p.accountId, now)
  }
  announceKickoff(room, venue.id, accounts)
  clearPlayArea(room, venue, match)
  venue.onKickoff(room, match)
}

function runLobby(room: GameRoom, venue: VenueSpec, now: number): void {
  const lobby = room.sports.lobbies.get(venue.id)
  if (!lobby) return
  const due = lobbyDue(lobby, now)
  if (due === 'kickoff') kickoff(room, venue, lobby, now)
  if (due === 'cancel') {
    const accounts = involvedAccounts(room, venue.id)
    room.sports.lobbies.delete(venue.id)
    closeLobby(room, venue, lobby.coach, 'cancelled', accounts, now)
  }
}

export function endMatch(room: GameRoom, venueId: string, end: MatchEnd, now = Date.now()): void {
  const match = room.sports.matches.get(venueId)
  const venue = venues.get(venueId)
  if (!match || !venue) return
  const accounts = involvedAccounts(room, venueId)
  room.sports.matches.delete(venueId)
  venue.onEnd(room, match, end)
  closeLobby(room, venue, match.coach, 'ended', accounts, now)
}

function runMatch(room: GameRoom, venue: VenueSpec, match: Match, now: number): void {
  for (const out of expireAway(match, now, venue.rejoinGraceMs)) venue.onLeave(room, match, out.accountId)
  const lost = forfeit(match, venue.teams)
  if (lost) {
    endMatch(room, venue.id, { reason: 'forfeit', loser: lost.loser }, now)
    return
  }
  venue.onTick(room, match, now - match.startedAt)
}

export function tickSports(room: GameRoom, now = Date.now()): void {
  for (const venue of venues.values()) {
    runLobby(room, venue, now)
    const match = room.sports.matches.get(venue.id)
    if (match) runMatch(room, venue, match, now)
  }
}

export function entersReservedVenue(room: GameRoom, player: Player, x: number, z: number): boolean {
  for (const venue of venues.values()) {
    if (!inside(venue.playArea, x, z) || inside(venue.playArea, player.x, player.z)) continue
    const match = room.sports.matches.get(venue.id)
    if (match && !matchPlayer(match, player.accountId)) return true
  }
  return false
}

export function updateMatchesOnMove(room: GameRoom, player: Player, now: number): void {
  for (const venue of venues.values()) {
    const match = room.sports.matches.get(venue.id)
    if (!match || !matchPlayer(match, player.accountId)) continue
    if (inVenueZone(venue, player)) markBack(match, player.accountId, player.sessionId)
    else markAway(match, player.accountId, now)
  }
}

export function leaveSports(room: GameRoom, player: Player, now: number): void {
  removeFromLobbies(room, player.accountId, now)
  for (const match of room.sports.matches.values()) markAway(match, player.accountId, now)
}

function checkResult(match: Match, result: MatchResult): MatchResult {
  const known = match.players.some((p) => p.accountId === result.accountId)
  const optionalInt = (v: number | undefined) => v === undefined || (Number.isInteger(v) && v >= 0)
  if (!known || !RESULT_KINDS.includes(result.result) || !optionalInt(result.place) || !optionalInt(result.timeMs) || !optionalInt(result.score)) {
    throw new Error(`match ${match.id}: invalid result ${JSON.stringify(result)}`)
  }
  return result
}

export function matchRecord(match: Match, results: readonly MatchResult[], endedAt: number) {
  if (new Set(results.map((r) => r.accountId)).size !== results.length) throw new Error(`match ${match.id}: duplicate player result`)
  return {
    ref: match.id,
    sport: match.sport,
    venue: match.venue,
    settings: match.settings,
    startedAt: match.startedAt,
    endedAt,
    players: results.map((r) => {
      const { accountId, team, result, place, timeMs, score } = checkResult(match, r)
      return { accountId, team, result, ...(place === undefined ? {} : { place }), ...(timeMs === undefined ? {} : { timeMs }), ...(score === undefined ? {} : { score }) }
    })
  }
}

function recorderToken(room: GameRoom, match: Match): string | null {
  const players = [...room.players.values()].filter((p) => p.token)
  const inMatch = players.find((p) => match.players.some((m) => m.accountId === p.accountId))
  return (inMatch ?? players[0])?.token ?? null
}

export async function recordMatch(room: GameRoom, match: Match, results: readonly MatchResult[], endedAt = Date.now()): Promise<void> {
  const record = matchRecord(match, results, endedAt)
  try {
    await callRealtimeBackend(recorderToken(room, match), '/sports/matches', 'POST', record)
  } catch (error) {
    warn(`match ${match.id} not recorded`, error)
  }
}
