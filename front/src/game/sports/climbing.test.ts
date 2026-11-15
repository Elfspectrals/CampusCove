import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { boardRows, climbAnimation, climbBoardKey, climbSeconds, gripShare, holdPosition, isOnWall, nearestStart, parseClimbingSpec, ringStage, startSpot, type ClimbStatePayload } from './climbing.ts'

const spec = parseClimbingSpec(JSON.parse(readFileSync(new URL('../../../public/assets/sports/rules/climbing.json', import.meta.url), 'utf8')))
const line = (id: string) => spec.lines.find((l) => l.id === id)!

function state(over: Partial<ClimbStatePayload> = {}): ClimbStatePayload {
  return {
    sessionId: 's1', line: 'route_1', event: 'start', phase: 'climbing', next: 0, holds: 10, grip: 100, gripMax: 100,
    litAt: 1000, opensAt: 1700, closesAt: 2600, startedAt: null, serverNow: 1000, duel: false, ...over,
  }
}

test('the shipped rules give every line a colour and a name', () => {
  assert.equal(spec.lines.length, 12)
  assert.ok(spec.lines.every((l) => /^#[0-9a-f]{6}$/i.test(l.hex) && l.name.length > 0))
})

test('holds sit on their wall face: east lead wall to the climber right is north, boulders on the side walls', () => {
  const speed = line('speed_1')
  const first = holdPosition(spec, speed, 0)
  assert.ok(Math.abs(first.x - (-576.3 + 0.06)) < 1e-9)
  assert.ok(Math.abs(first.z - (-202.05 - speed.holds[0].u)) < 1e-9)
  assert.ok(Math.abs(first.y - (0.2 + speed.holds[0].y)) < 1e-9)
  const north = holdPosition(spec, line('boulder_1'), 0)
  assert.ok(Math.abs(north.z - (-212 + 0.06)) < 1e-9)
})

test('the nearest line start within 2.5 m is offered, none further away', () => {
  const spot = startSpot(spec, line('route_2'))
  assert.equal(nearestStart(spec, spot.x + 0.2, spot.z)?.id, 'route_2')
  assert.equal(nearestStart(spec, -560, -203.5), null)
})

test('the window ring closes from 3x to 1x between lit and open, then stays open until it closes', () => {
  assert.deepEqual(ringStage(state(), 999), { stage: 'waiting', scale: 0 })
  assert.deepEqual(ringStage(state(), 1000), { stage: 'closing', scale: 3 })
  assert.deepEqual(ringStage(state(), 1350), { stage: 'closing', scale: 2 })
  assert.deepEqual(ringStage(state(), 1700), { stage: 'open', scale: 1 })
  assert.deepEqual(ringStage(state(), 2600), { stage: 'open', scale: 1 })
  assert.equal(ringStage(state(), 2601).stage, 'late')
})

test('time and grip shown in the HUD', () => {
  assert.equal(climbSeconds(state(), 5000), 0)
  assert.equal(climbSeconds(state({ startedAt: 2000 }), 5000), 3)
  assert.equal(climbSeconds(state({ startedAt: 2000, timeMs: 4321 }), 9000), 4.321)
  assert.equal(gripShare(state({ grip: 65 })), 0.65)
  assert.equal(isOnWall(state({ phase: 'lowering' })), true)
  assert.equal(isOnWall(state({ phase: 'ended' })), false)
})

test('the board shows one core board per line (climb_<line>), in the wall order, with last week champion', () => {
  const rows = boardRows(spec, [
    { board: 'climb_route_4', entries: [{ name: 'Ana#0001', value: 15000 }], champion: null },
    { board: 'climb_route_1', entries: [], champion: { name: 'Cy#0003', value: 7000 } },
  ])
  assert.equal(rows.length, 12)
  assert.equal(climbBoardKey(line('boulder_6')), 'climb_boulder_6')
  assert.deepEqual(rows[0], { id: 'route_1', name: 'Fern Line', hex: line('route_1').hex, entries: [], champion: { name: 'Cy#0003', value: 7000 } })
  assert.deepEqual(rows.find((r) => r.id === 'route_4')!.entries, [{ name: 'Ana#0001', value: 15000 }])
  assert.deepEqual(rows.find((r) => r.id === 'boulder_1')!.entries, [])
})

test('remote climbers: reach with the hand on the side of the new hold, hang, lower, fall only off a boulder', () => {
  const route = line('route_1')
  const right = route.holds[1]!.u > route.holds[0]!.u ? 'reachR' : 'reachL'
  assert.deepEqual(climbAnimation(state({ event: 'hold', next: 2 }), route), { pose: 'hang', move: right })
  assert.deepEqual(climbAnimation(state({ event: 'miss', next: 2 }), route), { pose: 'hang', move: null })
  assert.deepEqual(climbAnimation(state({ event: 'top', phase: 'lowering', next: 10 }), route), { pose: 'lower', move: 'top' })
  assert.deepEqual(climbAnimation(state({ event: 'fall', phase: 'lowering' }), route), { pose: 'lower', move: null })
  assert.deepEqual(climbAnimation(state({ event: 'end', phase: 'ended', result: 'fell' }), line('boulder_1')), { pose: null, move: 'fall' })
  assert.deepEqual(climbAnimation(state({ event: 'end', phase: 'ended', result: 'fell' }), route), { pose: null, move: null })
})
