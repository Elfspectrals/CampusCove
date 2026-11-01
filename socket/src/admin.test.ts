import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type AdminRoom, SUMMON_DISTANCE, onAdminOpen, onAdminSummon, onAdminTeleport } from './admin.ts'
import type { Player } from './types.ts'
import { type TeleportDestination, doorDestination } from './world.ts'

interface Sent { type: string, payload: any }
type FakeClient = ReturnType<typeof fakeClient>

function fakeClient(sessionId: string) {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, isAdmin: boolean, x = 0, z = 0, ry = 0): Player {
  return {
    sessionId,
    pseudo: sessionId.toUpperCase(),
    isAdmin,
    x,
    y: 1.6,
    z,
    ry,
    tradeId: null,
    seatId: null,
    clinicBedId: null,
    knockedOutUntil: 0,
    lastAdminActionAt: 0,
    pubShots: null
  } as Player
}

function fakeRoom(...players: Player[]): AdminRoom & { clients: FakeClient[], moves: string[] } {
  const moves: string[] = []
  return {
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients: players.map((p) => fakeClient(p.sessionId)),
    housingUnits: [],
    houseFurniture: [],
    openDoors: new Set(),
    clinicBeds: new Map(),
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    trades: new Map(),
    clock: { setTimeout: () => undefined },
    forEachClient: () => undefined,
    broadcastMove: (client) => void moves.push(client.sessionId),
    refreshHouseFurniture: async () => undefined,
    moves
  }
}

const CLINIC = doorDestination('clinic', 'Clinic', { x: -122, y: 0, z: 12 }, { x: -115.5, y: 1.25, z: 12 })
const destinations = (): TeleportDestination[] => [CLINIC]

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

test('a door destination stands outside the door and looks back at it', () => {
  assert.equal(CLINIC.position.x, -113)
  assert.equal(CLINIC.position.z, 12)
  assert.equal(CLINIC.position.y, 1.6)
  // camera forward is (-sin yaw, -cos yaw): towards the building, i.e. -x
  assert.ok(Math.abs(-Math.sin(CLINIC.yaw) - -1) < 1e-9)
  assert.ok(Math.abs(Math.cos(CLINIC.yaw)) < 1e-9)
})

test('only admins get the admin menu', () => {
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false, 3, 4))
  const [admin, player] = room.clients
  onAdminOpen(room, player, destinations)
  assert.deepEqual(player.sent, [])
  onAdminOpen(room, admin, destinations)
  assert.deepEqual(received(admin, 'admin_menu'), [{ destinations: [{ key: 'clinic', name: 'Clinic' }], players: [{ sessionId: 'b', pseudo: 'B', distance: 5 }] }])
})

test('an admin teleports to a listed place; a player cannot', () => {
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false))
  const [admin, player] = room.clients
  onAdminTeleport(room, player, { key: 'clinic' }, 1000, destinations)
  assert.equal(room.players.get('b')!.x, 0)
  onAdminTeleport(room, admin, { key: 'clinic' }, 1000, destinations)
  const moved = room.players.get('a')!
  assert.deepEqual({ x: moved.x, y: moved.y, z: moved.z, fallPeakY: moved.fallPeakY }, { x: -113, y: 1.6, z: 12, fallPeakY: 1.6 })
  assert.deepEqual(received(admin, 'teleported'), [{ x: -113, y: 1.6, z: 12, ry: CLINIC.yaw }])
  assert.deepEqual(room.moves, ['a'])
  onAdminTeleport(room, admin, { key: 'nowhere' }, 5000, destinations)
  assert.equal(received(admin, 'admin_error').length, 1)
})

test('a summoned player lands in front of the admin, facing them', () => {
  const room = fakeRoom(fakePlayer('a', true, 10, 10, 0), fakePlayer('b', false, -50, 40))
  const [admin, target] = room.clients
  onAdminSummon(room, admin, { sessionId: 'b' }, 1000)
  const moved = room.players.get('b')!
  assert.equal(moved.x, 10)
  assert.equal(moved.z, 10 - SUMMON_DISTANCE)
  assert.equal(moved.ry, Math.PI)
  assert.equal(received(target, 'teleported').length, 1)
  assert.deepEqual(received(target, 'admin_summoned'), [{ byPseudo: 'A' }])
})

test('players cannot summon, and the clinic keeps its patients', () => {
  const patient = fakePlayer('c', false, 5, 5)
  patient.knockedOutUntil = 10_000
  const room = fakeRoom(fakePlayer('a', true), fakePlayer('b', false, 3, 3), patient)
  const [admin, player] = room.clients
  onAdminSummon(room, player, { sessionId: 'a' }, 1000)
  assert.equal(room.players.get('a')!.x, 0)
  onAdminSummon(room, admin, { sessionId: 'c' }, 1000)
  assert.equal(room.players.get('c')!.x, 5)
  assert.equal(received(admin, 'admin_error').length, 1)
})
