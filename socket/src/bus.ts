import {
  BUS_ACCELERATION,
  BUS_ACTION_COOLDOWN_MS,
  BUS_BOARD_CLOSES_MS,
  BUS_BOARD_REACH,
  BUS_CRUISE_SPEED,
  BUS_DWELL_MS,
  BUS_EYE_HEIGHT,
  BUS_FLOOR_Y,
  BUS_PERIOD_STEP_MS,
  BUS_RIDER_SLOTS,
  BUS_SPACING_STOP
} from './busConstants.ts'
import { BUS_IDS, type BusId, type BusLine, type BusPose, type BusRoute, type BusStop, poseAt, projectOnRoute } from './busLine.ts'
import { cellOf } from './jail.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'

export interface BusLeg {
  stop: BusStop
  distance: number
  arriveMs: number
  dwellMs: number
  driveMs: number
  length: number
}

export interface BusTimetable {
  bus: BusId
  route: BusRoute
  legs: BusLeg[]
  periodMs: number
  offsetMs: number
}

export interface BusState {
  pose: BusPose
  stopId: string | null
  departsInMs: number
  nextStopId: string
}

export interface BusRider {
  bus: BusId
  slot: number
  alightAt: string | null
}

export interface BusRoomState {
  timetables: BusTimetable[]
  riders: Map<string, BusRider>
  lastActionAt: Map<string, number>
}

export interface BusRoom extends GameRoom {
  bus: BusRoomState
}

export type BusError = 'unknown_bus' | 'riding' | 'not_riding' | 'unavailable' | 'not_docked' | 'too_far' | 'full' | 'unknown_stop'

const CRUISE_RAMP = (BUS_CRUISE_SPEED * BUS_CRUISE_SPEED) / BUS_ACCELERATION

export function driveSeconds(length: number): number {
  if (length >= CRUISE_RAMP) return length / BUS_CRUISE_SPEED + BUS_CRUISE_SPEED / BUS_ACCELERATION
  return 2 * Math.sqrt(length / BUS_ACCELERATION)
}

export function drivenDistance(length: number, seconds: number): number {
  const total = driveSeconds(length)
  const t = Math.max(0, Math.min(total, seconds))
  const ramp = length >= CRUISE_RAMP ? BUS_CRUISE_SPEED / BUS_ACCELERATION : total / 2
  if (t <= ramp) return 0.5 * BUS_ACCELERATION * t * t
  if (t >= total - ramp) return length - 0.5 * BUS_ACCELERATION * (total - t) ** 2
  return 0.5 * BUS_ACCELERATION * ramp * ramp + BUS_CRUISE_SPEED * (t - ramp)
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

function rawLegs(line: BusLine, bus: BusId): BusLeg[] {
  const route = line.routes[bus]
  const placed = line.stops
    .map((stop) => ({ stop, distance: projectOnRoute(route, stop.sides[bus].stand).distance }))
    .sort((a, b) => a.distance - b.distance)
  let arriveMs = 0
  return placed.map(({ stop, distance }, i) => {
    const next = placed[(i + 1) % placed.length]!
    const length = mod(next.distance - distance, route.length) || route.length
    const leg = { stop, distance, arriveMs, dwellMs: BUS_DWELL_MS, driveMs: driveSeconds(length) * 1000, length }
    arriveMs += leg.dwellMs + leg.driveMs
    return leg
  })
}

function cycleMs(legs: BusLeg[]): number {
  return legs.reduce((sum, leg) => sum + leg.dwellMs + leg.driveMs, 0)
}

function arrivalAt(legs: BusLeg[], stopId: string): number {
  const leg = legs.find((l) => l.stop.id === stopId)
  if (!leg) throw new Error(`bus line: no stop ${stopId}`)
  return leg.arriveMs
}

export function buildTimetables(line: BusLine): BusTimetable[] {
  const legsByBus = BUS_IDS.map((bus) => rawLegs(line, bus))
  const periodMs = Math.ceil(Math.max(...legsByBus.map(cycleMs)) / BUS_PERIOD_STEP_MS) * BUS_PERIOD_STEP_MS
  for (const legs of legsByBus) {
    legs[0]!.dwellMs += periodMs - cycleMs(legs)
    let arriveMs = 0
    for (const leg of legs) {
      leg.arriveMs = arriveMs
      arriveMs += leg.dwellMs + leg.driveMs
    }
  }
  const [legsA, legsB] = legsByBus as [BusLeg[], BusLeg[]]
  const offsetB = mod(arrivalAt(legsA, BUS_SPACING_STOP) + periodMs / 2 - arrivalAt(legsB, BUS_SPACING_STOP), periodMs)
  return BUS_IDS.map((bus, i) => ({ bus, route: line.routes[bus], legs: legsByBus[i]!, periodMs, offsetMs: i === 0 ? 0 : offsetB }))
}

export function busStateAt(timetable: BusTimetable, nowMs: number): BusState {
  const t = mod(nowMs - timetable.offsetMs, timetable.periodMs)
  const legs = timetable.legs
  let i = legs.length - 1
  while (i > 0 && legs[i]!.arriveMs > t) i--
  const leg = legs[i]!
  const next = legs[(i + 1) % legs.length]!
  const since = t - leg.arriveMs
  if (since < leg.dwellMs) {
    return { pose: poseAt(timetable.route, leg.distance), stopId: leg.stop.id, departsInMs: leg.dwellMs - since, nextStopId: next.stop.id }
  }
  const driven = drivenDistance(leg.length, (since - leg.dwellMs) / 1000)
  return { pose: poseAt(timetable.route, leg.distance + driven), stopId: null, departsInMs: 0, nextStopId: next.stop.id }
}

export function riderPosition(pose: BusPose, slot: number): { x: number, y: number, z: number } {
  const [lx, lz] = BUS_RIDER_SLOTS[slot]!
  const cos = Math.cos(pose.yaw)
  const sin = Math.sin(pose.yaw)
  return { x: pose.x + lx * cos + lz * sin, y: BUS_FLOOR_Y + BUS_EYE_HEIGHT, z: pose.z - lx * sin + lz * cos }
}

export function newBusState(line: BusLine | null): BusRoomState {
  return { timetables: line ? buildTimetables(line) : [], riders: new Map(), lastActionAt: new Map() }
}

export function isRidingBus(room: BusRoom, player: Player): boolean {
  return room.bus.riders.has(player.sessionId)
}

function timetableOf(room: BusRoom, bus: BusId): BusTimetable | undefined {
  return room.bus.timetables.find((t) => t.bus === bus)
}

function clientOf(room: BusRoom, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

function cannotRide(player: Player, now: number): boolean {
  return now < player.knockedOutUntil || player.cuffedBy !== null || cellOf(player) !== null || player.seatId !== null
}

function freeSlot(room: BusRoom, bus: BusId): number | null {
  const taken = new Set([...room.bus.riders.values()].filter((r) => r.bus === bus).map((r) => r.slot))
  for (let slot = 0; slot < BUS_RIDER_SLOTS.length; slot++) if (!taken.has(slot)) return slot
  return null
}

function throttled(room: BusRoom, player: Player, now: number): boolean {
  const last = room.bus.lastActionAt.get(player.sessionId) ?? -Infinity
  if (now - last < BUS_ACTION_COOLDOWN_MS) return true
  room.bus.lastActionAt.set(player.sessionId, now)
  return false
}

export function boardRejection(room: BusRoom, player: Player, bus: unknown, now: number): BusError | null {
  if (typeof bus !== 'string' || !BUS_IDS.includes(bus as BusId)) return 'unknown_bus'
  if (isRidingBus(room, player)) return 'riding'
  if (cannotRide(player, now)) return 'unavailable'
  const timetable = timetableOf(room, bus as BusId)
  if (!timetable) return 'unknown_bus'
  const state = busStateAt(timetable, now)
  if (state.stopId === null || state.departsInMs < BUS_BOARD_CLOSES_MS) return 'not_docked'
  const stop = timetable.legs.find((leg) => leg.stop.id === state.stopId)!.stop
  const door = stop.sides[bus as BusId].boarding
  if (Math.hypot(player.x - door.x, player.z - door.z) > BUS_BOARD_REACH) return 'too_far'
  if (freeSlot(room, bus as BusId) === null) return 'full'
  return null
}

function placeRider(room: BusRoom, player: Player, pose: BusPose, slot: number, now: number): void {
  const p = riderPosition(pose, slot)
  player.x = p.x
  player.y = p.y
  player.z = p.z
  player.ry = pose.yaw
  player.lastMoveAt = now
  const client = clientOf(room, player)
  if (client) room.broadcastMove(client, player)
}

export function onBusBoard(room: BusRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || throttled(room, player, now)) return
  const requested = payload?.bus
  const reason = boardRejection(room, player, requested, now)
  if (reason) {
    client.send('bus_error', { reason })
    return
  }
  const bus = requested as BusId
  const slot = freeSlot(room, bus)!
  room.bus.riders.set(player.sessionId, { bus, slot, alightAt: null })
  placeRider(room, player, busStateAt(timetableOf(room, bus)!, now).pose, slot, now)
  const [lx, lz] = BUS_RIDER_SLOTS[slot]!
  client.send('bus_boarded', { bus, slot: [lx, lz], floorY: BUS_FLOOR_Y })
}

function alight(room: BusRoom, player: Player, stop: BusStop, bus: BusId, now: number): void {
  room.bus.riders.delete(player.sessionId)
  const door = stop.sides[bus].boarding
  player.x = door.x
  player.y = BUS_EYE_HEIGHT
  player.z = door.z
  player.lastMoveAt = now
  const client = clientOf(room, player)
  if (!client) return
  client.send('bus_alighted', { x: player.x, y: player.y, z: player.z, stop: stop.id })
  room.broadcastMove(client, player)
}

export function onBusAlight(room: BusRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player || throttled(room, player, now)) return
  const rider = room.bus.riders.get(player.sessionId)
  if (!rider) {
    client.send('bus_error', { reason: 'not_riding' satisfies BusError })
    return
  }
  const timetable = timetableOf(room, rider.bus)!
  const wanted = payload?.stop
  if (wanted !== undefined && !timetable.legs.some((leg) => leg.stop.id === wanted)) {
    client.send('bus_error', { reason: 'unknown_stop' satisfies BusError })
    return
  }
  const state = busStateAt(timetable, now)
  const docked = timetable.legs.find((leg) => leg.stop.id === state.stopId)?.stop
  if (docked && (wanted === undefined || wanted === docked.id)) {
    alight(room, player, docked, rider.bus, now)
    return
  }
  rider.alightAt = typeof wanted === 'string' ? wanted : state.nextStopId
  client.send('bus_alight_planned', { stop: rider.alightAt })
}

export function leaveBus(room: BusRoom, player: Player): void {
  room.bus.riders.delete(player.sessionId)
  room.bus.lastActionAt.delete(player.sessionId)
}

function publicBus(bus: BusId, state: BusState, riders: number) {
  const { x, z, yaw } = state.pose
  return { id: bus, x, z, yaw, stop: state.stopId, departsInMs: Math.round(state.departsInMs), next: state.nextStopId, riders }
}

export function tickBus(room: BusRoom, now = Date.now()): void {
  if (room.bus.timetables.length === 0) return
  const states = new Map(room.bus.timetables.map((t) => [t.bus, busStateAt(t, now)]))
  for (const [sessionId, rider] of room.bus.riders) {
    const player = room.players.get(sessionId)
    if (!player) {
      room.bus.riders.delete(sessionId)
      continue
    }
    if (cannotRide(player, now)) {
      room.bus.riders.delete(sessionId)
      clientOf(room, player)?.send('bus_left', { reason: 'unavailable' })
      continue
    }
    const state = states.get(rider.bus)!
    const stop = state.stopId ? timetableOf(room, rider.bus)!.legs.find((leg) => leg.stop.id === state.stopId)!.stop : null
    if (stop && rider.alightAt === stop.id) alight(room, player, stop, rider.bus, now)
    else placeRider(room, player, state.pose, rider.slot, now)
  }
  const count = (bus: BusId) => [...room.bus.riders.values()].filter((r) => r.bus === bus).length
  const buses = [...states].map(([bus, state]) => publicBus(bus, state, count(bus)))
  room.forEachClient((c) => c.send('bus_sync', { buses }))
}
