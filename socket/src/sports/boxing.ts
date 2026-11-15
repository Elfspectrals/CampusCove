import type { Bounds, ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { EYE_HEIGHT } from '../houseObjects.ts'
import { punchDirection } from '../punch.ts'
import { readSportRules, worldSportsPassArea } from '../world.ts'
import {
  type Bout,
  type Boxer,
  type BoxingRules,
  HANDS,
  type Hand,
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
  newCharges,
  parseBoxingRules,
  pressHand,
  punch,
  releaseHand,
  setGuard,
  startBout,
  takeQueued
} from './boxingBout.ts'
import { onGearChanged, usableGear } from './gear.ts'
import { type Match, activePlayers, matchPlayer, parseSignupRules } from './signup.ts'
import { type MatchEnd, type MatchResult, endMatch, recordMatch, registerCoach, registerVenue } from './venues.ts'

export const BOXING_VENUE = 'boxing_ring'
const STATE_EVERY_MS = 250
const RING_LEAVE_MARGIN_M = 0.5
const DODGE_SIDES = ['left', 'right'] as const
const BAG_REACH_M = 1.3
const BAG_HIT_GAP_MS = 400
const GLOVES_CHECK_TTL_MS = 60_000

interface Fight {
  bout: Bout
  match: Match
  sentAt: number
}

const fights = new Map<string, Fight>()
const glovesChecks = new Map<number, { owned: Promise<boolean>, at: number }>()
const lastBagHitAt = new Map<number, number>()
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
  throwQueued(room, fight, now)
  sendCharges(room, fight, now)
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

function fightOfPlayer(room: GameRoom, player: Player): Fight | null {
  if (fights.size === 0) return null
  const match = room.sports.matches.get(BOXING_VENUE)
  const fight = match && fights.get(match.id)
  if (!fight || !boxerOf(fight.bout, player.accountId) || matchPlayer(fight.match, player.accountId)?.sessionId !== player.sessionId) return null
  return fight
}

function fightOf(room: GameRoom, client: GameClient): { fight: Fight, player: Player } | null {
  const player = room.players.get(client.sessionId)
  const fight = player && fightOfPlayer(room, player)
  return player && fight ? { fight, player } : null
}

export function boxerIsDown(room: GameRoom, player: Player): boolean {
  const fight = fightOfPlayer(room, player)
  return fight !== null && fight.bout.phase !== 'over' && boxerOf(fight.bout, player.accountId)?.down != null
}

export function inBoutTogether(room: GameRoom, a: Player, b: Player): boolean {
  const fight = fightOfPlayer(room, a)
  return fight !== null && fight === fightOfPlayer(room, b)
}

function opponentPlayer(room: GameRoom, fight: Fight, accountId: number): Player | null {
  const other = fight.bout.boxers.find((b) => b.accountId !== accountId)
  return other ? playerOfAccount(room, fight.match, other.accountId) : null
}

function throwPunch(room: GameRoom, fight: Fight, player: Player, attacker: Boxer, kind: PunchKind, now: number): void {
  const target = opponentPlayer(room, fight, player.accountId)
  if (!target) return
  const dir = punchDirection(player, target)
  const reach = {
    distM: dir ? dir.dist : 0,
    facingCos: dir ? -Math.sin(player.ry) * dir.x - Math.cos(player.ry) * dir.z : 1,
    heightM: Math.abs(target.y - player.y)
  }
  const defender = boxerOf(fight.bout, target.accountId)
  const healthBefore = defender?.health ?? 0
  const outcome = punch(fight.bout, attacker, kind, reach, now)
  if (outcome === 'tired') clientOf(room, player.sessionId)?.send('boxing_tired', {})
  if (outcome !== 'landed' && outcome !== 'blocked' && outcome !== 'dodged' && outcome !== 'missed') return
  sendToHall(room, fight, 'boxing_hit', {
    sessionId: player.sessionId,
    targetSessionId: target.sessionId,
    kind,
    outcome,
    damage: Math.max(0, Math.round(healthBefore - (defender?.health ?? 0))),
    combo: attacker.combo,
    chain: attacker.chain.length
  })
  sendState(room, fight, now)
}

function throwQueued(room: GameRoom, fight: Fight, now: number): void {
  for (const boxer of fight.bout.boxers) {
    const kind = takeQueued(boxer, now)
    const player = kind && playerOfAccount(room, fight.match, boxer.accountId)
    if (kind && player) throwPunch(room, fight, player, boxer, kind, now)
  }
}

function sendCharges(room: GameRoom, fight: Fight, now: number): void {
  for (const { boxer, hand } of newCharges(fight.bout, now)) {
    const sessionId = sessionOf(fight.match, boxer.accountId)
    if (sessionId) sendToHall(room, fight, 'boxing_charge', { sessionId, hand, on: true })
  }
}

function handOf(payload: ClientPayload): Hand | null {
  const hand = payload?.hand
  return HANDS.includes(hand as Hand) ? hand as Hand : null
}

export function onBoxingPress(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const hand = handOf(payload)
  const found = hand && fightOf(room, client)
  const boxer = found && boxerOf(found.fight.bout, found.player.accountId)
  if (hand && boxer) pressHand(found.fight.bout, boxer, hand, now)
}

export function onBoxingRelease(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const hand = handOf(payload)
  const found = hand && fightOf(room, client)
  const boxer = found && boxerOf(found.fight.bout, found.player.accountId)
  if (!hand || !found || !boxer) return
  if (boxer.charged[hand]) sendToHall(room, found.fight, 'boxing_charge', { sessionId: found.player.sessionId, hand, on: false })
  const released = releaseHand(found.fight.bout, boxer, hand, now)
  if (released && !released.queued) throwPunch(room, found.fight, found.player, boxer, released.kind, now)
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

onGearChanged((player) => glovesChecks.delete(player.accountId))

function ownsGloves(player: Player, now: number): Promise<boolean> {
  const cached = glovesChecks.get(player.accountId)
  if (cached && now - cached.at < GLOVES_CHECK_TTL_MS) return cached.owned
  const owned = usableGear(player).then((codes) => codes.includes(rulesOf().gear))
  glovesChecks.set(player.accountId, { owned, at: now })
  owned.catch(() => glovesChecks.delete(player.accountId))
  return owned
}

function facingBag(player: Player, bag: { x: number, z: number }): boolean {
  const dx = bag.x - player.x
  const dz = bag.z - player.z
  const dist = Math.hypot(dx, dz)
  if (dist > BAG_REACH_M) return false
  return dist === 0 || (-Math.sin(player.ry) * dx - Math.cos(player.ry) * dz) / dist >= rulesOf().hit.facingCos
}

export async function onBoxingBag(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const index = payload?.bag
  const kind = payload?.kind
  if (!player?.token || !Number.isInteger(index) || !PUNCH_KINDS.includes(kind as PunchKind)) return
  const bag = rulesOf().punchBags[index as number]
  if (!bag || !facingBag(player, bag) || now - (lastBagHitAt.get(player.accountId) ?? 0) < BAG_HIT_GAP_MS) return
  lastBagHitAt.set(player.accountId, now)
  let owned: boolean
  try {
    owned = await ownsGloves(player, now)
  } catch (error) {
    console.warn('[sports] boxing gloves check failed:', error instanceof Error ? error.message : error)
    client.send('boxing_no_gloves', { reason: 'check_failed' })
    return
  }
  if (!owned) {
    client.send('boxing_no_gloves', { reason: 'missing' })
    return
  }
  const hall = worldSportsPassArea(rulesOf().zone)
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && hall && inside(hall, listener.x, listener.z)) c.send('boxing_bag_hit', { bag: index, sessionId: player.sessionId, kind })
  })
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
