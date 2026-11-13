import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextHint, parseSeenHints, type HintPlaces } from './tutorialHints.ts'

const places: HintPlaces = {
  atm: [[10, 0, 0]],
  npc: [[0, 0, 10]],
  door: [[-10, 0, 0]],
}

test('a hint shows within 4 m on the ground, not beyond', () => {
  assert.deepEqual(nextHint({ x: 6.1, z: 0 }, places, new Set()), { kind: 'atm', at: [10, 0, 0] })
  assert.deepEqual(nextHint({ x: 6, z: 0 }, places, new Set()), { kind: 'atm', at: [10, 0, 0] })
  assert.equal(nextHint({ x: 5.9, z: 0 }, places, new Set()), null)
})

test('the bubble goes over the nearest place of its kind', () => {
  const twoInReach: HintPlaces = { ...places, atm: [[3, 0, 0], [1, 0, 0]] }
  assert.deepEqual(nextHint({ x: 0, z: 0 }, twoInReach, new Set()), { kind: 'atm', at: [1, 0, 0] })
})

test('a kind already seen never shows again, even at another place of that kind', () => {
  const twoAtms: HintPlaces = { ...places, atm: [[10, 0, 0], [50, 0, 0]] }
  assert.equal(nextHint({ x: 49, z: 0 }, twoAtms, new Set(['atm'])), null)
  assert.deepEqual(nextHint({ x: 0, z: 9 }, twoAtms, new Set(['atm'])), { kind: 'npc', at: [0, 0, 10] })
})

test('with several kinds in reach, the ATM comes first, then the NPC, then the door', () => {
  const together: HintPlaces = { atm: [[1, 0, 0]], npc: [[0, 0, 1]], door: [[-1, 0, 0]] }
  assert.equal(nextHint({ x: 0, z: 0 }, together, new Set())?.kind, 'atm')
  assert.equal(nextHint({ x: 0, z: 0 }, together, new Set(['atm']))?.kind, 'npc')
  assert.equal(nextHint({ x: 0, z: 0 }, together, new Set(['atm', 'npc']))?.kind, 'door')
})

test('the seen list reads back what was saved and refuses a broken one', () => {
  assert.deepEqual(parseSeenHints(null), new Set())
  assert.deepEqual(parseSeenHints('["atm","door"]'), new Set(['atm', 'door']))
  assert.throws(() => parseSeenHints('{"atm":true}'))
  assert.throws(() => parseSeenHints('not json'))
})
