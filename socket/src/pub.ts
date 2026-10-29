import { callRealtimeBackend, errorPayload } from './backend.ts'
import {
  BARTENDER_REACH,
  BOUNCER_REACH,
  COUNTER_REACH,
  POUR_MS,
  SEAT_REACH,
  SECRET_OPEN_MS,
  SECRET_PHRASE
} from './pubConstants.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { type WorldPub, worldPub, worldPubZone } from './world.ts'

const SEAT_HEIGHT = 0.72
const EYE_HEIGHT = 1.6
const BELL_REACH = COUNTER_REACH
const BELL_COOLDOWN_MS = 10_000
const DRINK_CODE = /^drink_[a-z0-9_]{1,56}$/
const MAX_PHRASE_LENGTH = 100
const SECRET_RECHECK_MS = 5_000

function warn(context: string, error: unknown): void {
  console.warn(`[pub] ${context}:`, error instanceof Error ? error.message : error)
}

export function inPubZone(player: Player): boolean {
  const zone = worldPubZone()
  return zone !== null && player.x >= zone.minX && player.x <= zone.maxX && player.z >= zone.minZ && player.z <= zone.maxZ
}

export function forEachPubClient(room: GameRoom, callback: (client: GameClient) => void, exceptClient?: GameClient): void {
  room.forEachClient((client) => {
    const listener = room.players.get(client.sessionId)
    if (listener && inPubZone(listener)) callback(client)
  }, exceptClient)
}

export function isWithinPubReach(player: Player, point: Vec3, reach: number): boolean {
  return Math.hypot(player.x - point.x, player.z - point.z) <= reach
}

export function sendPubError(client: GameClient, message: string, code: string): void {
  client.send('pub_error', { message, code })
}

function pubFor(client: GameClient): WorldPub | null {
  const pub = worldPub()
  if (!pub) sendPubError(client, 'There is no pub in this world.', 'no_pub')
  return pub
}


export function onSit(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || now < player.knockedOutUntil) return
  const pub = pubFor(client)
  if (!pub) return
  const seat = typeof payload?.seatId === 'string' ? pub.seats.get(payload.seatId) : undefined
  if (!seat) {
    sendPubError(client, 'There is no such seat.', 'seat_unknown')
    return
  }
  if (!inPubZone(player)) {
    sendPubError(client, 'You are not in the pub.', 'not_in_pub')
    return
  }
  if (!isWithinPubReach(player, seat.position, SEAT_REACH)) {
    sendPubError(client, 'Get closer to the seat.', 'seat_too_far')
    return
  }
  const occupant = room.seats.get(seat.id)
  if (occupant && occupant !== player.sessionId) {
    sendPubError(client, 'This seat is taken.', 'seat_taken')
    return
  }
  if (player.seatId && player.seatId !== seat.id) room.seats.delete(player.seatId)
  room.seats.set(seat.id, player.sessionId)
  player.seatId = seat.id
  const y = seat.position.y - SEAT_HEIGHT + EYE_HEIGHT
  Object.assign(player, { x: seat.position.x, y, z: seat.position.z, fallPeakY: y, lastMoveAt: now })
  room.broadcastMove(client, player)
  broadcastSeated(room, player)
}

export function releaseSeat(room: GameRoom, player: Player): void {
  if (!player.seatId) return
  if (room.seats.get(player.seatId) === player.sessionId) room.seats.delete(player.seatId)
  player.seatId = null
  broadcastSeated(room, player)
}

function broadcastSeated(room: GameRoom, player: Player): void {
  const payload = { sessionId: player.sessionId, seatId: player.seatId }
  forEachPubClient(room, (c) => c.send('user_seated', payload))
}


export async function onPubOrder(room: GameRoom, client: GameClient, payload: ClientPayload): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || Date.now() < player.knockedOutUntil) return
  const pub = pubFor(client)
  if (!pub) return
  const code = typeof payload?.code === 'string' ? payload.code.trim() : ''
  const via = payload?.via === 'bartender' || payload?.via === 'counter' ? payload.via : null
  if (!DRINK_CODE.test(code) || !via) {
    sendPubError(client, 'Pick a drink from the menu.', 'unknown_drink')
    return
  }
  const point = via === 'bartender' ? pub.bartender : pub.counter
  const reach = via === 'bartender' ? BARTENDER_REACH : COUNTER_REACH
  if (!isWithinPubReach(player, point, reach)) {
    sendPubError(client, via === 'bartender' ? 'Walk up to the bartender.' : 'Walk up to the bar.', 'pub_too_far')
    return
  }
  try {
    await callRealtimeBackend(player.token, '/pub/order', 'POST', { code })
  } catch (error) {
    warn('order failed', error)
    client.send('pub_error', errorPayload(error, 'The bar could not serve you.', 'pub_order_failed'))
    return
  }
  if (via === 'counter') {
    client.send('pub_served', { code })
    return
  }
  const pouring = { sessionId: player.sessionId, code, durationMs: POUR_MS }
  forEachPubClient(room, (c) => c.send('pub_pouring', pouring))
  room.clock.setTimeout(() => {
    if (room.players.get(client.sessionId) === player) client.send('pub_served', { code })
  }, POUR_MS)
}


export function normalizeSecretPhrase(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function onPubSecret(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || now < player.knockedOutUntil) return
  const pub = pubFor(client)
  if (!pub) return
  const phrase = typeof payload?.phrase === 'string' ? payload.phrase.slice(0, MAX_PHRASE_LENGTH) : ''
  if (!isWithinPubReach(player, pub.bouncer, BOUNCER_REACH)) {
    sendPubError(client, 'Talk to the bouncer first.', 'pub_too_far')
    return
  }
  if (normalizeSecretPhrase(phrase) !== SECRET_PHRASE) {
    client.send('pub_secret_result', { ok: false })
    return
  }
  player.pubSecretUntil = now + SECRET_OPEN_MS
  client.send('pub_secret_result', { ok: true, untilMs: player.pubSecretUntil })
  if (!room.pub.secretOpen) {
    room.pub.secretOpen = true
    forEachPubClient(room, (c) => c.send('pub_secret_door', { open: true }))
  }
  room.clock.setTimeout(() => closeSecretDoorWhenExpired(room, Date.now()), SECRET_OPEN_MS)
}

function insideSecretRoom(pub: WorldPub, player: Player): boolean {
  const bounds = pub.secretRoom
  return player.x >= bounds.minX && player.x <= bounds.maxX && player.z >= bounds.minZ && player.z <= bounds.maxZ
}

export function closeSecretDoorWhenExpired(room: GameRoom, now: number): void {
  if (!room.pub.secretOpen) return
  const pub = worldPub()
  let someoneInside = false
  for (const player of room.players.values()) {
    if (player.pubSecretUntil > now) return
    if (pub && insideSecretRoom(pub, player)) someoneInside = true
  }
  if (someoneInside) {
    room.clock.setTimeout(() => closeSecretDoorWhenExpired(room, Date.now()), SECRET_RECHECK_MS)
    return
  }
  room.pub.secretOpen = false
  forEachPubClient(room, (c) => c.send('pub_secret_door', { open: false }))
}


export function onPubBell(room: GameRoom, client: GameClient, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || now < player.knockedOutUntil) return
  const pub = worldPub()
  if (!pub || !isWithinPubReach(player, pub.bell, BELL_REACH)) return
  if (now - player.lastPubBellAt < BELL_COOLDOWN_MS) return
  player.lastPubBellAt = now
  const payload = { sessionId: player.sessionId }
  forEachPubClient(room, (c) => c.send('pub_bell', payload))
}
