import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { BUS_RENDER_DELAY_MS, boardableBus, createBusTrack, inBusFrame, stopName, type BusLineLayout, type BusSnapshot } from './townBus.ts'

const stops = [
  { id: 'town', name: 'Town Hall', A: { stand: [0, 0], boarding: [0, 3], pole: [2, 3], shelter: null }, B: { stand: [10, 0], boarding: [10, -3], pole: [12, -3], shelter: null } },
] as BusLineLayout['stops']

function snapshot(id: 'A' | 'B', stop: string | null): BusSnapshot {
  return { id, x: 0, z: 0, yaw: 0, stop, departsInMs: 5000, next: 'town', riders: 0 }
}

test('the track plays the bus a little in the past, between two server snapshots', () => {
  const track = createBusTrack()
  assert.equal(track.poseAt(0), null)
  track.push(1000, { x: 0, z: 0, yaw: 0 })
  track.push(1200, { x: 2, z: -4, yaw: 0.2 })
  const mid = track.poseAt(1100 + BUS_RENDER_DELAY_MS)!
  assert.ok(Math.abs(mid.x - 1) < 1e-9 && Math.abs(mid.z + 2) < 1e-9 && Math.abs(mid.yaw - 0.1) < 1e-9)
  assert.deepEqual(track.poseAt(5000), { x: 2, z: -4, yaw: 0.2 })
  assert.deepEqual(track.poseAt(0), { x: 0, z: 0, yaw: 0 })
})

test('the yaw turns the short way across the half turn', () => {
  const track = createBusTrack()
  track.push(0, { x: 0, z: 0, yaw: Math.PI - 0.1 })
  track.push(200, { x: 0, z: 0, yaw: -Math.PI + 0.1 })
  const yaw = track.poseAt(100 + BUS_RENDER_DELAY_MS)!.yaw
  assert.ok(Math.abs(Math.cos(yaw) + 1) < 1e-9)
})

test('a local seat turns with the bus like the socket places it', () => {
  const p = inBusFrame({ x: 10, z: 20, yaw: -Math.PI / 2 }, [-0.45, -4])
  assert.ok(Math.abs(p.x - 14) < 1e-9 && Math.abs(p.z - 19.55) < 1e-9)
})

test('the board prompt needs a docked bus and its door within reach', () => {
  assert.equal(boardableBus([snapshot('A', null)], stops, { x: 0, z: 3 }), null)
  assert.equal(boardableBus([snapshot('A', 'town')], stops, { x: 0, z: 8 }), null)
  assert.equal(boardableBus([snapshot('A', 'town')], stops, { x: 0, z: 4 })?.bus.id, 'A')
  assert.equal(boardableBus([snapshot('A', 'town'), snapshot('B', 'town')], stops, { x: 10, z: -2 })?.bus.id, 'B')
  assert.equal(stopName(stops, 'town'), 'Town Hall')
  assert.equal(stopName(stops, null), '')
})

test('the manifest carries the bus line written by apply-bus', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../public/assets/world.manifest.json', import.meta.url), 'utf8'))
  const line = manifest.bus as BusLineLayout
  assert.ok(line.buses.A.route.length > 10 && line.buses.B.route.length > 10)
  assert.equal(line.stops.length, 8)
  for (const id of ['town', 'orchard', 'farm', 'pub', 'police', 'mall', 'cove_heights', 'sports_complex']) assert.ok(line.stops.some((s) => s.id === id), id)
})
