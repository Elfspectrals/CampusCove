import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  FULL_LAP,
  advanceSpeed,
  applyPush,
  insideCones,
  insideRink,
  lapOf,
  newSpeedState,
  parseSkatingRules,
  progressStep,
  pushKind,
  rankFinishers,
  setBraking,
  startProgress
} from './skatingSim.ts'

const shipped = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/skating.json', import.meta.url), 'utf8'))
const rules = parseSkatingRules(shipped)
const { skate, oval, rink } = rules

test('the shipped rules are ready and coherent', () => {
  assert.deepEqual(rules.laps, [1, 3, 5])
  assert.equal(rules.maxPlayers, 8)
  for (const [x, z] of oval.grid) {
    assert.ok(insideRink(rink, x, z), `grid spot ${x},${z} on the ice`)
    assert.ok(!insideCones(oval, x, z), `grid spot ${x},${z} outside the cones`)
    assert.ok(x < oval.startLineX, 'grid behind the start line')
  }
  for (const [x, z] of [oval.a, oval.b]) assert.ok(insideRink(rink, x - oval.radius, z) && insideRink(rink, x + oval.radius, z))
  assert.throws(() => parseSkatingRules({ ...shipped, status: 'placeholder' }), /not ready/)
  assert.throws(() => parseSkatingRules({ ...shipped, skate: { ...shipped.skate, maxSpeed: null } }), /maxSpeed/)
})

test('a push in the rhythm gives more, too early gives less', () => {
  assert.equal(pushKind(skate, null, 150), 'normal')
  assert.equal(pushKind(skate, 650, 150), 'good')
  assert.equal(pushKind(skate, 500, 150), 'good')
  assert.equal(pushKind(skate, 499, 150), 'early')
  assert.equal(pushKind(skate, 801, 150), 'normal')
})

test('speed replay: pushes, glide, brake and the distance travelled', () => {
  const s = newSpeedState(0)
  assert.equal(applyPush(skate, s, 0), 'normal')
  assert.equal(s.speed, 1.6)
  assert.equal(applyPush(skate, s, 650), 'good')
  assert.ok(Math.abs(s.speed - (1.6 - 0.5 * 0.65 + 2.6)) < 1e-9)
  assert.ok(Math.abs(s.distance - (1.6 * 0.65 - (0.5 * 0.65 * 0.65) / 2)) < 1e-9)
  for (let t = 1300; t <= 6500; t += 650) applyPush(skate, s, t)
  assert.equal(s.speed, skate.maxSpeed)
  setBraking(skate, s, true, 6500)
  advanceSpeed(skate, s, 10_000)
  assert.equal(s.speed, 0)
  const before = s.distance
  advanceSpeed(skate, s, 20_000)
  assert.equal(s.distance, before)
  assert.equal(applyPush(skate, s, 20_100), 'normal', 'a push long after the last one is a normal push')
})

test('the server judges the rhythm with the network allowance on top', () => {
  const s = newSpeedState(0)
  applyPush(skate, s, 0)
  assert.equal(applyPush(skate, s, 420), 'good')
})

test('progress grows counterclockwise from the start line, cones and laps', () => {
  const [gx, gz] = oval.grid[0]
  assert.ok(startProgress(oval, gx, gz) < 0)
  assert.ok(Math.abs(startProgress(oval, oval.startLineX, gz)) < 1e-9)
  assert.ok(progressStep(oval, oval.startLineX, gz, oval.startLineX + 2, gz) > 0)
  assert.ok(progressStep(oval, oval.startLineX, gz, oval.startLineX - 2, gz) < 0)
  assert.ok(insideCones(oval, oval.a[0], oval.a[1]))
  assert.ok(!insideCones(oval, oval.a[0] - oval.radius - 0.1, oval.a[1]))
  assert.equal(lapOf(-0.2, 3), 1)
  assert.equal(lapOf(FULL_LAP + 0.1, 3), 2)
  assert.equal(lapOf(10 * FULL_LAP, 3), 3)
})

test('finishers are ranked by time, then sign-up order', () => {
  const ranked = rankFinishers([
    { accountId: 1, timeMs: 30_000, signedAt: 0 },
    { accountId: 2, timeMs: 28_000, signedAt: 1 },
    { accountId: 3, timeMs: 30_000, signedAt: 2 }
  ])
  assert.deepEqual(ranked.map((r) => [r.accountId, r.place]), [[2, 1], [1, 2], [3, 3]])
})
