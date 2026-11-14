import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  type Foot,
  type Race,
  advanceRace,
  applyLook,
  applyStep,
  buildCourse,
  createRace,
  finishX,
  lapLength,
  parseRunningRules,
  pointAt,
  raceOver,
  raceResults,
  stepQuality
} from './runningRace.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/running.json', import.meta.url), 'utf8'))
const rules = parseRunningRules(RAW)
const T0 = 1_000_000
const EAST = -Math.PI / 2

function race(distanceM: number, runners = 1): Race {
  return createRace(rules, distanceM, Array.from({ length: runners }, (_, i) => ({ accountId: i + 1, sessionId: `s${i + 1}` })), T0, () => 0)
}

interface Stepper {
  accountId: number
  stepMs: number
  foot?: (i: number) => Foot
}

function run(r: Race, from: number, until: number, steppers: Stepper[]): void {
  const next = steppers.map(() => from)
  const count = steppers.map(() => 0)
  for (let t = from; t <= until; t += 10) {
    advanceRace(rules, r, t)
    steppers.forEach((s, k) => {
      if (t < next[k]) return
      const runner = r.runners.find((x) => x.accountId === s.accountId)!
      const i = count[k]++
      applyStep(rules, r, runner, s.foot ? s.foot(i) : i % 2 ? 'right' : 'left', t)
      next[k] = t + s.stepMs
    })
  }
}

test('the rules file is ready and its track measures 400 m in lane 1', () => {
  assert.equal(RAW.status, 'ready')
  assert.ok(Math.abs(lapLength(rules.track) - 400) < 0.01)
  assert.ok(Math.abs(finishX(rules.track) - -431.805) < 1e-9)
  const backStraight = pointAt(rules.track, lapLength(rules.track) / 2)
  assert.equal(backStraight.tx, -1)
  assert.ok(Math.abs(backStraight.z - (-369.75 - 36.8)) < 1e-9)
})

test('each distance has gates every 25 m ending on the finish line, and the starts spread across the lanes', () => {
  const sprint = buildCourse(rules.track, 100)
  assert.deepEqual(sprint.gates.map((g) => Math.round(g.x * 10) / 10), [-506.8, -481.8, -456.8, -431.8])
  assert.ok(Math.abs(sprint.starts[0].x - (-531.805 - 0.3)) < 1e-6)
  assert.ok(sprint.starts[7].z > sprint.starts[0].z)
  assert.equal(sprint.startRy, EAST)
  assert.equal(buildCourse(rules.track, 400).gates.length, 16)
  const mile = buildCourse(rules.track, 1500)
  assert.equal(mile.gates.length, 60)
  assert.equal(mile.laps, 4)
  assert.deepEqual([mile.gates[0].lap, mile.gates[10].lap, mile.gates[12].lap, mile.gates[59].lap], [0, 0, 1, 3])
  assert.ok(Math.abs(mile.gates[59].x - finishX(rules.track)) < 1e-6)
})

test('the step quality rewards the good window and punishes rushing, dragging and the same foot twice', () => {
  const stride = rules.stride[100]
  const runner = race(100).runners[0]
  assert.equal(stepQuality(rules, stride, runner, 'left', T0), rules.firstStepQuality)
  runner.lastFoot = 'left'
  runner.lastStepAt = T0
  assert.equal(stepQuality(rules, stride, runner, 'right', T0 + 170), 1)
  assert.equal(stepQuality(rules, stride, runner, 'right', T0 + 210), 1)
  assert.equal(stepQuality(rules, stride, runner, 'right', T0 + 129), rules.tooFastQuality)
  assert.equal(stepQuality(rules, stride, runner, 'left', T0 + 170), rules.outOfStepQuality)
  assert.ok(Math.abs(stepQuality(rules, stride, runner, 'right', T0 + 295) - 0.5) < 1e-9)
  assert.equal(stepQuality(rules, stride, runner, 'right', T0 + 500), 0)
})

test('a perfect 100 m is timed by the socket from the beep, and a sloppy one is slower', () => {
  const r = race(100, 2)
  run(r, r.beepAt + 150, r.beepAt + 30_000, [{ accountId: 1, stepMs: 170 }, { accountId: 2, stepMs: 300 }])
  advanceRace(rules, r, r.beepAt + 40_000)
  const [good, sloppy] = r.runners
  assert.equal(good.state, 'finished')
  assert.ok(good.timeMs! > 11_000 && good.timeMs! < 12_500, `time ${good.timeMs}`)
  assert.equal(sloppy.state, 'finished')
  assert.ok(sloppy.timeMs! > good.timeMs! + 5000)
  assert.deepEqual(raceResults(r), [
    { accountId: 1, result: 'finished', place: 1, timeMs: good.timeMs },
    { accountId: 2, result: 'finished', place: 2, timeMs: sloppy.timeMs }
  ])
})

test('a step before the beep is a false start', () => {
  const r = race(100)
  applyStep(rules, r, r.runners[0], 'left', r.beepAt - 1)
  assert.equal(r.runners[0].state, 'dnf')
  assert.equal(r.runners[0].dnf, 'false_start')
  assert.equal(raceOver(r), true)
  assert.deepEqual(raceResults(r), [{ accountId: 1, result: 'dnf' }])
})

test('the beep lands between the earliest and latest delay of the rules', () => {
  const [lo, hi] = rules.startBeepDelayRangeMs
  assert.equal(createRace(rules, 100, [{ accountId: 1, sessionId: 's1' }], T0, () => 0).beepAt, T0 + lo)
  assert.equal(createRace(rules, 100, [{ accountId: 1, sessionId: 's1' }], T0, () => 1).beepAt, T0 + hi)
})

function aimAt(runner: Race['runners'][number], x: number, z: number): void {
  applyLook(runner, Math.atan2(-(x - runner.x), -(z - runner.z)))
}

function stride(r: Race, from: number, until: number, steer: (t: number) => boolean): number {
  const runner = r.runners[0]
  let i = 0
  let t = from
  for (; t <= until && runner.state !== 'finished' && runner.state !== 'dnf'; t += 10) {
    advanceRace(rules, r, t)
    if (steer(t)) break
    if ((t - from) % 200 === 0) applyStep(rules, r, runner, i++ % 2 ? 'right' : 'left', t)
  }
  return t
}

test('a runner who follows the gates goes on, and cutting across the infield misses a gate', () => {
  const r = race(400)
  const runner = r.runners[0]
  const gates = r.course.gates
  let t = stride(r, r.beepAt + 150, r.beepAt + 60_000, () => {
    if (runner.nextGate >= 10) return true
    aimAt(runner, gates[runner.nextGate].x, gates[runner.nextGate].z)
    return false
  })
  assert.equal(runner.state, 'running')
  assert.equal(runner.nextGate, 10)
  t = stride(r, t + 10, t + 30_000, () => {
    if (Math.abs(runner.z - gates[13].z) < 0.5) applyLook(runner, EAST)
    else aimAt(runner, -470, gates[13].z)
    return false
  })
  assert.equal(runner.state, 'dnf')
  assert.equal(runner.dnf, 'missed_gate')
})

test('a runner who stops is out of time when the race clock runs out', () => {
  const r = race(400)
  advanceRace(rules, r, r.endsAt)
  assert.equal(r.runners[0].dnf, 'time')
})

test('the runner stays inside the play area', () => {
  const r = race(100)
  const runner = r.runners[0]
  applyLook(runner, Math.PI)
  run(r, r.beepAt + 150, r.beepAt + 15_000, [{ accountId: 1, stepMs: 170 }])
  assert.equal(runner.z, rules.playArea.maxZ)
})
