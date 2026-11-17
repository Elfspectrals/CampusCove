import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advanceBout, parseBoxingRules, pressHand, setGuard, startBout } from './boxingBout.ts'
import { type RobotAction, BOXING_ROBOT, newRobotBrain, thinkBoxer } from './boxingRobot.ts'
import type { RobotLevel } from './robots.ts'
import { boxingRulesJson } from './boxingTestRules.ts'

const RULES = parseBoxingRules(boxingRulesJson())
const T0 = 1_000_000
const ROUND = T0 + RULES.introSec * 1000
const RING = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 }

function setup(level: RobotLevel, at = { x: 0, z: -1.1 }, foeAt = { x: 0, z: 0 }) {
  const bout = startBout(RULES, 1, 1, -1, T0)
  advanceBout(bout, ROUND)
  const [foe, self] = bout.boxers
  const brain = newRobotBrain(level, ROUND)
  const spot = { ...at }
  const think = (now: number, roll = 0.99): RobotAction[] => {
    const actions = thinkBoxer(brain, { bout, self, foe, at: spot, foeAt, ring: RING, now, random: () => roll })
    for (const a of actions) if (a.kind === 'move') Object.assign(spot, { x: a.x, z: a.z })
    return actions
  }
  return { bout, self, foe, brain, spot, think }
}

function kinds(actions: RobotAction[]): string[] {
  return actions.map((a) => (a.kind === 'press' || a.kind === 'release' ? `${a.kind}:${a.hand}` : a.kind === 'guard' ? `guard:${a.up}` : a.kind))
}

test('the robot walks up to its opponent at its own speed, faces them and never leaves the ring', () => {
  const { think, spot } = setup('normal', { x: 2.9, z: 2.9 }, { x: -2, z: -2 })
  const first = think(ROUND + 100)[0] as Extract<RobotAction, { kind: 'move' }>
  assert.ok(Math.abs(Math.hypot(first.x - 2.5, first.z - 2.5) - BOXING_ROBOT.normal.speedMps * 0.1) < 0.36)
  assert.ok(Math.abs(first.ry - Math.atan2(-(-2 - first.x), -(-2 - first.z))) < 1e-9)
  for (let t = 200; t <= 4000; t += 100) think(ROUND + t)
  const gap = Math.hypot(spot.x + 2, spot.z + 2)
  assert.ok(gap > 0.9 && gap < 1.6, `stands at punching range, got ${gap}`)
  assert.ok(Math.abs(spot.x) <= 2.5 && Math.abs(spot.z) <= 2.5)
})

test('in range it presses, lets go after a tap, and rests after its plan; an easy robot throws one punch at a time', () => {
  const { think, brain } = setup('easy')
  assert.deepEqual(kinds(think(ROUND + 100)), ['move', 'press:right'])
  assert.deepEqual(kinds(think(ROUND + 150)), ['move'])
  assert.deepEqual(kinds(think(ROUND + 200)), ['move', 'release:right'])
  assert.ok(brain.restUntil > ROUND + 200 + BOXING_ROBOT.easy.restMs * 0.7)
  assert.deepEqual(kinds(think(ROUND + 300)), ['move'])
})

test('a hard robot that sees a wind-up answers after its reaction time: a parry attempt, then a dodge if the punch has not come; an easy one that rolls high does nothing', () => {
  const hard = setup('hard')
  hard.brain.restUntil = ROUND + 60_000
  pressHand(hard.bout, hard.foe, 'left', ROUND + 100)
  hard.foe.charged.left = true
  assert.deepEqual(kinds(hard.think(ROUND + 400, 0.1)), ['move'])
  assert.deepEqual(kinds(hard.think(ROUND + 400 + BOXING_ROBOT.hard.reactMs, 0.1)), ['move', 'guard:true'])
  setGuard(hard.bout, hard.self, true, ROUND + 400 + BOXING_ROBOT.hard.reactMs)
  assert.deepEqual(kinds(hard.think(ROUND + 400 + BOXING_ROBOT.hard.reactMs + 240, 0.1)), ['move', 'guard:false', 'dodge'])
  const easy = setup('easy')
  easy.brain.restUntil = ROUND + 60_000
  easy.foe.charged.left = true
  for (let t = 100; t <= 2000; t += 100) assert.deepEqual(kinds(easy.think(ROUND + t, 0.99)), ['move'])
})

test('a guard held too long gets a hook: the button is held past the hold time, so the wind-up shows', () => {
  const { think, bout, foe } = setup('normal')
  setGuard(bout, foe, true, ROUND + 100)
  think(ROUND + 100)
  const late = ROUND + 100 + BOXING_ROBOT.normal.breakGuardAfterMs
  let pressedAt = 0
  for (let t = late; pressedAt === 0 && t < late + 3000; t += 100) if (kinds(think(t)).includes('press:left')) pressedAt = t
  assert.ok(pressedAt > 0, 'presses the left hand for a hook')
  assert.deepEqual(kinds(think(pressedAt + RULES.holdMs)), ['move'])
  assert.deepEqual(kinds(think(pressedAt + RULES.holdMs + 200)), ['move', 'release:left'])
})

test('with a counter open it throws a cross at once, even while resting', () => {
  const { think, self, brain } = setup('easy')
  brain.restUntil = ROUND + 60_000
  self.counterUntil = ROUND + 1000
  assert.deepEqual(kinds(think(ROUND + 100)), ['move', 'press:right'])
})

test('down, it presses to get up at its own pace; stunned, between rounds or with the opponent down, it does nothing', () => {
  const { think, self, foe, bout } = setup('normal')
  self.down = { since: ROUND + 100, presses: 0, lastPressAt: 0 }
  assert.deepEqual(kinds(think(ROUND + 200)), ['getup'])
  assert.deepEqual(kinds(think(ROUND + 300)), [])
  assert.deepEqual(kinds(think(ROUND + 200 + BOXING_ROBOT.normal.getUpPressMs)), ['getup'])
  self.down = null
  self.stunnedUntil = ROUND + 5000
  assert.deepEqual(kinds(think(ROUND + 1000)), [])
  self.stunnedUntil = 0
  foe.down = { since: ROUND + 1000, presses: 0, lastPressAt: 0 }
  assert.deepEqual(kinds(think(ROUND + 1100)), [])
  foe.down = null
  bout.phase = 'rest'
  assert.deepEqual(kinds(think(ROUND + 1200)), [])
})
