import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { type FigureRun, advanceFigure, figureOver, figurePlaces, figurePosition, laneRadius, newFigureRun, parseFigureRules, pressFigure, releaseFigure } from './figureSkating.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/figure_skating.json', import.meta.url), 'utf8'))
const rules = parseFigureRules(RAW)
const T0 = 2_000_000
const JUMP = rules.elements[0]
const SPIN = rules.elements[1]
const SPIRAL = rules.elements[2]

function run(count = 1): FigureRun {
  return newFigureRun(Array.from({ length: count }, (_, i) => ({ accountId: i + 1, sessionId: `s${i + 1}`, name: `P${i + 1}` })), T0)
}

function near(actual: number, expected: number, what: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is not ${expected}`)
}

test('the shipped routine: 90 bpm, 112 beats, twelve elements that never overlap, four lanes', () => {
  assert.equal(rules.lengthMs, 74_667)
  assert.equal(rules.route.lapMs, 21_333)
  assert.deepEqual(rules.elements.slice(0, 3), [{ kind: 'jump', atMs: 5333, lengthMs: 0 }, { kind: 'spin', atMs: 10_667, lengthMs: 2667 }, { kind: 'spiral', atMs: 17_333, lengthMs: 2667 }])
  assert.equal(rules.elements.length, 12)
  assert.deepEqual([0, 1, 2, 3].map((lane) => laneRadius(rules.route, lane)), [8, 10, 6, 12])
  assert.throws(() => parseFigureRules({ ...RAW, elements: [{ kind: 'jump', beat: 8 }, { kind: 'jump', beat: 9 }] }), /overlaps/)
  assert.throws(() => parseFigureRules({ ...RAW, elements: [{ kind: 'jump', beat: 112 }] }), /ends after/)
  assert.throws(() => parseFigureRules({ ...RAW, elements: [{ kind: 'twizzle', beat: 8 }] }), /kind/)
})

test('a skater follows the oval of their lane: east on the south straight, round the east bend, west on the north straight, round the west bend', () => {
  const { a, b, lapMs } = rules.route
  const lap = 2 * 28 + 2 * Math.PI * 8
  const at = (metres: number) => figurePosition(rules.route, 0, (metres / lap) * lapMs)
  const start = at(0)
  near(start.x, a.x, 'start x')
  near(start.z, a.z + 8, 'start z')
  near(start.ry, -Math.PI / 2, 'heading east')
  near(at(28).x, b.x, 'end of the south straight')
  const east = at(28 + (Math.PI * 8) / 2)
  near(east.x, b.x + 8, 'east end')
  near(east.z, b.z, 'east end z')
  const north = at(28 + Math.PI * 8 + 14)
  near(north.z, a.z - 8, 'north straight')
  near(north.ry, Math.PI / 2, 'heading west')
  near(at(lap).x, a.x, 'a full lap is back at the start')
  near(figurePosition(rules.route, 3, 0).z, a.z + 12, 'the outer lane is 4 m further out')
})

test('a jump is judged on the server clock: 90 ms perfect, 200 ms good, 120 ms of lag forgiven, never early', () => {
  const judged = (offset: number) => {
    const r = run()
    return pressFigure(r, r.skaters[0], 'jump', T0 + JUMP.atMs + offset, rules)
  }
  assert.equal(judged(-201), null)
  assert.deepEqual(judged(-200), { type: 'judge', index: 0, element: 'jump', judgement: 'good' })
  assert.deepEqual(judged(-90), { type: 'judge', index: 0, element: 'jump', judgement: 'perfect' })
  assert.deepEqual(judged(210), { type: 'judge', index: 0, element: 'jump', judgement: 'perfect' })
  assert.deepEqual(judged(320), { type: 'judge', index: 0, element: 'jump', judgement: 'good' })
  assert.equal(judged(321), null)
})

test('a perfect jump scores 300, each turn in the air 100 up to three, within 700 ms of the take-off', () => {
  const r = run()
  const s = r.skaters[0]
  const at = T0 + JUMP.atMs
  assert.equal(pressFigure(r, s, 'left', at - 500, rules), null)
  pressFigure(r, s, 'jump', at, rules)
  assert.equal(s.score, 300)
  assert.deepEqual(pressFigure(r, s, 'left', at + 100, rules), { type: 'rotation', rotations: 1 })
  assert.deepEqual(pressFigure(r, s, 'left', at + 200, rules), { type: 'rotation', rotations: 2 })
  assert.deepEqual(pressFigure(r, s, 'right', at + 700, rules), { type: 'rotation', rotations: 3 })
  assert.equal(pressFigure(r, s, 'left', at + 650, rules), null)
  assert.equal(s.score, 600)
  const late = run()
  pressFigure(late, late.skaters[0], 'jump', at, rules)
  assert.equal(pressFigure(late, late.skaters[0], 'left', at + 701, rules), null)
  assert.equal(pressFigure(late, late.skaters[0], 'jump', at + 100, rules), null)
})

test('a jump not taken is missed 320 ms after its time and the routine moves on', () => {
  const r = run()
  assert.deepEqual(advanceFigure(r, T0 + JUMP.atMs + 320, rules), [])
  assert.deepEqual(advanceFigure(r, T0 + JUMP.atMs + 321, rules), [{ skater: r.skaters[0], event: { type: 'judge', index: 0, element: 'jump', judgement: 'miss' } }])
  assert.equal(r.skaters[0].next, 1)
  assert.equal(r.skaters[0].score, 0)
})

test('a spin counts the left and right presses in turn, 25 each up to 16, and is judged when it ends: 12 perfect, 6 good', () => {
  const spun = (presses: number, alternate = true) => {
    const r = run()
    const s = r.skaters[0]
    s.next = 1
    for (let i = 0; i < presses; i++) pressFigure(r, s, alternate && i % 2 === 1 ? 'right' : 'left', T0 + SPIN.atMs + i * 100, rules)
    const events = advanceFigure(r, T0 + SPIN.atMs + SPIN.lengthMs, rules)
    return { score: s.score, judgement: events[0]?.event.type === 'judge' ? events[0].event.judgement : null, next: s.next }
  }
  assert.deepEqual(spun(12), { score: 300, judgement: 'perfect', next: 2 })
  assert.deepEqual(spun(11), { score: 275, judgement: 'good', next: 2 })
  assert.deepEqual(spun(6), { score: 150, judgement: 'good', next: 2 })
  assert.deepEqual(spun(5), { score: 125, judgement: 'miss', next: 2 })
  assert.deepEqual(spun(20), { score: 400, judgement: 'perfect', next: 2 })
  assert.deepEqual(spun(10, false), { score: 25, judgement: 'miss', next: 2 })
  const early = run()
  early.skaters[0].next = 1
  assert.equal(pressFigure(early, early.skaters[0], 'left', T0 + SPIN.atMs - 201, rules), null)
  assert.deepEqual(pressFigure(early, early.skaters[0], 'left', T0 + SPIN.atMs - 200, rules), { type: 'spin_press', presses: 1 })
  assert.deepEqual(advanceFigure(early, T0 + SPIN.atMs + SPIN.lengthMs - 1, rules), [])
})

test('a spiral is held from its start to its end: both on time is perfect, a late start or an early release is good, never held is missed', () => {
  const start = T0 + SPIRAL.atMs
  const end = start + SPIRAL.lengthMs
  const held = (pressAt: number | null, releaseAt: number | null) => {
    const r = run()
    const s = r.skaters[0]
    s.next = 2
    const started = pressAt === null ? null : pressFigure(r, s, 'hold', pressAt, rules)
    const released = releaseAt === null ? null : releaseFigure(r, s, releaseAt, rules)
    return { started, released, score: s.score, s, r }
  }
  const clean = held(start, end)
  assert.deepEqual(clean.started, { type: 'hold', index: 2, judgement: 'perfect' })
  assert.deepEqual(clean.released, { type: 'judge', index: 2, element: 'spiral', judgement: 'perfect' })
  assert.equal(clean.score, 400)
  assert.equal(clean.s.next, 3)
  assert.deepEqual([held(start - 150, end).score, held(start - 150, end).released?.type === 'judge' && held(start - 150, end).released], [300, { type: 'judge', index: 2, element: 'spiral', judgement: 'good' }])
  assert.equal(held(start, end - 90).score, 400)
  assert.equal(held(start, end - 200).score, 300)
  assert.equal(held(start, end - 201).score, 200)
  assert.equal(held(start, end + 210).score, 400)
  assert.equal(held(start - 201, null).started, null)
  const kept = held(start, null)
  assert.deepEqual(advanceFigure(kept.r, end + 320, rules), [])
  assert.deepEqual(advanceFigure(kept.r, end + 321, rules).map((e) => e.event), [{ type: 'judge', index: 2, element: 'spiral', judgement: 'good' }])
  assert.equal(kept.s.score, 200)
  const never = held(null, null)
  assert.deepEqual(advanceFigure(never.r, start + 321, rules).map((e) => e.event), [{ type: 'judge', index: 2, element: 'spiral', judgement: 'miss' }])
  assert.equal(releaseFigure(never.r, never.s, end, rules), null)
})

test('the wrong key for the element, a press before the music or after its end, and a skater who left change nothing', () => {
  const r = run()
  const s = r.skaters[0]
  assert.equal(pressFigure(r, s, 'hold', T0 + JUMP.atMs, rules), null)
  assert.equal(pressFigure(r, s, 'jump', T0 - 1, rules), null)
  assert.equal(pressFigure(r, s, 'jump', T0 + rules.lengthMs, rules), null)
  s.out = true
  assert.equal(pressFigure(r, s, 'jump', T0 + JUMP.atMs, rules), null)
  assert.deepEqual(advanceFigure(r, T0 + 60_000, rules), [])
  assert.deepEqual([s.next, s.score], [0, 0])
})

test('the routine is over at the end of the music or when everyone left; places follow the score and ties share a place', () => {
  const r = run(3)
  assert.equal(figureOver(r, T0 + rules.lengthMs - 1, rules), false)
  assert.equal(figureOver(r, T0 + rules.lengthMs, rules), true)
  r.skaters[0].score = 900
  r.skaters[1].score = 900
  r.skaters[2].score = 400
  assert.deepEqual([...figurePlaces(r)], [[1, 1], [2, 1], [3, 3]])
  r.skaters[2].out = true
  assert.deepEqual([...figurePlaces(r)], [[1, 1], [2, 1]])
  for (const s of r.skaters) s.out = true
  assert.equal(figureOver(r, T0 + 1000, rules), true)
})
