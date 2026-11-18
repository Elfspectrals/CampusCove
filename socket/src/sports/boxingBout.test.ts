import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  type Bout,
  type PunchReach,
  type PunchKind,
  advanceBout,
  dodge,
  forfeitBout,
  getUpPress,
  comboOf,
  continuesString,
  earliestThrowAt,
  newCharges,
  parseBoxingRules,
  pressHand,
  punch,
  punchCooldownMs,
  releaseHand,
  setGuard,
  startBout,
  takeQueued,
  weariness
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
  assert.equal(punch(bout, red, 'hook', CLOSE, ROUND_START + 449), 'cooldown')
  assert.equal(punch(bout, red, 'jab', { ...CLOSE, distM: 1.71 }, ROUND_START + 450), 'missed')
  assert.equal(red.endurance, RULES.endurance - 12)
  assert.equal(punch(bout, red, 'cross', { ...CLOSE, facingCos: 0.29 }, ROUND_START + 900), 'missed')
  assert.equal(punch(bout, red, 'hook', { ...CLOSE, heightM: 1.01 }, ROUND_START + 1800), 'missed')
  assert.equal(blue.health, RULES.health - 5)
})

test('the guard blocks most of a punch and scores nothing, drains endurance and drops at 0', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  assert.equal(setGuard(bout, blue, true, ROUND_START), true)
  assert.equal(punch(bout, blue, 'jab', CLOSE, ROUND_START), 'guarding')
  assert.equal(punch(bout, red, 'cross', CLOSE, ROUND_START + RULES.parry.windowMs + 1), 'blocked')
  assert.deepEqual([blue.health, red.points], [RULES.health - Math.round(9 * 0.2), 0])
  advanceBout(bout, ROUND_START + 1000)
  assert.equal(blue.endurance, RULES.endurance - RULES.guard.drainPerSec)
  advanceBout(bout, ROUND_START + 1000 + (RULES.endurance / RULES.guard.drainPerSec) * 1000)
  assert.deepEqual([blue.endurance, blue.guard], [0, false])
  assert.equal(setGuard(bout, blue, true, bout.updatedAt), false)
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

function chainOf(bout: Bout, kinds: PunchKind[], from: number, when: 'cancel' | 'cooldown' = 'cancel'): number {
  const red = bout.boxers[0]
  let at = from
  for (const kind of kinds) {
    at = Math.max(at, when === 'cancel' && red.chain.length > 0 ? red.cancelAt : red.nextPunchAt)
    punch(bout, red, kind, CLOSE, at)
  }
  return at
}

test('a tap is a jab or a cross, a hold from 250 ms a hook or an uppercut, a new press restarts the timer, and a press is only taken in a round', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  assert.equal(pressHand(bout, red, 'left', ROUND_START - 500), true)
  assert.equal(pressHand(bout, red, 'left', ROUND_START), true)
  assert.deepEqual(releaseHand(bout, red, 'left', ROUND_START + RULES.holdMs - 1), { kind: 'jab', heldMs: RULES.holdMs - 1, timing: 'now' })
  assert.equal(releaseHand(bout, red, 'left', ROUND_START + 400), null)
  pressHand(bout, red, 'right', ROUND_START)
  assert.deepEqual(releaseHand(bout, red, 'right', ROUND_START + RULES.holdMs), { kind: 'uppercut', heldMs: RULES.holdMs, timing: 'now' })
  pressHand(bout, red, 'left', ROUND_START)
  assert.equal(releaseHand(bout, red, 'left', ROUND_START + 5000)?.kind, 'hook')
  pressHand(bout, red, 'right', ROUND_START)
  assert.equal(releaseHand(bout, red, 'right', ROUND_START + 10)?.kind, 'cross')
  const intro = startBout(RULES, 3, 1, 2, T0)
  assert.equal(pressHand(intro, intro.boxers[0], 'left', T0), false)
})

test('the wind-up is announced once per press, when it passes the hold time', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  pressHand(bout, red, 'left', ROUND_START)
  assert.deepEqual(newCharges(bout, ROUND_START + RULES.holdMs - 1), [])
  assert.deepEqual(newCharges(bout, ROUND_START + RULES.holdMs), [{ boxer: red, hand: 'left' }])
  assert.deepEqual(newCharges(bout, ROUND_START + RULES.holdMs + 100), [])
})

test('a punch that continues no string is buffered in the last 120 ms of its cooldown; earlier it is too early, refused and drops the chain', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  const end = red.nextPunchAt
  pressHand(bout, red, 'left', end - RULES.bufferMs - RULES.holdMs - 1)
  assert.equal(releaseHand(bout, red, 'left', end - RULES.bufferMs - 1)?.timing, 'early')
  assert.deepEqual([red.chain, red.queued], [[], null])
  pressHand(bout, red, 'left', end - RULES.bufferMs - RULES.holdMs)
  assert.equal(releaseHand(bout, red, 'left', end - RULES.bufferMs)?.timing, 'queued')
  assert.equal(takeQueued(red, end - 1), null)
  assert.deepEqual(takeQueued(red, end), { kind: 'hook', at: end, heldMs: RULES.holdMs })
  assert.equal(takeQueued(red, end + 100), null)
})

test('the next punch of a string can cancel the current one from its cancel time, and is buffered 120 ms before it', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  const cancelAt = ROUND_START + RULES.punches.jab.cancelMs
  assert.equal(red.cancelAt, cancelAt)
  assert.equal(earliestThrowAt(RULES, red, 'cross', cancelAt, 0), cancelAt)
  assert.equal(earliestThrowAt(RULES, red, 'hook', cancelAt, Infinity), red.nextPunchAt)
  pressHand(bout, red, 'right', cancelAt - RULES.bufferMs - 1 - 50)
  assert.equal(releaseHand(bout, red, 'right', cancelAt - RULES.bufferMs - 1)?.timing, 'early')
  assert.deepEqual(red.chain, [])
  punch(bout, red, 'jab', CLOSE, red.nextPunchAt + RULES.flurry.restMs + 1)
  const again = red.cancelAt
  pressHand(bout, red, 'right', again - RULES.bufferMs - 50)
  assert.equal(releaseHand(bout, red, 'right', again - RULES.bufferMs)?.timing, 'queued')
  const queued = takeQueued(red, again)
  assert.deepEqual(queued, { kind: 'cross', at: again, heldMs: 50 })
  assert.equal(punch(bout, red, 'cross', CLOSE, again + 90, { at: again, heldMs: 50 }), 'landed')
  assert.deepEqual([red.cancelled, red.combo, red.nextPunchAt], [true, 'one_two', again + RULES.punches.cross.cooldownMs])
})

test('a string is read from its start: jab, jab cancels but a third jab waits its cooldown, so mashing one button gains nothing', () => {
  assert.equal(continuesString(RULES.combo.list, ['jab'], 'jab'), true)
  assert.equal(continuesString(RULES.combo.list, ['jab', 'jab'], 'jab'), false)
  assert.equal(continuesString(RULES.combo.list, ['jab', 'cross', 'hook'], 'uppercut'), true)
  assert.equal(continuesString(RULES.combo.list, [], 'jab'), false)
  const bout = fighting()
  const red = bout.boxers[0]
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  assert.equal(punch(bout, red, 'jab', CLOSE, red.cancelAt), 'landed')
  assert.equal(red.cancelled, true)
  assert.equal(punch(bout, red, 'jab', CLOSE, red.cancelAt), 'cooldown')
  assert.equal(punch(bout, red, 'jab', CLOSE, red.nextPunchAt), 'landed')
  assert.deepEqual([red.chain, red.cancelled], [['jab'], false])
})

test('combos match the whole string from its start', () => {
  const list = RULES.combo.list
  assert.equal(comboOf(list, ['jab', 'cross'])?.id, 'one_two')
  assert.equal(comboOf(list, ['jab', 'jab', 'cross'])?.id, 'double_jab')
  assert.equal(comboOf(list, ['jab', 'cross', 'hook'])?.id, 'one_two_hook')
  assert.equal(comboOf(list, ['jab', 'cross', 'hook', 'uppercut'])?.id, 'full_combo')
  assert.equal(comboOf(list, ['cross', 'jab', 'cross']), null)
  assert.equal(comboOf(list, ['jab']), null)
})

test('a full combo cancelled on time adds each bonus to its last punch, every cancelled hit at 0.8', () => {
  const bout = fighting(5)
  const [red, blue] = bout.boxers
  const end = chainOf(bout, ['jab', 'cross', 'hook', 'uppercut'], ROUND_START)
  assert.equal(red.combo, 'full_combo')
  assert.equal(end, ROUND_START + 250 + 450 + 600)
  assert.equal(RULES.health - blue.health, 5 + Math.round((9 + 3) * 0.8) + Math.round((17 + 6) * 0.8) + Math.round((21 + 10) * 0.8))
  assert.equal(red.points, 1 + (2 + 1) + (3 + 2) + (3 + 4))
})

test('a string punch thrown after the link window (cancel time + 250 ms) starts a new chain with no bonus', () => {
  const bout = fighting(5)
  const red = bout.boxers[0]
  chainOf(bout, ['jab', 'cross', 'hook', 'uppercut'], ROUND_START, 'cooldown')
  assert.deepEqual([red.chain, red.combo], [['uppercut'], null])
  const fresh = fighting()
  const r = fresh.boxers[0]
  punch(fresh, r, 'jab', CLOSE, ROUND_START)
  punch(fresh, r, 'cross', CLOSE, r.cancelAt + RULES.combo.windowMs + 1)
  assert.deepEqual([r.chain, r.combo], [['cross'], null])
  punch(fresh, r, 'jab', CLOSE, r.nextPunchAt + 600)
  punch(fresh, r, 'cross', CLOSE, r.cancelAt + RULES.combo.windowMs)
  assert.equal(r.combo, 'one_two')
})

test('a hook or an uppercut thrown as a cancel needs its wind-up shown 100 ms; a quicker one waits its cooldown', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  chainOf(bout, ['jab', 'cross'], ROUND_START)
  const cancelAt = red.cancelAt
  assert.equal(punch(bout, red, 'hook', CLOSE, cancelAt, { heldMs: RULES.holdMs }), 'cooldown')
  assert.equal(earliestThrowAt(RULES, red, 'hook', cancelAt, RULES.holdMs), red.nextPunchAt)
  assert.equal(punch(bout, red, 'hook', CLOSE, cancelAt, { heldMs: RULES.holdMs + RULES.cancel.heavyChargeMs }), 'landed')
  assert.equal(red.combo, 'one_two_hook')
})

test('a guard broken by a combo ends the string, so no punch is free on the staggered boxer', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  chainOf(bout, ['jab', 'cross'], ROUND_START)
  setGuard(bout, blue, true, red.cancelAt - 1000)
  assert.equal(punch(bout, red, 'hook', CLOSE, red.cancelAt), 'guard_broken')
  assert.deepEqual(red.chain, [])
  assert.equal(earliestThrowAt(RULES, red, 'uppercut', red.cancelAt, Infinity), red.nextPunchAt)
})

test('mid-combo, raising the guard, dodging or taking a landed punch drops the string and the buffered punch', () => {
  for (const interrupt of ['guard', 'dodge', 'hit'] as const) {
    const bout = fighting()
    const [red, blue] = bout.boxers
    punch(bout, red, 'jab', CLOSE, ROUND_START)
    pressHand(bout, red, 'right', red.cancelAt - 60)
    assert.equal(releaseHand(bout, red, 'right', red.cancelAt - 50)?.timing, 'queued')
    if (interrupt === 'guard') setGuard(bout, red, true, red.cancelAt - 40)
    if (interrupt === 'dodge') assert.equal(dodge(bout, red, red.cancelAt - 40), true)
    if (interrupt === 'hit') assert.equal(punch(bout, blue, 'jab', CLOSE, red.cancelAt - 40), 'landed')
    assert.deepEqual([interrupt, red.chain, red.queued], [interrupt, [], null])
  }
})

test('moving or turning mid-combo is allowed: the cancelled punch is judged on where the boxers are when it is thrown', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  assert.equal(punch(bout, red, 'cross', { ...CLOSE, facingCos: 0.1 }, red.cancelAt), 'missed')
  assert.deepEqual(red.chain, [])
})

test('a punch released too early counts in the flurry row', () => {
  const bout = fighting()
  const red = bout.boxers[0]
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  pressHand(bout, red, 'right', ROUND_START + 10)
  assert.equal(releaseHand(bout, red, 'right', ROUND_START + 20)?.timing, 'early')
  assert.equal(red.row, 2)
})

test('a miss or a landed punch taken clears the chain; a blocked combo adds its bonus through the guard', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  punch(bout, red, 'cross', { ...CLOSE, distM: 3 }, red.nextPunchAt)
  assert.deepEqual(red.chain, [])
  punch(bout, red, 'jab', CLOSE, red.nextPunchAt)
  punch(bout, blue, 'jab', CLOSE, ROUND_START + 2000)
  assert.deepEqual(red.chain, [])
  punch(bout, red, 'jab', CLOSE, red.nextPunchAt)
  setGuard(bout, blue, true, red.nextPunchAt - RULES.parry.windowMs - 1)
  const before = blue.health
  punch(bout, red, 'cross', CLOSE, red.nextPunchAt)
  assert.deepEqual([red.combo, before - blue.health], ['one_two', Math.round((9 + 3) * RULES.guard.damageFactor)])
})

test('punches in a row tire the arms: the first four are whole, each one after costs half more and hits a fifth less, down to 40 %, until 800 ms of rest', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  const thrown: [cost: number, damage: number][] = []
  for (let i = 0; i < 8; i++) {
    const before = [red.endurance, blue.health]
    assert.equal(punch(bout, red, 'jab', CLOSE, red.nextPunchAt || ROUND_START), 'landed')
    thrown.push([before[0] - red.endurance, before[1] - blue.health])
  }
  assert.deepEqual(thrown, [[6, 5], [6, 5], [6, 5], [6, 5], [9, 4], [12, 3], [15, 2], [18, 2]])
  assert.equal(weariness(RULES, red, red.nextPunchAt + RULES.flurry.restMs), 5)
  assert.equal(weariness(RULES, red, red.nextPunchAt + RULES.flurry.restMs + 1), 0)
  red.endurance = RULES.endurance
  const before = blue.health
  assert.equal(punch(bout, red, 'jab', CLOSE, red.nextPunchAt + RULES.flurry.restMs + 1), 'landed')
  assert.deepEqual([RULES.endurance - red.endurance, before - blue.health], [6, 5])
})

test('a guard raised 250 ms or less before the punch is a parry: no damage, the attacker is stunned 900 ms and the next punch of the defender within 1.2 s is a counter at double damage and 2 more points', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  const T = ROUND_START + 1000
  setGuard(bout, blue, true, T)
  assert.equal(punch(bout, red, 'uppercut', CLOSE, T + RULES.parry.windowMs), 'parried')
  assert.deepEqual([blue.health, red.points, blue.guard], [RULES.health, 0, true])
  const hit = T + RULES.parry.windowMs
  assert.equal(punch(bout, red, 'jab', CLOSE, hit + 2000 - 1101), 'stunned')
  assert.equal(setGuard(bout, red, true, hit + 899), false)
  assert.equal(dodge(bout, red, hit + 899), false)
  assert.equal(pressHand(bout, red, 'left', hit + 899), false)
  setGuard(bout, blue, false, hit + 50)
  assert.equal(punch(bout, blue, 'cross', CLOSE, hit + 100), 'landed')
  assert.deepEqual([RULES.health - red.health, blue.points, blue.countered], [18, 4, true])
  assert.equal(punch(bout, blue, 'cross', CLOSE, blue.nextPunchAt), 'landed')
  assert.deepEqual([RULES.health - red.health, blue.points, blue.countered], [27, 6, false])
  assert.equal(setGuard(bout, red, true, hit + 900), true)
})

test('a guard held longer than 250 ms only blocks, and a guard raised again less than 600 ms after it dropped cannot parry', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  const T = ROUND_START + 1000
  setGuard(bout, blue, true, T)
  assert.equal(punch(bout, red, 'jab', CLOSE, T + RULES.parry.windowMs + 1), 'blocked')
  setGuard(bout, blue, false, T + 400)
  setGuard(bout, blue, true, T + 400 + RULES.parry.rearmMs - 1)
  assert.equal(punch(bout, red, 'jab', CLOSE, T + 1000), 'blocked')
  setGuard(bout, blue, false, T + 2000)
  setGuard(bout, blue, true, T + 2000 + RULES.parry.rearmMs)
  assert.equal(punch(bout, red, 'jab', CLOSE, T + 2000 + RULES.parry.rearmMs + 10), 'parried')
})

test('a hook or an uppercut on a held guard breaks it: half damage, the guard drops and the defender is staggered 700 ms without guard, dodge or punch', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  const T = ROUND_START + 1000
  setGuard(bout, blue, true, T)
  assert.equal(punch(bout, red, 'hook', CLOSE, T + 300), 'guard_broken')
  assert.deepEqual([RULES.health - blue.health, red.points, blue.guard], [Math.round(17 * 0.5), 0, false])
  assert.equal(setGuard(bout, blue, true, T + 999), false)
  assert.equal(dodge(bout, blue, T + 999), false)
  assert.equal(punch(bout, blue, 'jab', CLOSE, T + 999), 'stunned')
  assert.equal(setGuard(bout, blue, true, T + 1000), true)
  assert.equal(punch(bout, red, 'cross', CLOSE, red.nextPunchAt + 300), 'blocked')
})

test('a dodged punch opens the same counter, and a counter is spent by the next punch thrown even if it misses', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  dodge(bout, blue, ROUND_START)
  assert.equal(punch(bout, red, 'jab', CLOSE, ROUND_START + 100), 'dodged')
  assert.equal(punch(bout, blue, 'jab', CLOSE, ROUND_START + 100 + RULES.counter.windowMs - 1), 'landed')
  assert.deepEqual([RULES.health - red.health, blue.points], [10, 3])
  dodge(bout, blue, ROUND_START + 5000)
  punch(bout, red, 'jab', CLOSE, ROUND_START + 5100)
  assert.equal(punch(bout, blue, 'jab', { ...CLOSE, distM: 5 }, ROUND_START + 5200), 'missed')
  assert.equal(punch(bout, blue, 'jab', CLOSE, blue.nextPunchAt), 'landed')
  assert.equal(RULES.health - red.health, 15)
  dodge(bout, blue, ROUND_START + 9000)
  punch(bout, red, 'jab', CLOSE, ROUND_START + 9100)
  assert.equal(punch(bout, blue, 'jab', CLOSE, ROUND_START + 9100 + RULES.counter.windowMs), 'landed')
  assert.equal(RULES.health - red.health, 20)
})

test('a parry empties what the stunned boxer had ready: chain, queued punch and held buttons', () => {
  const bout = fighting()
  const [red, blue] = bout.boxers
  punch(bout, red, 'jab', CLOSE, ROUND_START)
  pressHand(bout, red, 'right', ROUND_START + 100)
  red.queued = { kind: 'cross', at: red.nextPunchAt, heldMs: 10 }
  setGuard(bout, blue, true, red.nextPunchAt - 10)
  assert.equal(punch(bout, red, 'cross', CLOSE, red.nextPunchAt), 'parried')
  assert.deepEqual([red.chain, red.queued, red.pressedAt, red.combo], [[], null, { left: null, right: null }, null])
})

test('the rules refuse a combo of an unknown punch or a hold time of 0', () => {
  const raw = boxingRulesJson()
  const combo = raw.combo as { windowMs: number, list: unknown[] }
  assert.throws(() => parseBoxingRules({ ...raw, combo: { ...combo, list: [{ id: 'x', sequence: ['jab', 'kick'], bonusDamage: 1, bonusPoints: 1 }] } }), /sequence/)
  assert.throws(() => parseBoxingRules({ ...raw, hold: { ms: 0 } }), /hold/)
  const punches = raw.punches as Record<string, Record<string, number>>
  assert.throws(() => parseBoxingRules({ ...raw, punches: { ...punches, jab: { ...punches.jab, cancelMs: 451 } } }), /cancelMs/)
  assert.throws(() => parseBoxingRules({ ...raw, cancel: null }), /cancel/)
})
