import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { freePlayers, jackWatchers, flightPoint, inCircle, meterPower, parsePetanqueClientRules, rollPositions, teamLeft, throwYaw, type PetanqueFrame, type PetanqueStatePayload } from './petanque.ts'

const rulesJson: unknown = JSON.parse(readFileSync(new URL('../../../public/assets/sports/rules/petanque.json', import.meta.url), 'utf8'))

test('reads the client fields of the rules file', () => {
  const rules = parsePetanqueClientRules(rulesJson)
  assert.equal(rules.riseMs, 1200)
  assert.deepEqual(rules.pistes.map((p) => p.id), ['petanque_1', 'petanque_2', 'petanque_3', 'petanque_4'])
  assert.deepEqual(rules.pistes[0].freeCircle, { x: -406.3, z: -258, axisZ: -1 })
  assert.ok(Math.abs(rules.bouleRadiusM - 0.0375) < 1e-6)
  assert.throws(() => parsePetanqueClientRules({}), /circleFromEndM/)
})

test('mirrors the server power meter', () => {
  assert.equal(meterPower(600, 1200), 0.5)
  assert.equal(meterPower(1200, 1200), 1)
  assert.equal(meterPower(1800, 1200), 0.5)
})

test('turns the camera direction into a yaw from the throwing axis, clamped', () => {
  assert.equal(throwYaw(0, -1, -1, 30), 0)
  assert.equal(throwYaw(0, 1, 1, 30), 0)
  assert.ok(Math.abs(throwYaw(1, -1, -1, 60) - Math.PI / 4) < 1e-6)
  assert.ok(Math.abs(throwYaw(1, 0, -1, 30) - Math.PI / 6) < 1e-6)
  assert.ok(Math.abs(throwYaw(-1, 0, 1, 30) + Math.PI / 6) < 1e-6)
})

test('knows when the player stands in the circle', () => {
  assert.equal(inCircle(0, 1.2, { x: 0, z: 0 }, 1.2), true)
  assert.equal(inCircle(0, 1.3, { x: 0, z: 0 }, 1.2), false)
})

test('flies from the hand to the landing point over the arc', () => {
  const shot = { from: { x: 0, z: 0 }, landing: { x: 0, z: -4 }, airMs: 1000 }
  assert.deepEqual(flightPoint(shot, 2, 0, 0), { x: 0, y: 0.9, z: 0 })
  assert.ok(Math.abs(flightPoint(shot, 2, 500, 0).y - (0.45 + 2)) < 1e-6)
  assert.deepEqual(flightPoint(shot, 2, 1000, 0.1), { x: 0, y: 0.1, z: -4 })
})

test('interpolates rolling balls between frames and keeps the last place', () => {
  const frames: PetanqueFrame[] = [[0, [2, 0, 0]], [100, [2, 0, -1], [1, 5, 5]], [200, [1, 5, 6], [2, 0, -1]]]
  assert.deepEqual(rollPositions(frames, 50).get(2), [0, -0.5])
  assert.deepEqual(rollPositions(frames, 150).get(1), [5, 5.5])
  assert.deepEqual(rollPositions(frames, 500).get(1), [5, 6])
})

test('adds the boules left of the players still in the game', () => {
  const state = { players: [{ team: 'red', out: false, left: 2 }, { team: 'red', out: true, left: 3 }, { team: 'blue', out: false, left: 1 }] } as PetanqueStatePayload
  assert.equal(teamLeft(state, 'red'), 2)
  assert.equal(teamLeft(state, 'blue'), 1)
})

test('players of the match standing near the jack watch it, the thrower and the players far away do not', () => {
  const state = {
    phase: 'boules',
    thrower: 'a',
    balls: [{ id: 1, kind: 'jack', team: null, owner: null, x: 0, z: -8, dead: false }],
    players: [{ sessionId: 'a', out: false }, { sessionId: 'b', out: false }, { sessionId: 'c', out: false }, { sessionId: 'd', out: true }],
  } as unknown as PetanqueStatePayload
  const at: Record<string, { x: number; z: number }> = { a: { x: 0, z: -8 }, b: { x: 1, z: -8.5 }, c: { x: 0, z: 0 }, d: { x: 0, z: -8 } }
  assert.deepEqual([...jackWatchers(state, (id) => at[id] ?? null)], ['b'])
  assert.equal(jackWatchers({ ...state, phase: 'between' }, (id) => at[id] ?? null).size, 0)
})

test('a free player holds a boule while back in the circle of the piste they threw on, for two minutes', () => {
  const circles = new Map([['petanque_1', { x: 0, z: 0 }]])
  const last = new Map([['a', { venue: 'petanque_1', at: 1_000 }], ['b', { venue: 'petanque_1', at: 1_000 }]])
  const at: Record<string, { x: number; z: number }> = { a: { x: 0.5, z: 0 }, b: { x: 5, z: 0 } }
  assert.deepEqual([...freePlayers(last, circles, 1.2, 2_000, (id) => at[id] ?? null)], ['a'])
  assert.equal(freePlayers(last, circles, 1.2, 1_000 + 120_000, (id) => at[id] ?? null).size, 0)
})
