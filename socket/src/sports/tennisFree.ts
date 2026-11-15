import { errorPayload } from '../backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { ownedGear } from './gear.ts'
import { hasLoan, lend } from './loans.ts'
import { hasValidPass } from './pass.ts'
import type { Team } from './signup.ts'
import { type Court, type Rally, type Stroke, hit, playAreaFor, serveWait, step, strokeOf } from './tennisRally.ts'
import {
  BALL_BASKETS,
  BALL_BASKET_REACH,
  DOUBLES_HALF_WIDTH,
  TENNIS_BALL_LOAN,
  TENNIS_COURTS,
  TENNIS_GEAR,
  TENNIS_HIT_COOLDOWN_MS,
  TENNIS_NET_Z,
  TENNIS_ZONE
} from './tennisConstants.ts'

export interface FreeRally {
  court: string
  geometry: Court
  rally: Rally
}

const freeRallies = new WeakMap<GameRoom, Map<string, FreeRally>>()
const lastFreeHitAt = new WeakMap<Player, number>()

function roomRallies(room: GameRoom): Map<string, FreeRally> {
  let map = freeRallies.get(room)
  if (!map) {
    map = new Map()
    freeRallies.set(room, map)
  }
  return map
}

export function freeRally(room: GameRoom, court: string): FreeRally | null {
  return roomRallies(room).get(court) ?? null
}

function sideOf(z: number): Team {
  return z > TENNIS_NET_Z ? 'red' : 'blue'
}

function inside(b: { minX: number, maxX: number, minZ: number, maxZ: number }, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

export function courtAt(x: number, z: number): (typeof TENNIS_COURTS)[number] | null {
  return TENNIS_COURTS.find((c) => inside(playAreaFor(c.cx, TENNIS_NET_Z), x, z)) ?? null
}

function freeView(court: string, free: FreeRally | null, now: number) {
  const rally = free?.rally
  return {
    court,
    geometry: free?.geometry ?? null,
    phase: rally?.phase ?? 'idle',
    ball: !rally || rally.phase === 'serve_wait' ? null : rally.ball,
    hitter: rally?.phase === 'flight' ? rally.hitter : null,
    call: rally?.phase === 'point' ? rally.call : null,
    serverNow: now
  }
}

function broadcastFree(room: GameRoom, court: string, now: number): void {
  const zone = worldSportsPassArea(TENNIS_ZONE)
  const payload = freeView(court, freeRally(room, court), now)
  room.forEachClient((client) => {
    const p = room.players.get(client.sessionId)
    if (p && zone !== null && inside(zone, p.x, p.z)) client.send('tennis_free', payload)
  })
}

export function sendStroke(room: GameRoom, sessionId: string, stroke: Stroke | null): void {
  if (!stroke) return
  const zone = worldSportsPassArea(TENNIS_ZONE)
  room.forEachClient((client) => {
    const p = room.players.get(client.sessionId)
    if (client.sessionId !== sessionId && p && zone !== null && inside(zone, p.x, p.z)) client.send('tennis_stroke', { sessionId, stroke })
  })
}

export function stopFreeRally(room: GameRoom, court: string, now: number): void {
  if (roomRallies(room).delete(court)) broadcastFree(room, court, now)
}

export function freeHit(room: GameRoom, player: Player, aim: { x: number, z: number }, lob: boolean, now: number): void {
  const court = courtAt(player.x, player.z)
  if (!court || room.sports.matches.has(court.id) || !hasLoan(player, TENNIS_BALL_LOAN)) return
  if (now - (lastFreeHitAt.get(player) ?? -Infinity) < TENNIS_HIT_COOLDOWN_MS) return
  lastFreeHitAt.set(player, now)
  const rallies = roomRallies(room)
  tickFreeCourt(room, court.id, now)
  const team = sideOf(player.z)
  const current = rallies.get(court.id)
  const geometry = { cx: court.cx, netZ: TENNIS_NET_Z, halfWidth: DOUBLES_HALF_WIDTH }
  const rally = !current || current.rally.phase === 'point' ? serveWait(player.sessionId, team, now) : current.rally
  const hitter = { sessionId: player.sessionId, team, x: player.x, z: player.z }
  const next = hit(rally, hitter, aim, lob, now, geometry)
  if (!next) return
  rallies.set(court.id, { court: court.id, geometry, rally: next })
  broadcastFree(room, court.id, now)
  sendStroke(room, player.sessionId, strokeOf(rally, next, hitter, lob))
}

function tickFreeCourt(room: GameRoom, court: string, now: number): void {
  const free = freeRally(room, court)
  if (!free) return
  if (free.rally.phase === 'point') {
    if (now >= free.rally.until) stopFreeRally(room, court, now)
    return
  }
  const next = step(free.rally, now, free.geometry, (sessionId) => room.players.get(sessionId) ?? null)
  if (next === free.rally) return
  free.rally = next
  broadcastFree(room, court, now)
}

export function tickTennisFree(room: GameRoom, now = Date.now()): void {
  for (const court of [...roomRallies(room).keys()]) tickFreeCourt(room, court, now)
}

function basketFrom(payload: ClientPayload) {
  return BALL_BASKETS.find((b) => b.court === payload?.court) ?? null
}

export async function onTennisBallTake(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const basket = basketFrom(payload)
  if (!player?.token || !basket || player.sportsPending || hasLoan(player, TENNIS_BALL_LOAN)) return
  const send = (code: string, message: string) => client.send('sports_error', { code, message })
  if (Math.hypot(player.x - basket.x, player.z - basket.z) > BALL_BASKET_REACH) return send('sports_too_far', 'Walk up to the ball basket.')
  if (!hasValidPass(player, now)) return send('sports_no_pass', 'You need a sports pass (reception).')
  if (room.sports.matches.has(basket.court)) return send('sports_venue_busy', 'A match is on this court. Come back after it.')
  player.sportsPending = true
  let owned: string[]
  try {
    owned = await ownedGear(player)
  } catch (error) {
    const { code, message } = errorPayload(error, 'Your gear could not be checked.', 'sports_gear_failed')
    return send(code, message)
  } finally {
    player.sportsPending = false
  }
  if (room.players.get(client.sessionId) !== player) return
  if (!owned.includes(TENNIS_GEAR)) return send('sports_no_gear', 'You need your own gear for this sport (Summit Sports, mall).')
  lend(room, player, TENNIS_BALL_LOAN, TENNIS_ZONE)
}
