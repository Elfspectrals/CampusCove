import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  type Climb,
  type ClimbLine,
  climbTime,
  climberPose,
  expire,
  gripNow,
  gripRate,
  loweredY,
  nearStart,
  needleAngle,
  parseClimbingRules,
  pressCheck,
  reachHold,
  reachTo,
  standingPose,
  startClimb,
  startLowering
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
  for (const [field, harderIs] of [['zoneDeg', 'smaller'], ['turnMs', 'smaller'], ['drainPerSec', 'bigger'], ['lossPerMiss', 'bigger']] as const) {
    const values = ['green', 'blue', 'red', 'black'].map((c) => rules.colours.get(c)?.[field] as number)
    assert.deepEqual(values, [...values].sort((a, b) => (harderIs === 'smaller' ? b - a : a - b)), field)
  }
  assert.equal(rules.belayLowerMs, 2000)
})

const WALL: ClimbLine = { id: 'wall', kind: 'boulder', colour: 'green', base: { x: 0, z: 0 }, face: 'east', holds: [{ u: 0, y: 0.7 }, { u: 0, y: 1.7 }, { u: 0, y: 3.6 }, { u: 0, y: 6.0 }, { u: 0, y: 7.0 }] }

function hanging(reached: number, grip: number, at: number): Climb {
  return { ...startClimb(rules, WALL, 0), next: reached, grip, gripAt: at, startedAt: 0 }
}

test('green check on a short reach: a 70° zone starting between 120° and 280°, its first quarter is great, 80 ms of allowance at its end', () => {
  const first = startClimb(rules, WALL, 0)
  assert.equal(reachHold(rules, first, 0, 0, () => 0), 'reach')
  assert.deepEqual(first.check, { hold: 0, startedAt: 0, turnMs: 2000, zoneStart: 120, zoneSize: 70, greatSize: 17.5 })
  const last = startClimb(rules, WALL, 0)
  reachHold(rules, last, 0, 0, () => 1)
  assert.equal(last.check?.zoneStart, 280)
  const cases: [number, string][] = [[999, 'miss'], [1000, 'great'], [1100, 'great'], [1177, 'great'], [1178, 'hold'], [1468, 'hold'], [1470, 'miss']]
  for (const [at, expected] of cases) {
    const climb = startClimb(rules, WALL, 0)
    reachHold(rules, climb, 0, 0, () => 0.375)
    assert.equal(climb.check?.zoneStart, 180)
    assert.equal(pressCheck(rules, climb, at), expected, `press at ${at} ms, needle at ${needleAngle(climb.check ?? { hold: 0, startedAt: 0, turnMs: 2000, zoneStart: 0, zoneSize: 0, greatSize: 0 }, at)}°`)
  }
})

test('the further the next hold, the narrower the zone: full at 1.4 m or less, 35 % narrower from 2.4 m', () => {
  assert.deepEqual([1, 2, 3, 4].map((hold) => reachTo(WALL, hold).toFixed(1)), ['1.0', '1.9', '2.4', '1.0'])
  const zones = [1, 2, 3].map((hold) => {
    const climb = hanging(hold, 100, 0)
    reachHold(rules, climb, hold, 0, () => 0)
    return climb.check?.zoneSize.toFixed(2)
  })
  assert.deepEqual(zones, ['70.00', '57.75', '45.50'])
})

test('a missed check costs grip and leaves the climber on their hold; a press with no check, a click on another hold or a click during a check does nothing', () => {
  const climb = startClimb(rules, WALL, 0)
  assert.equal(pressCheck(rules, climb, 100), 'ignored')
  assert.equal(reachHold(rules, climb, 1, 100, () => 0), 'ignored')
  assert.equal(reachHold(rules, climb, -1, 100, () => 0), 'ignored')
  assert.equal(reachHold(rules, climb, 0, 100, () => 0), 'reach')
  assert.equal(reachHold(rules, climb, 0, 200, () => 0), 'ignored')
  assert.equal(pressCheck(rules, climb, 300), 'miss')
  assert.deepEqual([climb.grip, climb.next, climb.check], [88, 0, null])
  assert.equal(pressCheck(rules, climb, 400), 'ignored')
})

test('a needle left to finish its turn is a miss, 80 ms after the turn', () => {
  const climb = startClimb(rules, WALL, 0)
  reachHold(rules, climb, 0, 0, () => 0)
  assert.equal(expire(rules, climb, 2080), null)
  assert.equal(expire(rules, climb, 2081), 'miss')
  assert.equal(climb.grip, 88)
})

test('grip: full on the mat, back at 6 a second on a hold reached within 1.4 m, down faster the further the last reach', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((reached) => gripRate(rules, hanging(reached, 50, 0)).toFixed(2)), ['0.00', '6.00', '6.00', '-1.75', '-2.50'])
  assert.equal(gripNow(rules, hanging(0, 50, 1000), 5000), 50)
  assert.equal(gripNow(rules, hanging(2, 50, 1000), 3000), 62)
  assert.equal(gripNow(rules, hanging(2, 50, 1000), 61_000), 100)
  assert.equal(gripNow(rules, hanging(3, 50, 1000), 5000).toFixed(2), '43.00')
  assert.equal(gripNow(rules, hanging(4, 50, 1000), 5000).toFixed(2), '40.00')
  assert.equal(gripNow(rules, hanging(4, 50, 1000), 500), 50)
})

test('an empty grip is a fall, and so is a climb of more than 3 minutes', () => {
  assert.equal(expire(rules, hanging(4, 50, 0), 19_999), null)
  assert.equal(expire(rules, hanging(4, 50, 0), 20_001), 'fall')
  assert.equal(expire(rules, hanging(2, 50, 0), 180_000), null)
  assert.equal(expire(rules, hanging(2, 50, 0), 180_001), 'fall')
})

test('a great check gives 8 grip back, never above the maximum', () => {
  const tired = hanging(4, 50, 0)
  reachHold(rules, tired, 4, 0, () => 0)
  assert.equal(pressCheck(rules, tired, 667), 'top')
  const low = hanging(1, 50, 0)
  reachHold(rules, low, 1, 0, () => 0)
  assert.equal(pressCheck(rules, low, 667), 'great')
  assert.ok(Math.abs(low.grip - (50 + 6 * 0.667 + 8)) < 1e-9)
  const full = hanging(1, 99, 0)
  reachHold(rules, full, 1, 0, () => 0)
  assert.equal(pressCheck(rules, full, 667), 'great')
  assert.equal(full.grip, 100)
})

test('time runs from the first hold to the top hold', () => {
  const boulder = line('boulder_1')
  const climb = startClimb(rules, boulder, 1000)
  let at = 1000
  const outcomes: string[] = []
  for (let i = 0; i < boulder.holds.length; i++) {
    reachHold(rules, climb, i, at, () => 0)
    at += 700
    outcomes.push(pressCheck(rules, climb, at))
  }
  assert.deepEqual(outcomes, ['great', 'great', 'great', 'great', 'top'])
  assert.equal(climb.startedAt, 1700)
  assert.equal(climbTime(climb, at), 2800)
})

test('a duel climb ignores clicks before its start, and its grip does not move before it', () => {
  const climb = startClimb(rules, line('speed_1'), 0, 'match-1', 3000)
  assert.equal(reachHold(rules, climb, 0, 2999, () => 0), 'ignored')
  assert.equal(gripNow(rules, climb, 2999), rules.gripMax)
  assert.equal(expire(rules, climb, 60_000), null)
  assert.equal(reachHold(rules, climb, 0, 3000, () => 0), 'reach')
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
  assert.throws(() => parseClimbingRules({ ...raw, grip: { ...raw.grip, strainReachM: raw.grip.restReachM } }), /strainReachM/)
  assert.throws(() => parseClimbingRules({ ...raw, check: { ...raw.check, minStartDeg: 300 } }), /does not fit/)
  assert.throws(() => parseClimbingRules({ ...raw, check: { ...raw.check, strainZoneCut: 1 } }), /strainZoneCut/)
})
