import type { Bounds, ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { EYE_HEIGHT } from '../houseObjects.ts'
import { punchDirection } from '../punch.ts'
import { readSportRules, worldSportsPassArea } from '../world.ts'
import {
  type Bout,
  type BoxingRules,
  PUNCH_KINDS,
  type Point3,
  type PunchKind,
  advanceBout,
  boxerOf,
  canGetUp,
  countEndsAt,
  dodge,
  forfeitBout,
  getUpPress,
  parseBoxingRules,
  punch,
  setGuard,
  startBout
} from './boxingBout.ts'
import { type Match, activePlayers, matchPlayer, parseSignupRules } from './signup.ts'
import { type MatchEnd, type MatchResult, endMatch, recordMatch, registerCoach, registerVenue } from './venues.ts'

export const BOXING_VENUE = 'boxing_ring'
const STATE_EVERY_MS = 250
const RING_LEAVE_MARGIN_M = 0.5
const DODGE_SIDES = ['left', 'right'] as const

interface Fight {
  bout: Bout
  match: Match
  sentAt: number
}

const fights = new Map<string, Fight>()
let boxingRules: BoxingRules | null = null

function rulesOf(): BoxingRules {
  if (!boxingRules) throw new Error('boxing rules are not loaded')
  return boxingRules
}

function ringBounds(rules: BoxingRules): Bounds {
  const { x, z } = rules.ringCentre
  const h = rules.ringHalfM
  return { minX: x - h, maxX: x + h, minZ: z - h, maxZ: z + h }
}

function inside(b: Bounds, x: number, z: number, margin = 0): boolean {
  return x >= b.minX - margin && x <= b.maxX + margin && z >= b.minZ - margin && z <= b.maxZ + margin
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function playerOfAccount(room: GameRoom, match: Match, accountId: number): Player | null {
  const entry = matchPlayer(match, accountId)
  const player = entry ? room.players.get(entry.sessionId) : undefined
  return player && player.accountId === accountId ? player : null
}

function moveTo(room: GameRoom, player: Player, x: number, y: number, z: number, yaw: number, now: number): void {
  Object.assign(player, { x, y, z, ry: yaw, fallPeakY: y, lastMoveAt: now })
  const client = clientOf(room, player.sessionId)
  if (!client) return
  client.send('teleported', { x, y, z, ry: yaw })
  room.broadcastMove(client, player)
}

function yawTowards(from: Point3, to: Point3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

function audienceAccounts(fight: Fight): Set<number> {
  return new Set(fight.match.players.map((p) => p.accountId))
}

function sendToHall(room: GameRoom, fight: Fight, type: string, payload: unknown): void {
  const hall = worldSportsPassArea(rulesOf().zone)
  const boxers = audienceAccounts(fight)
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && (boxers.has(listener.accountId) || (hall && inside(hall, listener.x, listener.z)))) c.send(type, payload)
  })
}

function sessionOf(match: Match, accountId: number): string | null {
  return match.players.find((p) => p.accountId === accountId)?.sessionId ?? null
}

export function boutView(fight: Fight, now: number) {
  const { bout, match } = fight
  return {
    venue: BOXING_VENUE,
    phase: bout.phase,
    round: bout.round,
    rounds: bout.rounds,
    maxKnockdowns: bout.rules.knockdown.maxPerFight,
    phaseEndsAt: bout.phaseEndsAt,
    serverNow: now,
    boxers: bout.boxers.map((b) => ({
      sessionId: sessionOf(match, b.accountId),
      name: match.players.find((p) => p.accountId === b.accountId)?.name ?? '',
      corner: b.corner,
      health: Math.round(b.health),
      maxHealth: bout.rules.health,
      endurance: Math.round(b.endurance),
      maxEndurance: bout.rules.endurance,
      guard: b.guard,
      knockdowns: b.knockdowns,
      countEndsAt: countEndsAt(bout, b),
      canGetUp: canGetUp(bout, b),
      points: b.points
    })),
    result: bout.result && { winner: bout.result.winner === null ? null : sessionOf(match, bout.result.winner), method: bout.result.method }
  }
}

function sendState(room: GameRoom, fight: Fight, now: number): void {
  fight.sentAt = now
  sendToHall(room, fight, 'boxing_state', boutView(fight, now))
}

function placeInCorners(room: GameRoom, fight: Fight, now: number): void {
  const rules = rulesOf()
  for (const b of fight.bout.boxers) {
    const player = playerOfAccount(room, fight.match, b.accountId)
    const at = rules.corners[b.corner]
    if (player) moveTo(room, player, at.x, at.y + EYE_HEIGHT, at.z, yawTowards(at, rules.ringCentre), now)
  }
}

function sendOutOfRing(room: GameRoom, fight: Fight, now: number): void {
  const rules = rulesOf()
  const ring = ringBounds(rules)
  for (const b of fight.bout.boxers) {
    const player = room.players.get(sessionOf(fight.match, b.accountId) ?? '')
    if (!player || player.accountId !== b.accountId || !inside(ring, player.x, player.z, RING_LEAVE_MARGIN_M)) continue
    const at = rules.exits[b.corner]
    moveTo(room, player, at.x, at.y + EYE_HEIGHT, at.z, yawTowards(at, rules.ringCentre), now)
  }
}

function kickoff(room: GameRoom, match: Match): void {
  const [red, blue] = match.players
  const now = match.startedAt
  const fight: Fight = { bout: startBout(rulesOf(), Number(match.settings.rounds), red.accountId, blue.accountId, now), match, sentAt: 0 }
  fights.set(match.id, fight)
  placeInCorners(room, fight, now)
  sendState(room, fight, now)
}

function checkRingExits(room: GameRoom, fight: Fight): void {
  if (fight.bout.phase === 'intro' || fight.bout.phase === 'over') return
  const ring = ringBounds(rulesOf())
  for (const p of activePlayers(fight.match)) {
    if (p.awaySince !== null) continue
    const player = room.players.get(p.sessionId)
    if (player && !inside(ring, player.x, player.z, RING_LEAVE_MARGIN_M)) forfeitBout(fight.bout, p.accountId)
  }
}

function tick(room: GameRoom, match: Match, elapsedMs: number): void {
  const fight = fights.get(match.id)
  if (!fight) return
  const now = match.startedAt + elapsedMs
  const before = fight.bout.phase
  advanceBout(fight.bout, now)
  if (fight.bout.phase === 'intro') placeAwayFromRing(room, fight, now)
  checkRingExits(room, fight)
  if (fight.bout.phase === 'over') {
    endMatch(room, BOXING_VENUE, { reason: 'finished' }, now)
    return
  }
  if (fight.bout.phase !== before || now - fight.sentAt >= STATE_EVERY_MS) sendState(room, fight, now)
}

function placeAwayFromRing(room: GameRoom, fight: Fight, now: number): void {
  const rules = rulesOf()
  const ring = ringBounds(rules)
  for (const b of fight.bout.boxers) {
    const player = playerOfAccount(room, fight.match, b.accountId)
    if (!player || matchPlayer(fight.match, b.accountId)?.awaySince !== null || inside(ring, player.x, player.z)) continue
    const at = rules.corners[b.corner]
    moveTo(room, player, at.x, at.y + EYE_HEIGHT, at.z, yawTowards(at, rules.ringCentre), now)
  }
}

function leave(_room: GameRoom, match: Match, accountId: number): void {
  const fight = fights.get(match.id)
  if (fight) forfeitBout(fight.bout, accountId)
}

export function boutResults(bout: Bout): MatchResult[] {
  const result = bout.result
  return bout.boxers.map((b) => {
    const outcome = result === null ? 'dnf' : result.winner === null ? 'draw' : result.winner === b.accountId ? 'win' : 'loss'
    return { accountId: b.accountId, team: null, result: outcome, score: b.points }
  })
}

function end(room: GameRoom, match: Match, _end: MatchEnd): void {
  const fight = fights.get(match.id)
  if (!fight) return
  fights.delete(match.id)
  const now = Date.now()
  sendOutOfRing(room, fight, now)
  sendToHall(room, fight, 'boxing_state', boutView(fight, now))
  void recordMatch(room, match, boutResults(fight.bout), now)
}

function fightOf(room: GameRoom, client: GameClient): { fight: Fight, player: Player } | null {
  const player = room.players.get(client.sessionId)
  if (!player) return null
  const match = room.sports.matches.get(BOXING_VENUE)
  const fight = match && fights.get(match.id)
  if (!fight || !boxerOf(fight.bout, player.accountId) || matchPlayer(fight.match, player.accountId)?.sessionId !== player.sessionId) return null
  return { fight, player }
}

function opponentPlayer(room: GameRoom, fight: Fight, accountId: number): Player | null {
  const other = fight.bout.boxers.find((b) => b.accountId !== accountId)
  return other ? playerOfAccount(room, fight.match, other.accountId) : null
}

export function onBoxingPunch(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const kind = payload?.kind
  if (!PUNCH_KINDS.includes(kind as PunchKind)) return
  const found = fightOf(room, client)
  if (!found) return
  const { fight, player } = found
  const attacker = boxerOf(fight.bout, player.accountId)
  const target = opponentPlayer(room, fight, player.accountId)
  if (!attacker || !target) return
  const dir = punchDirection(player, target)
  const reach = {
    distM: dir ? dir.dist : 0,
    facingCos: dir ? -Math.sin(player.ry) * dir.x - Math.cos(player.ry) * dir.z : 1,
    heightM: Math.abs(target.y - player.y)
  }
  const defender = boxerOf(fight.bout, target.accountId)
  const healthBefore = defender?.health ?? 0
  const outcome = punch(fight.bout, attacker, kind as PunchKind, reach, now)
  if (outcome === 'tired') client.send('boxing_tired', {})
  if (outcome !== 'landed' && outcome !== 'blocked' && outcome !== 'dodged' && outcome !== 'missed') return
  sendToHall(room, fight, 'boxing_hit', { sessionId: player.sessionId, targetSessionId: target.sessionId, kind, outcome, damage: Math.max(0, Math.round(healthBefore - (defender?.health ?? 0))) })
  sendState(room, fight, now)
}

export function onBoxingGuard(room: GameRoom, client: GameClient, payload: ClientPayload): void {
  if (typeof payload?.up !== 'boolean') return
  const found = fightOf(room, client)
  const boxer = found && boxerOf(found.fight.bout, found.player.accountId)
  if (found && boxer && setGuard(found.fight.bout, boxer, payload.up)) sendState(room, found.fight, Date.now())
}

export function onBoxingDodge(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const side = payload?.side
  if (!DODGE_SIDES.includes(side as typeof DODGE_SIDES[number])) return
  const found = fightOf(room, client)
  const boxer = found && boxerOf(found.fight.bout, found.player.accountId)
  if (!found || !boxer || !dodge(found.fight.bout, boxer, now)) return
  sendToHall(room, found.fight, 'boxing_dodged', { sessionId: found.player.sessionId, side })
}

export function onBoxingGetUp(room: GameRoom, client: GameClient, now = Date.now()): void {
  const found = fightOf(room, client)
  const boxer = found && boxerOf(found.fight.bout, found.player.accountId)
  if (found && boxer && getUpPress(found.fight.bout, boxer, now)) sendState(room, found.fight, now)
}

export function boxingFight(matchId: string): Fight | undefined {
  return fights.get(matchId)
}

export async function registerBoxing(): Promise<BoxingRules> {
  const raw = await readSportRules('boxing')
  const rules = parseBoxingRules(raw)
  const signup = parseSignupRules(raw, 'boxing')
  boxingRules = rules
  registerVenue({
    id: BOXING_VENUE,
    sport: 'boxing',
    zone: rules.zone,
    coach: rules.coach,
    playArea: ringBounds(rules),
    teams: signup.teams,
    settings: signup.settings,
    players: () => ({ min: rules.minPlayers, max: rules.maxPlayers }),
    rejoinGraceMs: rules.rejoinGraceSec * 1000,
    gear: rules.gear,
    onKickoff: kickoff,
    onTick: tick,
    onLeave: leave,
    onEnd: end
  })
  registerCoach({ id: rules.coachId, x: rules.coach.x, z: rules.coach.z, venues: [BOXING_VENUE] })
  return rules
}
