import { randomUUID } from 'node:crypto'
import { callRealtimeBackend } from '../backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { readSportRules, worldSportsPassArea } from '../world.ts'
import {
  type Climb,
  type ClimbLine,
  type ClimbingRules,
  type Pose,
  climbTime,
  climberPose,
  clickHold,
  expire,
  loweredY,
  nearStart,
  parseClimbingRules,
  standingPose,
  startClimb,
  startLowering,
  windowOf
} from './climbingLogic.ts'
import { hasLoan } from './loans.ts'
import { activePlayers, type Match } from './signup.ts'
import { CLIMBING_SHOES } from './sportsConstants.ts'
import { type MatchEnd, type MatchResult, endMatch, isSignedUp, recordMatch, registerVenue } from './venues.ts'

export const CLIMBING_DUEL = 'climbing_duel'
export const CLIMBING_ZONE = 'sports_climbing'
export const CLIMB_TICK_MS = 100
const DUEL_PLAYERS = { min: 2, max: 2 }
const START_COOLDOWN_MS = 1000
const POSE_DRIFT_M = 1

type ClimbResult = 'topped' | 'fell' | 'let_go' | 'cancelled' | 'won' | 'beaten'
type ClimbEvent = 'start' | 'hold' | 'miss' | 'fall' | 'top' | 'end'

interface ActiveClimb extends Climb {
  sessionId: string
  accountId: number
  pose: Pose
  timeMs?: number
  result?: 'fell' | 'let_go'
}

interface DuelState {
  results: Map<number, MatchResult>
}

let rules: ClimbingRules | null = null
const climbsByRoom = new WeakMap<GameRoom, Map<string, ActiveClimb>>()
const duels = new Map<string, DuelState>()
const lastStartAt = new WeakMap<Player, number>()

export function setClimbingRules(raw: unknown): ClimbingRules {
  const parsed = parseClimbingRules(raw)
  if (parsed.zone !== CLIMBING_ZONE) throw new Error(`sports/rules/climbing.json: zone must be ${CLIMBING_ZONE}`)
  if (parsed.signup.teams || parsed.signup.settings.length > 0) throw new Error('sports/rules/climbing.json: the duel has no teams and no settings')
  if (parsed.minPlayers !== DUEL_PLAYERS.min || parsed.maxPlayers !== DUEL_PLAYERS.max) throw new Error('sports/rules/climbing.json: the duel is for 2 climbers')
  rules = parsed
  return parsed
}

export async function loadClimbing(): Promise<void> {
  setClimbingRules(await readSportRules('climbing'))
  console.log(`[sports] climbing: ${rules?.lines.size} lines loaded`)
}

function loadedRules(): ClimbingRules {
  if (!rules) throw new Error('climbing rules are not loaded (loadClimbing at boot)')
  return rules
}

function climbsOf(room: GameRoom): Map<string, ActiveClimb> {
  let climbs = climbsByRoom.get(room)
  if (!climbs) {
    climbs = new Map()
    climbsByRoom.set(room, climbs)
  }
  return climbs
}

export function climbOf(room: GameRoom, sessionId: string): ActiveClimb | undefined {
  return climbsByRoom.get(room)?.get(sessionId)
}

function inClimbingHall(player: Player): boolean {
  const b = worldSportsPassArea(CLIMBING_ZONE)
  return b !== null && player.x >= b.minX && player.x <= b.maxX && player.z >= b.minZ && player.z <= b.maxZ
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function sendError(client: GameClient, code: string, message: string): void {
  client.send('climb_error', { code, message })
}

function broadcastClimb(room: GameRoom, climb: ActiveClimb, event: ClimbEvent, now: number, end?: { result: ClimbResult, timeMs?: number }): void {
  const r = loadedRules()
  const { opensAt, closesAt } = windowOf(r, climb)
  const payload = {
    sessionId: climb.sessionId,
    line: climb.line.id,
    event,
    phase: end ? 'ended' : climb.phase,
    next: climb.next,
    holds: climb.line.holds.length,
    grip: climb.grip,
    gripMax: r.gripMax,
    litAt: climb.litAt,
    opensAt,
    closesAt,
    startedAt: climb.startedAt,
    serverNow: now,
    duel: climb.duel !== null,
    ...(end ? { result: end.result, ...(end.timeMs === undefined ? {} : { timeMs: end.timeMs }) } : {})
  }
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && (c.sessionId === climb.sessionId || inClimbingHall(listener))) c.send('climb_state', payload)
  })
}

function placeClimber(room: GameRoom, climb: ActiveClimb, pose: Pose): void {
  const player = room.players.get(climb.sessionId)
  const client = clientOf(room, climb.sessionId)
  climb.pose = pose
  if (!player || !client) return
  player.x = pose.x
  player.y = pose.y
  player.z = pose.z
  player.ry = pose.ry
  client.send('position_correction', { x: pose.x, y: pose.y, z: pose.z, reason: 'climbing' })
  room.broadcastMove(client, player)
}

function lineTaken(room: GameRoom, line: ClimbLine): boolean {
  for (const climb of climbsOf(room).values()) if (climb.line.id === line.id) return true
  return false
}

function startRefusal(room: GameRoom, player: Player, line: ClimbLine, now: number): { code: string, message: string } | null {
  const r = loadedRules()
  if (!inClimbingHall(player)) return { code: 'climb_too_far', message: 'Walk up to the start of the route.' }
  if (!hasLoan(player, CLIMBING_SHOES)) return { code: 'climb_no_shoes', message: 'Pick up climbing shoes with a sports pass (reception).' }
  if (!nearStart(r, line, player.x, player.z)) return { code: 'climb_too_far', message: 'Walk up to the start of the route.' }
  if (climbOf(room, player.sessionId)) return { code: 'climb_already', message: 'You are already climbing.' }
  if (isSignedUp(room, player.accountId)) return { code: 'climb_signed_up', message: 'You are signed up for a duel.' }
  if (r.twins.includes(line.id) && room.sports.matches.has(CLIMBING_DUEL)) return { code: 'climb_lane_reserved', message: 'A speed duel is on. Come back after it.' }
  if (lineTaken(room, line)) return { code: 'climb_line_taken', message: 'Someone is on this route.' }
  if (now - (lastStartAt.get(player) ?? -Infinity) < START_COOLDOWN_MS) return { code: 'climb_cooldown', message: 'Catch your breath first.' }
  return null
}

function begin(room: GameRoom, player: Player, line: ClimbLine, now: number, duel: string | null = null, delayMs = 0): ActiveClimb {
  const r = loadedRules()
  const climb: ActiveClimb = {
    ...startClimb(r, line, now, duel, delayMs),
    sessionId: player.sessionId,
    accountId: player.accountId,
    pose: climberPose(r, line, 0)
  }
  climbsOf(room).set(player.sessionId, climb)
  lastStartAt.set(player, now)
  placeClimber(room, climb, climb.pose)
  broadcastClimb(room, climb, 'start', now)
  return climb
}

export function onClimbStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const line = typeof payload?.line === 'string' ? loadedRules().lines.get(payload.line) : undefined
  if (!player || !line) return
  const refusal = startRefusal(room, player, line, now)
  if (refusal) {
    sendError(client, refusal.code, refusal.message)
    return
  }
  begin(room, player, line, now)
}

function recordFreeTop(room: GameRoom, climb: ActiveClimb, timeMs: number, now: number): void {
  const player = room.players.get(climb.sessionId)
  if (!player?.token || climb.startedAt === null) return
  const record = {
    ref: randomUUID(),
    sport: 'climbing',
    venue: climb.line.id,
    settings: {},
    startedAt: climb.startedAt,
    endedAt: now,
    players: [{ accountId: climb.accountId, team: null, result: 'finished', timeMs }]
  }
  callRealtimeBackend(player.token, '/sports/matches', 'POST', record).catch((error) => {
    console.warn(`[sports] climb on ${climb.line.id} not recorded:`, error instanceof Error ? error.message : error)
  })
}

function finish(room: GameRoom, climb: ActiveClimb, result: ClimbResult, now: number, timeMs?: number): void {
  const r = loadedRules()
  climbsOf(room).delete(climb.sessionId)
  if (room.players.has(climb.sessionId)) placeClimber(room, climb, standingPose(r, climb.line))
  broadcastClimb(room, climb, 'end', now, { result, timeMs })
}

function duelResult(climb: ActiveClimb, result: MatchResult): void {
  const duel = climb.duel ? duels.get(climb.duel) : undefined
  if (duel && !duel.results.has(climb.accountId)) duel.results.set(climb.accountId, result)
}

function duelOver(match: Match): boolean {
  const duel = duels.get(match.id)
  if (!duel) return true
  if ([...duel.results.values()].some((r) => r.result === 'win')) return true
  return activePlayers(match).every((p) => duel.results.has(p.accountId))
}

function closeDuelIfOver(room: GameRoom, matchId: string, now: number): void {
  const match = room.sports.matches.get(CLIMBING_DUEL)
  if (match && match.id === matchId && duelOver(match)) endMatch(room, CLIMBING_DUEL, { reason: 'finished' }, now)
}

function topOut(room: GameRoom, climb: ActiveClimb, now: number): void {
  const timeMs = climbTime(climb, now)
  if (climb.duel) {
    duelResult(climb, { accountId: climb.accountId, team: null, result: 'win', place: 1, timeMs })
    broadcastClimb(room, climb, 'top', now)
    finish(room, climb, 'won', now, timeMs)
    closeDuelIfOver(room, climb.duel, now)
    return
  }
  broadcastClimb(room, climb, 'top', now)
  recordFreeTop(room, climb, timeMs, now)
  if (climb.line.kind === 'boulder') {
    finish(room, climb, 'topped', now, timeMs)
    return
  }
  climb.timeMs = timeMs
  startLowering(climb, climb.pose.y, now)
}

function fall(room: GameRoom, climb: ActiveClimb, result: 'fell' | 'let_go', now: number): void {
  if (climb.duel) {
    duelResult(climb, { accountId: climb.accountId, team: null, result: 'dnf' })
    closeDuelIfOver(room, climb.duel, now)
  }
  if (!climbsOf(room).has(climb.sessionId)) return
  if (climb.line.kind === 'boulder' || climb.phase === 'lowering') {
    finish(room, climb, result, now)
    return
  }
  climb.result = result
  startLowering(climb, climb.pose.y, now)
  broadcastClimb(room, climb, 'fall', now)
}

export function onClimbHold(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const climb = climbOf(room, client.sessionId)
  const hold = payload?.hold
  if (!climb || typeof hold !== 'number' || !Number.isInteger(hold) || hold < -1 || hold >= climb.line.holds.length) return
  const r = loadedRules()
  const outcome = clickHold(r, climb, hold, now)
  if (outcome === 'ignored') return
  if (outcome === 'top') {
    placeClimber(room, climb, climberPose(r, climb.line, climb.next))
    topOut(room, climb, now)
    return
  }
  if (outcome === 'fall') {
    fall(room, climb, 'fell', now)
    return
  }
  if (outcome === 'hold') placeClimber(room, climb, climberPose(r, climb.line, climb.next))
  broadcastClimb(room, climb, outcome, now)
}

export function onClimbLetGo(room: GameRoom, client: GameClient, now = Date.now()): void {
  const climb = climbOf(room, client.sessionId)
  if (!climb || climb.phase !== 'climbing') return
  fall(room, climb, 'let_go', now)
}

function cancel(room: GameRoom, climb: ActiveClimb, now: number): void {
  if (climb.duel) duelResult(climb, { accountId: climb.accountId, team: null, result: 'dnf' })
  finish(room, climb, 'cancelled', now)
}

function stillOnWall(room: GameRoom, climb: ActiveClimb, now: number): boolean {
  const player = room.players.get(climb.sessionId)
  if (!player) return false
  if (now < player.knockedOutUntil || !hasLoan(player, CLIMBING_SHOES)) return false
  return Math.hypot(player.x - climb.pose.x, player.z - climb.pose.z) <= POSE_DRIFT_M
}

export function tickClimbing(room: GameRoom, now = Date.now()): void {
  const r = rules
  const climbs = climbsByRoom.get(room)
  if (!r || !climbs) return
  for (const climb of [...climbs.values()]) {
    if (!room.players.has(climb.sessionId)) {
      climbs.delete(climb.sessionId)
      if (climb.duel) duelResult(climb, { accountId: climb.accountId, team: null, result: 'dnf' })
      continue
    }
    if (!stillOnWall(room, climb, now)) {
      cancel(room, climb, now)
      if (climb.duel) closeDuelIfOver(room, climb.duel, now)
      continue
    }
    if (climb.phase === 'lowering') {
      const { y, done } = loweredY(r, climb, now)
      if (done) finish(room, climb, climb.result ?? 'topped', now, climb.result ? undefined : climb.timeMs)
      else placeClimber(room, climb, { ...climb.pose, y })
      continue
    }
    const outcome = expire(r, climb, now)
    if (outcome === 'fall') fall(room, climb, 'fell', now)
    else if (outcome === 'miss') broadcastClimb(room, climb, 'miss', now)
  }
}

function duelKickoff(room: GameRoom, match: Match): void {
  const r = loadedRules()
  const now = match.startedAt
  duels.set(match.id, { results: new Map() })
  for (const climb of [...climbsOf(room).values()]) {
    if (r.twins.includes(climb.line.id)) cancel(room, climb, now)
  }
  activePlayers(match).forEach((p, i) => {
    const player = room.players.get(p.sessionId)
    const line = r.lines.get(r.twins[i]) as ClimbLine
    if (player) begin(room, player, line, now, match.id, r.duelStartDelayMs)
  })
}

function duelLeave(room: GameRoom, match: Match, accountId: number): void {
  for (const climb of [...climbsOf(room).values()]) {
    if (climb.duel === match.id && climb.accountId === accountId) cancel(room, climb, Date.now())
  }
  duels.get(match.id)?.results.set(accountId, { accountId, team: null, result: 'dnf' })
}

function duelTick(room: GameRoom, match: Match): void {
  closeDuelIfOver(room, match.id, Date.now())
}

function duelEnd(room: GameRoom, match: Match, _end: MatchEnd): void {
  const now = Date.now()
  const duel = duels.get(match.id) ?? { results: new Map<number, MatchResult>() }
  duels.delete(match.id)
  const someoneWon = [...duel.results.values()].some((r) => r.result === 'win')
  for (const climb of [...climbsOf(room).values()]) {
    if (climb.duel !== match.id) continue
    if (!duel.results.has(climb.accountId)) duel.results.set(climb.accountId, { accountId: climb.accountId, team: null, result: someoneWon ? 'loss' : 'dnf' })
    finish(room, climb, someoneWon ? 'beaten' : 'cancelled', now)
  }
  const results = match.players.map((p) => duel.results.get(p.accountId) ?? { accountId: p.accountId, team: null, result: 'dnf' as const })
  void recordMatch(room, match, results, now)
}

registerVenue({
  id: CLIMBING_DUEL,
  sport: 'climbing',
  zone: CLIMBING_ZONE,
  coach: { x: -571.8, z: -203.5 },
  playArea: { minX: -576.3, maxX: -572.3, minZ: -206.4, maxZ: -200.6 },
  teams: false,
  settings: [],
  players: () => DUEL_PLAYERS,
  rejoinGraceMs: 0,
  onKickoff: duelKickoff,
  onTick: duelTick,
  onLeave: duelLeave,
  onEnd: duelEnd
})
