import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PROMPT_LEAD_MS, figureKeyFor, figurePose, figurePosition, figurePrompt, parseFigureRules } from './figure.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../../public/assets/sports/rules/figure_skating.json', import.meta.url), 'utf8'))
const rules = parseFigureRules(RAW)

function near(actual: number, expected: number, what: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is not ${expected}`)
}

test('the front reads the same routine as the socket: 74.667 s, 21.333 s a lap, twelve elements', () => {
  assert.equal(rules.venue, 'rink_figure')
  assert.equal(rules.lengthMs, 74_667)
  assert.equal(rules.route.lapMs, 21_333)
  assert.deepEqual(rules.elements.slice(0, 3), [{ kind: 'jump', atMs: 5333, lengthMs: 0 }, { kind: 'spin', atMs: 10_667, lengthMs: 2667 }, { kind: 'spiral', atMs: 17_333, lengthMs: 2667 }])
  assert.equal(rules.elements.length, 12)
  assert.deepEqual([rules.airMs, rules.spinPresses], [700, 16])
  assert.throws(() => parseFigureRules({ ...RAW, status: 'placeholder' }), /not ready/)
})

test('the skater is drawn where the socket puts them: start of the south straight heading east, the outer lanes further out', () => {
  const { a, b, lapMs } = rules.route
  const lap = 2 * 28 + 2 * Math.PI * 8
  const start = figurePosition(rules.route, 0, 0)
  near(start.x, a.x, 'start x')
  near(start.z, a.z + 8, 'start z')
  near(start.ry, -Math.PI / 2, 'heading east')
  const east = figurePosition(rules.route, 0, ((28 + (Math.PI * 8) / 2) / lap) * lapMs)
  near(east.x, b.x + 8, 'east end')
  near(figurePosition(rules.route, 3, 0).z, a.z + 12, 'fourth lane')
  near(figurePosition(rules.route, 0, lapMs).x, a.x, 'one lap later')
})

test('a jump lifts the skater 0.6 m at mid-air and turns once more per extra turn; a spin turns 2.2 times a second while it lasts', () => {
  const jump = figurePose(rules, { air: { at: 1000, rotations: 2 }, spinning: false, next: 1 }, 1350)!
  near(jump.lift, 0.6, 'apex')
  near(jump.spin, 3 * Math.PI, 'half of three turns')
  assert.equal(figurePose(rules, { air: { at: 1000, rotations: 0 }, spinning: false, next: 1 }, 1701), null)
  const spin = figurePose(rules, { air: null, spinning: true, next: 1 }, 10_667 + 1000)!
  near(spin.spin, 2 * Math.PI * 2.2, 'one second of spin')
  assert.equal(spin.lift, 0)
  assert.equal(figurePose(rules, { air: null, spinning: false, next: 1 }, 10_667 + 1000), null)
  assert.equal(figurePose(rules, { air: null, spinning: true, next: 2 }, 10_667 + 1000), null)
})

test('the next element is announced 2.5 s ahead and fills until its time, then for as long as it lasts', () => {
  assert.equal(figurePrompt(rules, 0, 5333 - PROMPT_LEAD_MS - 1), null)
  assert.deepEqual(figurePrompt(rules, 0, 5333 - PROMPT_LEAD_MS), { index: 0, kind: 'jump', phase: 'coming', fill: 0 })
  near(figurePrompt(rules, 0, 5333 - 1250)!.fill, 0.5, 'half way')
  assert.deepEqual(figurePrompt(rules, 0, 5400), { index: 0, kind: 'jump', phase: 'now', fill: 1 })
  const spin = figurePrompt(rules, 1, 10_667 + 1333.5)!
  assert.equal(spin.phase, 'now')
  near(spin.fill, 0.5, 'half of the spin')
  assert.equal(figurePrompt(rules, 12, 70_000), null)
})

test('jump is the jump key, the turns are left and right, the spiral is held on forward', () => {
  const bound = (action: string, code: string) => ({ jump: 'Space', moveLeft: 'KeyA', moveRight: 'KeyD', moveForward: 'KeyW' })[action] === code
  assert.deepEqual(['Space', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyW', 'ArrowUp', 'KeyS'].map((code) => figureKeyFor(code, bound)), ['jump', 'left', 'left', 'right', 'right', 'hold', 'hold', null])
})
