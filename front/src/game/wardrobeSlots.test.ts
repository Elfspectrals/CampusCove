import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gearSlotOf, unequipPayload } from './wardrobeSlots.ts'

test('hair and headsets share the head slot', () => {
  assert.equal(gearSlotOf('hair'), 'head')
  assert.equal(gearSlotOf('head_accessory'), 'head')
  assert.equal(gearSlotOf('bottom'), 'bottom')
  assert.equal(gearSlotOf('body'), null)
  assert.equal(gearSlotOf(null), null)
})

test('taking off the head slot clears both the hair and the headset', () => {
  assert.deepEqual(unequipPayload('head'), { head_accessory: null, hair: null })
  assert.deepEqual(unequipPayload('shoes'), { shoes: null })
})
