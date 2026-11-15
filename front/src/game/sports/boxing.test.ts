import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type BoxingStatePayload, bagInFront, bagSteps, boxerFor, drillAfter, parseBagCombos, parseBagDoubleFrom, clockLabel, isFighting, handFor, parseHoldMs, parsePunchBags, parseRingArena, percentOf, punchKindAfter, rockAngle, secondsUntil, serverClock, trianglesBySide, boundsOfVertices } from './boxing.ts'

const boxer = (sessionId: string, corner: 'red' | 'blue') => ({
  sessionId, name: sessionId, corner, health: 120, maxHealth: 120, endurance: 100, maxEndurance: 100,
  guard: false, knockdowns: 0, countEndsAt: null, canGetUp: false, points: 0,
})

function state(phase: BoxingStatePayload['phase']): BoxingStatePayload {
  return { venue: 'boxing_ring', phase, round: 1, rounds: 3, maxKnockdowns: 3, phaseEndsAt: 70_000, serverNow: 10_000, boxers: [boxer('a', 'red'), boxer('b', 'blue')], result: null }
}

test('left and right buttons are the hands; a tap is a jab or a cross, a hold from the rules time a hook or an uppercut', () => {
  assert.deepEqual([handFor(0), handFor(2), handFor(1)], ['left', 'right', null])
  assert.equal(punchKindAfter('left', 249, 250), 'jab')
  assert.equal(punchKindAfter('left', 250, 250), 'hook')
  assert.equal(punchKindAfter('right', 0, 250), 'cross')
  assert.equal(punchKindAfter('right', 4000, 250), 'uppercut')
  assert.equal(parseHoldMs({ hold: { ms: 250 } }), 250)
  assert.throws(() => parseHoldMs({ hold: { ms: 0 } }), /hold/)
  assert.throws(() => parseHoldMs({}), /hold/)
})

test('the round clock runs on the server clock and shows whole seconds, never below zero', () => {
  const now = serverClock(state('round'), 5_000, 5_500)
  assert.equal(serverClock(state('round'), 5_000, 4_900), 10_000)
  assert.equal(secondsUntil(20_000, serverClock(state('round'), 5_000, 4_900)), 10)
  assert.equal(now, 10_500)
  assert.equal(secondsUntil(70_000, now), 60)
  assert.equal(secondsUntil(70_000, 69_001), 1)
  assert.equal(secondsUntil(70_000, 70_000), 0)
  assert.equal(secondsUntil(70_000, 80_000), 0)
  assert.deepEqual([clockLabel(60), clockLabel(65), clockLabel(9), clockLabel(0)], ['1:00', '1:05', '0:09', '0:00'])
})

test('bars are whole percents clamped to 0-100, and a zero maximum is an error', () => {
  assert.deepEqual([percentOf(60, 120), percentOf(0, 120), percentOf(130, 120), percentOf(-5, 100)], [50, 0, 100, 0])
  assert.throws(() => percentOf(1, 0), /maximum/)
})

test('a player fights while their bout is not over; a spectator never does', () => {
  assert.equal(boxerFor(state('round'), 'b')?.corner, 'blue')
  assert.equal(isFighting(state('intro'), 'a'), true)
  assert.equal(isFighting(state('over'), 'a'), false)
  assert.equal(isFighting(state('round'), 'spectator'), false)
  assert.equal(isFighting(null, 'a'), false)
})

test('the punch bags come from the rules, and a broken list is an error', () => {
  assert.deepEqual(parsePunchBags({ punchBags: [{ x: 1, z: 2 }] }), [{ x: 1, z: 2 }])
  assert.throws(() => parsePunchBags({ punchBags: [] }), /punchBags/)
  assert.throws(() => parsePunchBags({ punchBags: [{ x: 1 }] }), /punchBags\.0/)
})

test('the combo of a bag round shows the punches done, the next one and those to come', () => {
  assert.deepEqual(bagSteps(['jab', 'cross', 'hook'], 0).map((s) => s.state), ['next', 'todo', 'todo'])
  assert.deepEqual(bagSteps(['jab', 'cross', 'hook'], 2), [{ kind: 'jab', state: 'done' }, { kind: 'cross', state: 'done' }, { kind: 'hook', state: 'next' }])
})

test('the combo list is the combos of the bout then the training ones; the choice goes round the list, random first', () => {
  const combos = parseBagCombos({ combo: { list: [{ id: 'one_two', sequence: ['jab', 'cross'] }] }, bag: { extra: [{ id: 'slip_counter', sequence: ['dodge_left', 'cross', 'hook'] }] } })
  assert.deepEqual(combos.map((c) => c.id), ['one_two', 'slip_counter'])
  assert.throws(() => parseBagCombos({ combo: { list: [] }, bag: { extra: [{ id: 'x', sequence: ['kick'] }] } }), /invalid bag combo 0/)
  assert.throws(() => parseBagCombos({ combo: { list: [] } }), /bag.extra/)
  assert.equal(drillAfter(combos, null, 1), 'one_two')
  assert.equal(drillAfter(combos, 'one_two', 1), 'slip_counter')
  assert.equal(drillAfter(combos, 'slip_counter', 1), null)
  assert.equal(drillAfter(combos, null, -1), 'slip_counter')
  assert.equal(drillAfter(combos, 'one_two', -1), null)
})

test('the streak that doubles the points of a bag combo comes from the rules', () => {
  assert.equal(parseBagDoubleFrom({ bag: { streakForDouble: 3 } }), 3)
  assert.throws(() => parseBagDoubleFrom({ bag: {} }), /streakForDouble/)
  assert.throws(() => parseBagDoubleFrom({}), /streakForDouble/)
})

test('a bag is hit when it is within 1.3 m and in front; the nearest wins', () => {
  const bags = [{ x: 0, z: -1 }, { x: 0, z: -1.2 }, { x: 5, z: 0 }]
  assert.equal(bagInFront(bags, 0, 0, 0, -1), 0)
  assert.equal(bagInFront(bags, 0, 0, 0, 1), null)
  assert.equal(bagInFront([{ x: 0, z: -1.3 }], 0, 0, 0, -1), 0)
  assert.equal(bagInFront([{ x: 0, z: -1.31 }], 0, 0, 0, -1), null)
})

test('a hit bag rocks and settles back to rest after 0.9 s', () => {
  assert.equal(rockAngle(0), 0)
  assert.ok(Math.abs(rockAngle(0.08)) > 0.02)
  assert.equal(rockAngle(0.9), 0)
  assert.equal(rockAngle(-0.1), 0)
})

test('the gloves pair splits into one glove per side by triangle centre, indexed or not', () => {
  const positions = [-2, 0, 0, -1, 0, 0, -1.5, 1, 0, 1, 0, 0, 2, 0, 0, 1.5, 1, 0]
  assert.deepEqual(trianglesBySide(positions, null, 0), { left: [3, 4, 5], right: [0, 1, 2] })
  assert.deepEqual(trianglesBySide(positions, [3, 4, 5, 0, 1, 2], 0), { left: [3, 4, 5], right: [0, 1, 2] })
  assert.throws(() => trianglesBySide(positions, [0, 1], 0), /whole triangles/)
})

test('one glove is bounded by its own vertices only, not by the whole pair', () => {
  const positions = [-3, 0, 0, -2, 1, 0, -1, 0, 2, 1, 0, 0, 2, 3, 0, 3, 0, -1]
  assert.deepEqual(boundsOfVertices(positions, [3, 4, 5]), { min: [1, 0, -1], max: [3, 3, 0] })
  assert.deepEqual(boundsOfVertices(positions, [0, 1, 2, 1]), { min: [-3, 0, 0], max: [-1, 1, 2] })
  assert.throws(() => boundsOfVertices(positions, []), /no vertices/)
})

test('the fight camera stays within 3.6 m of the ring, inside the hall walls', () => {
  const arena = parseRingArena({ ring: { centre: { x: -383, y: 1.1, z: -229.6 }, halfM: 3.05 } })
  for (const [side, value] of [['minX', -389.65], ['maxX', -376.35], ['minZ', -236.25], ['maxZ', -222.95]] as const) {
    assert.ok(Math.abs(arena[side] - value) < 1e-9, `${side} is ${arena[side]}`)
  }
  assert.throws(() => parseRingArena({ ring: { centre: { x: 0 }, halfM: 3 } }), /ring/)
  assert.throws(() => parseRingArena({ ring: { centre: { x: 0, z: 0 }, halfM: 0 } }), /ring/)
})
