import { callRealtimeBackend, errorPayload } from './backend.ts'
import {
  BARTENDER_REACH,
  BASEMENT_DEPTH_MARGIN,
  BOUNCER_BLOCK_COOLDOWN_MS,
  BOUNCER_BLOCK_LINE,
  BOUNCER_PUSHBACK,
  BOUNCER_REACH,
  COUNTER_REACH,
  POUR_MS,
  SEAT_REACH,
  SECRET_OPEN_MS,
  SECRET_PHRASE_EPOCH_MS,
  SECRET_PHRASES,
  WEEK_MS
} from './pubConstants.ts'
import type { Bounds, ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { type WorldPub, worldPub, worldPubZone } from './world.ts'

const SEAT_HEIGHT = 0.72
const EYE_HEIGHT = 1.6
const BELL_REACH = COUNTER_REACH
const BELL_COOLDOWN_MS = 10_000
const DRINK_CODE = /^drink_[a-z0-9_]{1,56}$/
const MAX_PHRASE_LENGTH = 100
const SECRET_RECHECK_MS = 5_000
/** Feet vs seat floor: well under the 3.2 m between the bar and the basement, so no sitting through the floor. */
const SEAT_FLOOR_TOLERANCE = 1.5
/** Feet vs a pub point (counter, bell, bouncer, oche): one floor apart is 3.2 m, so nothing reaches through it. */
const POINT_FLOOR_TOLERANCE = 2
/** Keeps the bouncer pushback point off the pub zone edges. */
const PUSHBACK_EDGE_MARGIN = 0.5

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
  return (
    Math.hypot(player.x - point.x, player.z - point.z) <= reach &&
    Math.abs(player.y - EYE_HEIGHT - point.y) <= POINT_FLOOR_TOLERANCE
  )
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
  const seatFloorY = seat.position.y - SEAT_HEIGHT
  const feetY = player.y - EYE_HEIGHT
  if (!isWithinPubReach(player, seat.position, SEAT_REACH) || Math.abs(feetY - seatFloorY) > SEAT_FLOOR_TOLERANCE) {
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

/** The phrase of the week: whole weeks since a Monday 00:00 UTC epoch, cycled through SECRET_PHRASES. */
export function currentSecretPhrase(nowMs: number, phrases: readonly string[] = SECRET_PHRASES): string {
  const week = Math.floor((nowMs - SECRET_PHRASE_EPOCH_MS) / WEEK_MS)
  return phrases[((week % phrases.length) + phrases.length) % phrases.length]
}

function inBoundsXZ(bounds: Bounds, x: number, z: number): boolean {
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
}

/**
 * The hidden lounge: the stair enclosure behind the cellar door (any height) plus the basement box, the
 * latter only below the bar floor since it lies under the ground-floor bar. `y` is the eye height the
 * move message carries (feet + EYE_HEIGHT); the bar floor is the cellar door's sill height.
 */
export function inSecretVolume(pub: WorldPub, x: number, y: number, z: number): boolean {
  if (inBoundsXZ(pub.secretRoom, x, z)) return true
  const basement = pub.basement
  return basement !== null && inBoundsXZ(basement, x, z) &&
    y - EYE_HEIGHT < pub.secretDoor.position.y - BASEMENT_DEPTH_MARGIN
}

/** Where the bouncer puts a player back: in front of him, on the side away from the cellar door. */
export function bouncerPushbackPoint(pub: WorldPub, zone: Bounds | null): Vec3 | null {
  const { bouncer } = pub
  const door = pub.secretDoor.position
  let dx = bouncer.x - door.x
  let dz = bouncer.z - door.z
  if (Math.hypot(dx, dz) < 1e-3) {
    dx = bouncer.x - (pub.secretRoom.minX + pub.secretRoom.maxX) / 2
    dz = bouncer.z - (pub.secretRoom.minZ + pub.secretRoom.maxZ) / 2
  }
  const length = Math.hypot(dx, dz)
  if (length < 1e-3) return null
  let x = bouncer.x + (dx / length) * BOUNCER_PUSHBACK
  let z = bouncer.z + (dz / length) * BOUNCER_PUSHBACK
  if (zone) {
    x = Math.min(Math.max(x, zone.minX + PUSHBACK_EDGE_MARGIN), zone.maxX - PUSHBACK_EDGE_MARGIN)
    z = Math.min(Math.max(z, zone.minZ + PUSHBACK_EDGE_MARGIN), zone.maxZ - PUSHBACK_EDGE_MARGIN)
  }
  const y = bouncer.y + EYE_HEIGHT
  return inSecretVolume(pub, x, y, z) ? null : { x, y, z }
}

/**
 * A move into the closed lounge: the bouncer steps in. The player is put back in front of him (or left
 * where they were if there is no safe spot), and the pub hears his line at most every couple of seconds.
 */
export function blockAtSecretDoor(room: GameRoom, client: GameClient, player: Player, now: number): void {
  const pub = worldPub()
  const point = pub ? bouncerPushbackPoint(pub, worldPubZone()) : null
  if (point) {
    Object.assign(player, { x: point.x, y: point.y, z: point.z, fallPeakY: point.y, lastMoveAt: now })
    room.broadcastMove(client, player)
  }
  client.send('position_correction', { x: player.x, y: player.y, z: player.z })
  if (now - player.lastBouncerBlockAt < BOUNCER_BLOCK_COOLDOWN_MS) return
  player.lastBouncerBlockAt = now
  const payload = { sessionId: player.sessionId, accountId: player.accountId, line: BOUNCER_BLOCK_LINE }
  forEachPubClient(room, (c) => c.send('pub_bouncer_block', payload))
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
  if (normalizeSecretPhrase(phrase) !== currentSecretPhrase(now)) {
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

export function closeSecretDoorWhenExpired(room: GameRoom, now: number): void {
  if (!room.pub.secretOpen) return
  const pub = worldPub()
  // Keep checking while anyone still holds access or is inside: the clock timer can fire a few ms before
  // `pubSecretUntil`, so returning without a recheck would leave the door open for good.
  let keepOpen = false
  for (const player of room.players.values()) {
    if (player.pubSecretUntil > now) keepOpen = true
    else if (pub && inSecretVolume(pub, player.x, player.y, player.z)) keepOpen = true
  }
  if (keepOpen) {
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
