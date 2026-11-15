import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type Bout,
  type PunchReach,
  advanceBout,
  dodge,
  forfeitBout,
  getUpPress,
  parseBoxingRules,
  punch,
  punchCooldownMs,
  setGuard,
  startBout
} from './boxingBout.ts'
import { boxingRulesJson } from './boxingTestRules.ts'

const RULES = parseBoxingRules(boxingRulesJson())
const T0 = 1_000_000
const ROUND_START = T0 + RULES.introSec * 1000
const CLOSE: PunchReach = { distM: 1.0, facingCos: 1, heightM: 0 }

function fighting(rounds = 3): Bout {
  const bout = startBout(RULES, rounds, 1, 2, T0)
  advanceBout(bout, ROUND_START)
  return bout
}

function knockDownBlue(bout: Bout, at: number): number {
  const [red, blue] = bout.boxers
  blue.health = RULES.punches.jab.damage
  red.nextPunchAt = 0
  red.endurance = RULES.endurance
  assert.equal(punch(bout, red, 'jab', CLOSE, at), 'landed')
  return at
}

function getUp(bout: Bout, from: number): number {
  let at = from
  for (let i = 0; i < RULES.knockdown.getUpPresses && bout.boxers[1].down; i++) {
    at += RULES.knockdown.pressGapMs
    getUpPress(bout, bout.boxers[1], at)
  }
  return at
}

test('the shipped rules are ready and parse once the ring is placed', () => {
  assert.equal(RULES.punches.jab.damage, 5)
  assert.deepEqual(RULES.roundsChoices, [1, 3, 5])
  assert.equal(RULES.gear, 'gear_boxing_gloves')
  assert.throws(() => parseBoxingRules({ ...boxingRulesJson(), status: 'placeholder' }), /not ready/)
  assert.throws(() => parseBoxingRules({ ...boxingRulesJson(), health: null }), /health/)
  assert.throws(() => parseBoxingRules({ ...boxingRulesJson(), corners: null }), /corners/)
})

test('a bout opens with the intro, then round 1 starts exactly at the end of the intro', () => {
  const bout = startBout(RULES, 3, 1, 2, T0)
  assert.throws(() => startBout(RULES, 2, 1, 2, T0), /not offered/)
  assert.throws(() => startBout(RULES, 3, 1, 1, T0), /themself/)
  advanceBout(bout, ROUND_START - 1)
  assert.equal(bout.phase, 'intro')
  assert.equal(punch(bout, bout.boxers[0], 'jab', CLOSE, ROUND_START - 1), 'not_fighting')
  advanceBout(bout, ROUND_START)
  assert.equal(bout.phase, 'round')
  assert.equal(bout.phaseEndsAt, ROUND_START + RULES.roundSec * 1000)
})

test('a jab in reach lands, scores 1 and waits its cooldown; out of reach it misses but still costs', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  assert.equal(punch(bout, red, 'jab', CLOSE, ROUND_START), 'landed')
  assert.deepEqual([blue.health, red.points, red.endurance], [RULES.health - 5, 1, RULES.endurance - 6])
  assert.equal(punch(bout, red, 'jab', CLOSE, ROUND_START + 449), 'cooldown')
  assert.equal(punch(bout, red, 'jab', { ...CLOSE, distM: 1.71 }, ROUND_START + 450), 'missed')
  assert.equal(red.endurance, RULES.endurance - 12)
  assert.equal(punch(bout, red, 'cross', { ...CLOSE, facingCos: 0.29 }, ROUND_START + 900), 'missed')
  assert.equal(punch(bout, red, 'hook', { ...CLOSE, heightM: 1.01 }, ROUND_START + 1800), 'missed')
  assert.equal(blue.health, RULES.health - 5)
})

test('the guard blocks most of a punch and scores nothing, drains endurance and drops at 0', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  assert.equal(setGuard(bout, blue, true), true)
  assert.equal(punch(bout, blue, 'jab', CLOSE, ROUND_START), 'guarding')
  assert.equal(punch(bout, red, 'hook', CLOSE, ROUND_START), 'blocked')
  assert.deepEqual([blue.health, red.points], [RULES.health - Math.round(14 * 0.2), 0])
  advanceBout(bout, ROUND_START + 1000)
  assert.equal(blue.endurance, RULES.endurance - RULES.guard.drainPerSec)
  advanceBout(bout, ROUND_START + 1000 + (RULES.endurance / RULES.guard.drainPerSec) * 1000)
  assert.deepEqual([blue.endurance, blue.guard], [0, false])
  assert.equal(setGuard(bout, blue, true), false)
})

test('a dodge lets a punch through only once its window is over, and waits its own cooldown', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  assert.equal(dodge(bout, blue, ROUND_START), true)
  assert.equal(dodge(bout, blue, ROUND_START + RULES.dodge.cooldownMs - 1), false)
  assert.equal(punch(bout, red, 'jab', CLOSE, ROUND_START + RULES.dodge.windowMs - 1), 'dodged')
  assert.equal(punch(bout, red, 'jab', CLOSE, ROUND_START + RULES.dodge.windowMs + 450), 'landed')
})

test('punches refuse when endurance is short and slow down under the low mark', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  red.endurance = RULES.punches.hook.enduranceCost - 1
  assert.equal(punch(bout, red, 'hook', CLOSE, ROUND_START), 'tired')
  assert.equal(punchCooldownMs(RULES, red, 'jab'), Math.round(450 * RULES.lowEnduranceSlowdown))
  red.endurance = RULES.lowEndurance
  assert.equal(punchCooldownMs(RULES, red, 'jab'), 450)
})

test('health at 0 knocks down; the boxer gets up with presses spaced by the gap, and the round clock waits', () => {
  const bout = fighting()
  const blue = bout.boxers[1]
  const downAt = knockDownBlue(bout, ROUND_START + 10_000)
  assert.deepEqual([blue.knockdowns, blue.health, blue.down?.since], [1, 0, downAt])
  assert.equal(punch(bout, bout.boxers[0], 'jab', CLOSE, downAt + 500), 'not_fighting')
  getUpPress(bout, blue, downAt + 100)
  assert.equal(getUpPress(bout, blue, downAt + 100 + RULES.knockdown.pressGapMs - 1), false)
  assert.equal(blue.down?.presses, 1)
  const upAt = getUp(bout, downAt + 100)
  assert.equal(blue.down, null)
  assert.equal(blue.health, RULES.knockdown.getUpHealth)
  assert.equal(bout.phaseEndsAt, ROUND_START + RULES.roundSec * 1000 + (upAt - downAt))
})

test('a second knockdown in the same round cannot be got up from: the count reaches 10 and it is a KO', () => {
  const bout = fighting()
  const blue = bout.boxers[1]
  const upAt = getUp(bout, knockDownBlue(bout, ROUND_START + 1000))
  const downAt = knockDownBlue(bout, upAt + 1000)
  assert.equal(getUp(bout, downAt) > downAt && blue.down !== null, true)
  advanceBout(bout, downAt + RULES.knockdown.countSec * 1000 - 1)
  assert.equal(bout.phase, 'round')
  advanceBout(bout, downAt + RULES.knockdown.countSec * 1000)
  assert.deepEqual(bout.result, { winner: 1, method: 'ko' })
})

test('the third knockdown of the fight is a KO at once', () => {
  const bout = fighting(5)
  const blue = bout.boxers[1]
  blue.knockdowns = RULES.knockdown.maxPerFight - 1
  knockDownBlue(bout, ROUND_START + 1000)
  assert.deepEqual([bout.phase, bout.result], ['over', { winner: 1, method: 'ko' }])
})

test('between rounds the boxers rest; after the last round the points decide, equal points are a draw', () => {
  const bout = fighting(3)
  const [red, blue] = bout.boxers
  red.endurance = 10
  blue.health = 30
  const roundEnd = ROUND_START + RULES.roundSec * 1000
  advanceBout(bout, roundEnd)
  assert.deepEqual([bout.phase, red.endurance, blue.health], ['rest', RULES.endurance, 30 + RULES.restHealth])
  advanceBout(bout, roundEnd + RULES.restSec * 1000)
  assert.deepEqual([bout.phase, bout.round], ['round', 2])

  const single = fighting(1)
  single.boxers[1].points = 4
  advanceBout(single, ROUND_START + RULES.roundSec * 1000)
  assert.deepEqual(single.result, { winner: 2, method: 'points' })

  const even = fighting(1)
  advanceBout(even, ROUND_START + RULES.roundSec * 1000)
  assert.deepEqual(even.result, { winner: null, method: 'draw' })
})

test('a forfeit hands the bout to the other boxer and does not overwrite a result', () => {
  const bout = fighting()
  forfeitBout(bout, 2)
  assert.deepEqual(bout.result, { winner: 1, method: 'forfeit' })
  forfeitBout(bout, 1)
  assert.deepEqual(bout.result, { winner: 1, method: 'forfeit' })
})
