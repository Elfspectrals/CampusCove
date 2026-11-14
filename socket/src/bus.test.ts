import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { GameClient, Player } from './types.ts'
import { BUS_ACTION_COOLDOWN_MS, BUS_CRUISE_SPEED, BUS_DWELL_MS, BUS_EYE_HEIGHT, BUS_FLOOR_Y, BUS_RIDER_SLOTS } from './busConstants.ts'
import { buildRoute, parseBusLine, poseAt, projectOnRoute, yawAlong } from './busLine.ts'
import { type BusRoom, boardRejection, busStateAt, buildTimetables, driveSeconds, drivenDistance, isRidingBus, leaveBus, newBusState, onBusAlight, onBusBoard, riderPosition, tickBus } from './bus.ts'
import { parseSportsPassAreas } from './world.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

const square = [[0, 0], [100, 0], [100, -100], [0, -100]]
const reversed = [[0, 0], [0, -100], [100, -100], [100, 0]]
const rawLine = {
  buses: { A: { route: square }, B: { route: reversed } },
  stops: [
    { id: 'town', name: 'Town', A: { stand: [50, 0], boarding: [50, 3] }, B: { stand: [50, 0], boarding: [50, 3] } },
    { id: 'sports_complex', name: 'Sports', A: { stand: [50, -100], boarding: [50, -103] }, B: { stand: [50, -100], boarding: [50, -103] } }
  ]
}

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, x: number, z: number): Player {
  return { sessionId, accountId: 1, x, y: 1.6, z, ry: 0, lastMoveAt: 0, knockedOutUntil: 0, cuffedBy: null, jail: null, seatId: null } as unknown as Player
}

function fakeRoom(clients: FakeClient[], players: Player[]): BusRoom & { moves: string[] } {
  const moves: string[] = []
  return {
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients,
    bus: newBusState(parseBusLine(rawLine)),
    moves,
    forEachClient: (cb: (c: GameClient) => void) => clients.forEach(cb),
    broadcastMove: (client: GameClient) => moves.push(client.sessionId)
  } as unknown as BusRoom & { moves: string[] }
}

function dockedAt(room: BusRoom, bus: 'A' | 'B', stop: string): number {
  const timetable = room.bus.timetables.find((t) => t.bus === bus)!
  return timetable.offsetMs + timetable.legs.find((leg) => leg.stop.id === stop)!.arriveMs + 2000
}

test('a closed route measures its closing segment and samples along it', () => {
  const route = buildRoute(square.map(([x, z]) => ({ x: x!, z: z! })))
  assert.equal(route.length, 400)
  assert.deepEqual(poseAt(route, 50), { x: 50, z: 0, yaw: yawAlong(1, 0) })
  assert.deepEqual(poseAt(route, 450), poseAt(route, 50))
  assert.equal(poseAt(route, 350).z, -50)
  assert.equal(projectOnRoute(route, { x: 100, z: -40 }).distance, 140)
})

test('yaw points the model front (-Z) along the travel direction', () => {
  assert.ok(Math.abs(yawAlong(0, -1)) < 1e-9)
  assert.ok(Math.abs(yawAlong(1, 0) + Math.PI / 2) < 1e-9)
})

test('a manifest without a bus section has no bus line, a broken one throws', () => {
  assert.equal(parseBusLine(undefined), null)
  assert.throws(() => parseBusLine({ ...rawLine, stops: [rawLine.stops[0]] }))
  assert.throws(() => parseBusLine({ ...rawLine, buses: { A: { route: square } } }))
  assert.throws(() => parseBusLine({ ...rawLine, stops: [rawLine.stops[0], { ...rawLine.stops[1], id: 'town' }] }))
})

test('the drive profile accelerates, cruises and brakes to the exact leg length', () => {
  assert.equal(drivenDistance(200, 0), 0)
  assert.ok(Math.abs(drivenDistance(200, driveSeconds(200)) - 200) < 1e-9)
  assert.ok(Math.abs(driveSeconds(200) - (200 / BUS_CRUISE_SPEED + BUS_CRUISE_SPEED / 1.2)) < 1e-9)
  assert.ok(Math.abs(drivenDistance(10, driveSeconds(10)) - 10) < 1e-9)
  assert.ok(Math.abs(drivenDistance(10, driveSeconds(10) / 2) - 5) < 1e-9)
})

test('both buses share one period and meet the spacing stop half a period apart', () => {
  const [a, b] = buildTimetables(parseBusLine(rawLine)!)
  assert.equal(a!.periodMs, b!.periodMs)
  assert.equal(a!.periodMs % 10_000, 0)
  const arriveA = a!.offsetMs + a!.legs.find((l) => l.stop.id === 'sports_complex')!.arriveMs
  const arriveB = b!.offsetMs + b!.legs.find((l) => l.stop.id === 'sports_complex')!.arriveMs
  assert.equal(((arriveB - arriveA) % a!.periodMs + a!.periodMs) % a!.periodMs, a!.periodMs / 2)
})

test('a bus waits at a stop for the dwell time, then drives on with no stop', () => {
  const [a] = buildTimetables(parseBusLine(rawLine)!)
  const leg = a!.legs.find((l) => l.stop.id === 'sports_complex')!
  const docked = busStateAt(a!, leg.arriveMs + 1000)
  assert.equal(docked.stopId, 'sports_complex')
  assert.equal(docked.departsInMs, leg.dwellMs - 1000)
  assert.deepEqual({ x: docked.pose.x, z: docked.pose.z }, { x: 50, z: -100 })
  const moving = busStateAt(a!, leg.arriveMs + BUS_DWELL_MS + 5000)
  assert.equal(moving.stopId, null)
  assert.equal(moving.nextStopId, 'town')
  assert.ok(moving.pose.x < 50)
  assert.deepEqual(busStateAt(a!, leg.arriveMs + 1000 + a!.periodMs), docked)
})

test('a rider slot is placed in the bus frame', () => {
  const pose = { x: 10, z: 20, yaw: -Math.PI / 2 }
  const p = riderPosition(pose, 0)
  const [lx, lz] = BUS_RIDER_SLOTS[0]!
  assert.ok(Math.abs(p.x - (10 - lz)) < 1e-9)
  assert.ok(Math.abs(p.z - (20 + lx)) < 1e-9)
  assert.equal(p.y, BUS_FLOOR_Y + BUS_EYE_HEIGHT)
})

test('boarding needs a docked bus, the door within reach and a free player', () => {
  const room = fakeRoom([], [])
  const now = dockedAt(room, 'A', 'town')
  assert.equal(boardRejection(room, fakePlayer('p', 50, 4), 'A', now), null)
  assert.equal(boardRejection(room, fakePlayer('p', 50, 10), 'A', now), 'too_far')
  assert.equal(boardRejection(room, fakePlayer('p', 50, 4), 'C', now), 'unknown_bus')
  assert.equal(boardRejection(room, fakePlayer('p', 50, 4), 'A', now + BUS_DWELL_MS), 'not_docked')
  assert.equal(boardRejection(room, { ...fakePlayer('p', 50, 4), knockedOutUntil: now + 1 }, 'A', now), 'unavailable')
  assert.equal(boardRejection(room, { ...fakePlayer('p', 50, 4), seatId: 'stool_01' }, 'A', now), 'unavailable')
  assert.equal(boardRejection(room, { ...fakePlayer('p', 50, 4), cuffedBy: {} } as Player, 'A', now), 'unavailable')
})

test('a full bus refuses the next rider', () => {
  const room = fakeRoom([], [])
  for (let slot = 0; slot < BUS_RIDER_SLOTS.length; slot++) room.bus.riders.set(`r${slot}`, { bus: 'A', slot, alightAt: null })
  assert.equal(boardRejection(room, fakePlayer('p', 50, 4), 'A', dockedAt(room, 'A', 'town')), 'full')
})

test('board, ride with server positions, ignore a second message within the cooldown, get off at the chosen stop', () => {
  const client = fakeClient('p')
  const player = fakePlayer('p', 50, 4)
  const room = fakeRoom([client], [player])
  const boardAt = dockedAt(room, 'A', 'town')
  onBusBoard(room, client, { bus: 'A' }, boardAt)
  assert.ok(isRidingBus(room, player))
  assert.equal(client.sent.at(-1)!.type, 'bus_boarded')
  assert.equal(player.y, BUS_FLOOR_Y + BUS_EYE_HEIGHT)
  onBusAlight(room, client, {}, boardAt + BUS_ACTION_COOLDOWN_MS / 2)
  assert.ok(isRidingBus(room, player))
  onBusAlight(room, client, { stop: 'nowhere' }, boardAt + 1000)
  assert.deepEqual(client.sent.at(-1), { type: 'bus_error', payload: { reason: 'unknown_stop' } })
  onBusAlight(room, client, { stop: 'sports_complex' }, boardAt + 2000)
  assert.deepEqual(client.sent.at(-1), { type: 'bus_alight_planned', payload: { stop: 'sports_complex' } })
  const driving = boardAt + BUS_DWELL_MS + 3000
  tickBus(room, driving)
  assert.equal(player.lastMoveAt, driving)
  assert.ok(player.x !== 50 || player.z !== 4)
  assert.ok(isRidingBus(room, player))
  assert.equal(client.sent.at(-1)!.type, 'bus_sync')
  const arrived = dockedAt(room, 'A', 'sports_complex')
  tickBus(room, arrived)
  assert.ok(!isRidingBus(room, player))
  assert.deepEqual({ x: player.x, y: player.y, z: player.z }, { x: 50, y: BUS_EYE_HEIGHT, z: -103 })
  assert.ok(client.sent.some((m) => m.type === 'bus_alighted' && m.payload.stop === 'sports_complex'))
})

test('a key press while driving plans the next stop, at a docked stop it gets off at once', () => {
  const client = fakeClient('p')
  const player = fakePlayer('p', 50, 4)
  const room = fakeRoom([client], [player])
  const boardAt = dockedAt(room, 'A', 'town')
  onBusBoard(room, client, { bus: 'A' }, boardAt)
  onBusAlight(room, client, {}, boardAt + BUS_DWELL_MS + 3000)
  assert.deepEqual(client.sent.at(-1), { type: 'bus_alight_planned', payload: { stop: 'sports_complex' } })
  const docked = dockedAt(room, 'A', 'sports_complex')
  room.bus.riders.get('p')!.alightAt = null
  onBusAlight(room, client, {}, docked)
  assert.ok(!isRidingBus(room, player))
  assert.equal(player.z, -103)
})

test('a rider who is knocked out or leaves the room is dropped from the bus', () => {
  const client = fakeClient('p')
  const player = fakePlayer('p', 50, 4)
  const room = fakeRoom([client], [player])
  const boardAt = dockedAt(room, 'A', 'town')
  onBusBoard(room, client, { bus: 'A' }, boardAt)
  player.knockedOutUntil = boardAt + 60_000
  tickBus(room, boardAt + 3000)
  assert.ok(!isRidingBus(room, player))
  assert.ok(client.sent.some((m) => m.type === 'bus_left'))
  player.knockedOutUntil = 0
  player.x = 50
  player.z = 4
  onBusBoard(room, client, { bus: 'A' }, boardAt + 4000)
  assert.ok(isRidingBus(room, player))
  leaveBus(room, player)
  assert.ok(!isRidingBus(room, player))
  room.bus.riders.set('ghost', { bus: 'A', slot: 3, alightAt: null })
  tickBus(room, boardAt + 5000)
  assert.ok(!room.bus.riders.has('ghost'))
})

test('the town route stays outside every sports pass area, and every stop sits on its own route', () => {
  const source = JSON.parse(readFileSync(new URL('../../map-src/CampusCove/bus_route.json', import.meta.url), 'utf8'))
  const manifest = JSON.parse(readFileSync(new URL('../../front/public/assets/world.manifest.json', import.meta.url), 'utf8'))
  const line = parseBusLine(source)!
  const passAreas = [...parseSportsPassAreas(manifest.zones).values()]
  for (const bus of ['A', 'B'] as const) {
    const route = line.routes[bus]
    for (let s = 0; s < route.length; s += 1) {
      const { x, z } = poseAt(route, s)
      assert.ok(!passAreas.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ), `${bus} at ${x},${z}`)
    }
    for (const stop of line.stops) {
      assert.ok(projectOnRoute(route, stop.sides[bus].stand).offset < 0.5, `${stop.id} ${bus} stand off its route`)
      const door = stop.sides[bus].boarding
      assert.ok(!passAreas.some((b) => door.x >= b.minX && door.x <= b.maxX && door.z >= b.minZ && door.z <= b.maxZ), `${stop.id} ${bus} door`)
    }
  }
  const [a] = buildTimetables(line)
  assert.equal(a!.legs.length, 8)
  assert.ok(a!.periodMs > 4 * 60_000 && a!.periodMs < 8 * 60_000, `period ${a!.periodMs}`)
})
