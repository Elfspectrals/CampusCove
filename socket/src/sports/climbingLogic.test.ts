import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  type ClimbLine,
  clickHold,
  climbTime,
  climberPose,
  expire,
  loweredY,
  nearStart,
  parseClimbingRules,
  standingPose,
  startClimb,
  startLowering,
  windowOf
} from './climbingLogic.ts'

const RULES_FILE = new URL('../../../front/public/assets/sports/rules/climbing.json', import.meta.url)
const raw = JSON.parse(await readFile(RULES_FILE, 'utf8'))
const rules = parseClimbingRules(raw)
const line = (id: string) => rules.lines.get(id) as ClimbLine

test('the shipped rules hold 4 routes, 2 twin speed lanes and 6 boulders, harder colours with more holds', () => {
  const lines = [...rules.lines.values()]
  assert.equal(lines.filter((l) => l.kind === 'route').length, 6)
  assert.equal(lines.filter((l) => l.kind === 'boulder').length, 6)
  assert.deepEqual(rules.twins, ['speed_1', 'speed_2'])
  assert.deepEqual(['route_1', 'route_2', 'route_3', 'route_4'].map((id) => line(id).colour), ['green', 'blue', 'red', 'black'])
  const counts = ['route_1', 'route_2', 'route_3', 'route_4'].map((id) => line(id).holds.length)
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b))
  const windows = ['green', 'blue', 'red', 'black'].map((c) => rules.colours.get(c)?.windowMs as number)
  assert.deepEqual(windows, [...windows].sort((a, b) => b - a))
  assert.equal(rules.belayLowerMs, 2000)
})

test('green window: lit at 0, opens at 700, closes at 1600, accepted until 1750 with the allowance', () => {
  assert.deepEqual(windowOf(rules, startClimb(rules, line('route_1'), 0)), { opensAt: 700, closesAt: 1600 })
  const cases: [number, string][] = [[699, 'miss'], [700, 'hold'], [1600, 'hold'], [1750, 'hold'], [1751, 'miss']]
  for (const [at, expected] of cases) {
    const climb = startClimb(rules, line('route_1'), 0)
    assert.equal(clickHold(rules, climb, 0, at), expected, `click at ${at}`)
  }
})

test('a miss costs grip and lights the same hold again; a click on another hold is a miss', () => {
  const climb = startClimb(rules, line('route_1'), 0)
  assert.equal(clickHold(rules, climb, 1, 800), 'miss')
  assert.equal(climb.grip, 80)
  assert.equal(climb.next, 0)
  assert.equal(climb.litAt, 800)
  assert.equal(clickHold(rules, climb, -1, 1600), 'miss')
  assert.equal(climb.grip, 60)
})

test('time runs from the first hold to the top hold', () => {
  const boulder = line('boulder_1')
  const climb = startClimb(rules, boulder, 1000)
  let at = 1000
  const outcomes: string[] = []
  for (let i = 0; i < boulder.holds.length; i++) {
    at += 800
    outcomes.push(clickHold(rules, climb, i, at))
  }
  assert.deepEqual(outcomes, ['hold', 'hold', 'hold', 'hold', 'top'])
  assert.equal(climb.startedAt, 1800)
  assert.equal(climbTime(climb, at), 3200)
})

test('black: an unclicked hold expires after closesAt plus the allowance, and three misses empty the grip', () => {
  const climb = startClimb(rules, line('route_4'), 0)
  assert.equal(expire(rules, climb, 1270), null)
  assert.equal(expire(rules, climb, 1271), 'miss')
  assert.equal(climb.grip, 65)
  assert.equal(expire(rules, climb, 1271 + 1271), 'miss')
  assert.equal(expire(rules, climb, 1271 * 3), 'fall')
  assert.equal(climb.grip, 0)
})

test('a duel climb ignores clicks before its first hold lights', () => {
  const climb = startClimb(rules, line('speed_1'), 0, 'match-1', 3000)
  assert.equal(clickHold(rules, climb, 0, 2999), 'ignored')
  assert.equal(climb.grip, rules.gripMax)
  assert.equal(expire(rules, climb, 3000 + 700 + 550 + 150), null)
})

test('the climber stands off the wall facing it, the eye just under the last hold', () => {
  const speed = line('speed_1')
  assert.deepEqual(climberPose(rules, speed, 0), { x: -576.3 + 0.55, y: 0.2 + 1.6, z: -202.05, ry: Math.PI / 2 })
  const hold = speed.holds[9]
  const pose = climberPose(rules, speed, 10)
  assert.ok(Math.abs(pose.z - (-202.05 - hold.u)) < 1e-9)
  assert.ok(Math.abs(pose.y - (0.2 + hold.y - 0.35)) < 1e-9)
  const north = climberPose(rules, line('boulder_4'), 0)
  assert.deepEqual([north.x, north.z, north.ry], [-558, -195 - 0.55, Math.PI])
})

test('the start is reached within 2.5 m of the standing spot in front of the line', () => {
  const route = line('route_2')
  const spot = standingPose(rules, route)
  assert.equal(nearStart(rules, route, spot.x + 2.5, spot.z), true)
  assert.equal(nearStart(rules, route, spot.x + 2.51, spot.z), false)
})

test('the belay lowers the climber to the ground in 2 s', () => {
  const climb = startClimb(rules, line('route_1'), 0)
  startLowering(climb, 11.8, 10_000)
  assert.deepEqual(loweredY(rules, climb, 11_000), { y: 11.8 + (1.8 - 11.8) / 2, done: false })
  assert.deepEqual(loweredY(rules, climb, 12_000), { y: 1.8, done: true })
})

test('rules that break the contract are refused', () => {
  const twins = structuredClone(raw)
  twins.lines.find((l: { id: string }) => l.id === 'speed_2').holds[0] = [0.5, 0.7]
  assert.throws(() => parseClimbingRules(twins), /identical/)
  const down = structuredClone(raw)
  down.lines[0].holds[1] = [0, 0.1]
  assert.throws(() => parseClimbingRules(down), /go up/)
  assert.throws(() => parseClimbingRules({ ...raw, status: 'placeholder' }), /ready/)
})
