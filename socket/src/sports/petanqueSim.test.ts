import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parsePetanqueRules } from './petanqueRules.ts'
import { type Ball, distancesCm, meterPower, placeJack, pointHolder, scoreEnd, simulateThrow, validJackSpot } from './petanqueSim.ts'

const rules = parsePetanqueRules(JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/petanque.json', import.meta.url), 'utf8')))
const piste = rules.pistes[0].bounds
const circle = { x: (piste.minX + piste.maxX) / 2, z: piste.maxZ - 1 }
const still = () => 0.25

function jackAt(along: number, x = circle.x): Ball {
  return { id: 1, kind: 'jack', team: null, owner: null, x, z: circle.z - along, dead: false }
}

function boule(id: number, team: 'red' | 'blue', x: number, z: number): Ball {
  return { id, kind: 'boule', team, owner: id, x, z, dead: false }
}

test('the power meter rises over riseMs then falls back', () => {
  assert.equal(meterPower(0, 1200), 0)
  assert.equal(meterPower(600, 1200), 0.5)
  assert.equal(meterPower(1200, 1200), 1)
  assert.equal(meterPower(1800, 1200), 0.5)
  assert.equal(meterPower(2400, 1200), 0)
  assert.equal(meterPower(-50, 1200), 0)
})

test('a straight pointing throw stops at power × max distance from the circle', () => {
  const power = 8 / rules.throw.maxDistanceM
  const result = simulateThrow([], { kind: 'jack', mode: 'point', from: circle, axisZ: -1, yaw: 0, power, team: null, owner: null }, piste, rules, still)
  assert.ok(Math.abs(result.landing.z - (circle.z - 4)) < 1e-6)
  assert.ok(Math.abs(result.ball.z - (circle.z - 8)) < 0.05, `stopped at ${result.ball.z}`)
  assert.ok(Math.abs(result.ball.x - circle.x) < 1e-6)
  assert.equal(result.ball.dead, false)
  assert.ok(result.rollMs > 0 && result.airMs > 0)
  assert.equal(result.frames.at(-1)?.[1]?.[0], result.ball.id)
})

test('the north circle throws toward +z', () => {
  const north = { x: circle.x, z: piste.minZ + 1 }
  const result = simulateThrow([], { kind: 'jack', mode: 'point', from: north, axisZ: 1, yaw: 0, power: 0.5, team: null, owner: null }, piste, rules, still)
  assert.ok(result.ball.z > north.z + 5)
})

test('the aim is clamped to maxAimDeg and a boule touching a board is dead', () => {
  const result = simulateThrow([], { kind: 'boule', mode: 'point', from: circle, axisZ: -1, yaw: 3, power: 1, team: 'red', owner: 1 }, piste, rules, still)
  assert.equal(result.ball.dead, true)
  assert.ok(result.ball.x >= piste.minX && result.ball.x <= piste.maxX)
})

test('a boule that rolls into the jack pushes it', () => {
  const jack = jackAt(6)
  const result = simulateThrow([jack], { kind: 'boule', mode: 'point', from: circle, axisZ: -1, yaw: 0, power: 7 / rules.throw.maxDistanceM, team: 'red', owner: 2 }, piste, rules, still)
  const moved = result.balls.find((b) => b.id === 1) as Ball
  assert.ok(moved.z < jack.z - 0.1, `jack at ${moved.z}`)
})

test('a shot landing on a boule takes its place: carreau', () => {
  const target = boule(2, 'blue', circle.x, circle.z - 7)
  const result = simulateThrow([jackAt(7.5), target], { kind: 'boule', mode: 'shoot', from: circle, axisZ: -1, yaw: 0, power: 7 / rules.throw.maxDistanceM, team: 'red', owner: 3 }, piste, rules, still)
  assert.equal(result.carreau, true)
  const hit = result.balls.find((b) => b.id === 2) as Ball
  assert.ok(Math.hypot(hit.x - target.x, hit.z - target.z) > 0.5)
})

test('a shot that lands on bare ground rolls only a little and is no carreau', () => {
  const result = simulateThrow([jackAt(9)], { kind: 'boule', mode: 'shoot', from: circle, axisZ: -1, yaw: 0, power: 5 / rules.throw.maxDistanceM, team: 'red', owner: 3 }, piste, rules, still)
  assert.equal(result.carreau, false)
  const rolled = (circle.z - 5) - result.ball.z
  assert.ok(rolled > 0 && rolled < 1.5, `rolled ${rolled}`)
})

test('the server scatter moves the landing', () => {
  const input = { kind: 'jack' as const, mode: 'point' as const, from: circle, axisZ: -1 as const, yaw: 0, power: 0.6, team: null, owner: null }
  const a = simulateThrow([], input, piste, rules, () => 0.9)
  const b = simulateThrow([], input, piste, rules, still)
  assert.notEqual(a.ball.x, b.ball.x)
})

test('a jack is valid between 6 and 10 m and away from the sides, else it is placed', () => {
  assert.equal(validJackSpot(jackAt(8), circle, piste, rules), true)
  assert.equal(validJackSpot(jackAt(4), circle, piste, rules), false)
  assert.equal(validJackSpot(jackAt(11), circle, piste, rules), false)
  assert.equal(validJackSpot(jackAt(8, piste.minX + 0.2), circle, piste, rules), false)
  const placed = placeJack(jackAt(4, piste.minX + 0.2), circle, -1, piste, rules)
  assert.equal(validJackSpot(placed, circle, piste, rules), true)
  assert.ok(Math.abs(placed.z - (circle.z - 6)) < 1e-9)
  const dead = placeJack({ ...jackAt(1), dead: true }, circle, -1, piste, rules)
  assert.ok(Math.abs(dead.z - (circle.z - 8)) < 1e-9)
})

test('distances are measured surface to surface in cm, closest first', () => {
  const jack = jackAt(8)
  const gap = rules.boule.radiusM + rules.jack.radiusM
  const balls = [jack, boule(2, 'red', jack.x, jack.z + gap + 0.10), boule(3, 'blue', jack.x, jack.z - gap - 0.05)]
  assert.deepEqual(distancesCm(balls, rules), [{ id: 3, cm: 5 }, { id: 2, cm: 10 }])
  assert.equal(pointHolder(balls, rules)?.team, 'blue')
})

test('an end scores each boule closer than the best opposing one', () => {
  const jack = jackAt(8)
  const at = (cm: number) => jack.z + 0.0525 + cm / 100
  const balls = [jack, boule(2, 'red', jack.x, at(5)), boule(3, 'red', jack.x + 0.3, jack.z), boule(4, 'blue', jack.x, at(40)), boule(5, 'red', jack.x, at(60))]
  assert.deepEqual(scoreEnd(balls, { red: 0, blue: 0 }, rules), { team: 'red', points: 2 })
})

test('with no opposing boule left in play every boule of the leader scores', () => {
  const jack = jackAt(8)
  const balls = [jack, boule(2, 'blue', jack.x, jack.z + 0.5), boule(3, 'blue', jack.x, jack.z + 1), { ...boule(4, 'red', jack.x, jack.z + 0.1), dead: true }]
  assert.deepEqual(scoreEnd(balls, { red: 0, blue: 0 }, rules), { team: 'blue', points: 2 })
})

test('a dead jack gives the boules left to the only team that still has some, else nothing', () => {
  const balls = [{ ...jackAt(8), dead: true }, boule(2, 'red', circle.x, circle.z - 7)]
  assert.deepEqual(scoreEnd(balls, { red: 0, blue: 2 }, rules), { team: 'blue', points: 2 })
  assert.deepEqual(scoreEnd(balls, { red: 1, blue: 2 }, rules), { team: null, points: 0 })
  assert.deepEqual(scoreEnd(balls, { red: 0, blue: 0 }, rules), { team: null, points: 0 })
})
