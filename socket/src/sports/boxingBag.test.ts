import assert from 'node:assert/strict'
import { test } from 'node:test'
import { type BagCombo, type BagRound, bagPunch, bagRoundOver, isPunch, nextCombo, setBagDrill, startBagRound } from './boxingBag.ts'
import type { Combo } from './boxingBout.ts'

const RULES = { roundSec: 60, windowMs: 1200, leaveM: 3, pointsPerPunch: 10, streakForDouble: 3 }
const ONE_TWO_HOOK: Combo = { id: 'one_two_hook', sequence: ['jab', 'cross', 'hook'], bonusDamage: 0, bonusPoints: 0 }
const UPPER_HOOK: Combo = { id: 'upper_hook', sequence: ['uppercut', 'hook'], bonusDamage: 0, bonusPoints: 0 }
const LIST = [ONE_TWO_HOOK, UPPER_HOOK]
const T0 = 1_000_000
const first = () => 0

function round(): BagRound {
  return startBagRound({ accountId: 1, sessionId: 's1' }, 2, T0, RULES, LIST, first)
}

test('a round lasts 60 s and starts on a combo of the list; the next combo is never the same twice in a row', () => {
  const r = round()
  assert.equal(r.endsAt, T0 + 60_000)
  assert.equal(r.combo, ONE_TWO_HOOK)
  assert.equal(nextCombo(LIST, ONE_TWO_HOOK, first), UPPER_HOOK)
  assert.equal(nextCombo(LIST, UPPER_HOOK, () => 0.99), ONE_TWO_HOOK)
  assert.equal(nextCombo([ONE_TWO_HOOK], ONE_TWO_HOOK, first), ONE_TWO_HOOK)
})

test('the punches of the combo in order score 10 a punch and bring the next combo', () => {
  const r = round()
  assert.equal(bagPunch(r, 'jab', T0, RULES, LIST, first), 'hit')
  assert.equal(bagPunch(r, 'cross', T0 + 500, RULES, LIST, first), 'hit')
  assert.equal(r.index, 2)
  assert.equal(bagPunch(r, 'hook', T0 + 1700, RULES, LIST, first), 'combo')
  assert.deepEqual([r.score, r.combos, r.streak, r.index, r.combo.id], [30, 1, 1, 0, 'upper_hook'])
})

test('a wrong punch breaks the chain and the streak; it starts the combo again when it is its first punch', () => {
  const r = round()
  r.streak = 2
  bagPunch(r, 'jab', T0, RULES, LIST, first)
  assert.equal(bagPunch(r, 'hook', T0 + 400, RULES, LIST, first), 'wrong')
  assert.deepEqual([r.index, r.streak, r.score], [0, 0, 0])
  bagPunch(r, 'jab', T0 + 800, RULES, LIST, first)
  assert.equal(bagPunch(r, 'jab', T0 + 1200, RULES, LIST, first), 'wrong')
  assert.equal(r.index, 1)
})

test('more than 1.2 s between two punches of a combo starts it again and breaks the streak', () => {
  const r = round()
  r.streak = 2
  bagPunch(r, 'jab', T0, RULES, LIST, first)
  assert.equal(bagPunch(r, 'cross', T0 + 1200, RULES, LIST, first), 'hit')
  assert.equal(bagPunch(r, 'hook', T0 + 2401, RULES, LIST, first), 'late')
  assert.deepEqual([r.index, r.streak, r.score], [0, 0, 0])
  bagPunch(r, 'jab', T0 + 3000, RULES, LIST, first)
  assert.equal(bagPunch(r, 'jab', T0 + 4201, RULES, LIST, first), 'late')
  assert.equal(r.index, 1)
})

test('from the fourth combo in a row without a mistake the combo counts double', () => {
  const r = round()
  let t = T0
  const play = (combo: Combo) => {
    for (const kind of combo.sequence) bagPunch(r, kind, (t += 400), RULES, LIST, first)
  }
  play(ONE_TWO_HOOK)
  play(UPPER_HOOK)
  play(ONE_TWO_HOOK)
  assert.deepEqual([r.score, r.streak], [80, 3])
  play(UPPER_HOOK)
  assert.deepEqual([r.score, r.combos, r.streak], [120, 4, 4])
})

test('a chosen combo comes back after each success until another choice; a dodge or the guard is a move of a combo like a punch', () => {
  const SLIP: BagCombo = { id: 'slip_counter', sequence: ['dodge_left', 'cross', 'hook'] }
  const list = [...LIST, SLIP]
  const r = startBagRound({ accountId: 1, sessionId: 's1' }, 0, T0, RULES, list, first, SLIP)
  assert.equal(r.combo, SLIP)
  assert.equal(bagPunch(r, 'dodge_right', T0, RULES, list, first), 'wrong')
  assert.equal(bagPunch(r, 'dodge_left', T0 + 400, RULES, list, first), 'hit')
  assert.equal(bagPunch(r, 'cross', T0 + 800, RULES, list, first), 'hit')
  assert.equal(bagPunch(r, 'hook', T0 + 1200, RULES, list, first), 'combo')
  assert.deepEqual([r.combo.id, r.index, r.score], ['slip_counter', 0, 30])
  bagPunch(r, 'dodge_left', T0 + 1600, RULES, list, first)
  setBagDrill(r, ONE_TWO_HOOK, list, first)
  assert.deepEqual([r.combo.id, r.index, r.score], ['one_two_hook', 0, 30])
  setBagDrill(r, null, list, first)
  assert.equal(r.drill, null)
  assert.notEqual(r.combo, ONE_TWO_HOOK)
  assert.deepEqual(['jab', 'guard', 'dodge_left'].map((m) => isPunch(m as 'jab')), [true, false, false])
})

test('a punch after the bell does not count; the round is over at the bell, or when the player is gone or more than 3 m from the bag', () => {
  const r = round()
  assert.equal(bagPunch(r, 'jab', T0 + 60_000, RULES, LIST, first), 'over')
  assert.equal(r.index, 0)
  const bag = { x: 0, z: 0 }
  assert.equal(bagRoundOver(r, { x: 0, z: 3 }, bag, T0 + 59_999, RULES), false)
  assert.equal(bagRoundOver(r, { x: 0, z: 3.01 }, bag, T0 + 1000, RULES), true)
  assert.equal(bagRoundOver(r, null, bag, T0 + 1000, RULES), true)
  assert.equal(bagRoundOver(r, { x: 0, z: 1 }, bag, T0 + 60_000, RULES), true)
})
