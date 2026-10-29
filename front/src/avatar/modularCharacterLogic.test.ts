import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hiddenRegions, tintHexFor, type SlotHexes } from './modularCharacterLogic.ts'

const DEFAULTS: SlotHexes = { body: '#8B7AA8', hair: '#6B5B95', top: '#9B8ABF', bottom: '#5A4E72', shoes: '#4A3F62', head_accessory: '#7A6B94' }

test('merges the regions hidden by every worn piece', () => {
  assert.deepEqual([...hiddenRegions(['chest,upper_arms', 'hips,thighs', '', undefined])].sort(), ['chest', 'hips', 'thighs', 'upper_arms'])
})

test('default colours keep the authored look', () => {
  assert.equal(tintHexFor('Skin', DEFAULTS, DEFAULTS), null)
  assert.equal(tintHexFor('W_top_hoodie_Main', DEFAULTS, DEFAULTS), null)
})

test('a chosen colour tints the skin and the main material of its slot only', () => {
  const colors = { ...DEFAULTS, body: '#6B4A35', top: '#FF0000' }
  assert.equal(tintHexFor('Skin', colors, DEFAULTS), '#6B4A35')
  assert.equal(tintHexFor('W_top_hoodie_Main', colors, DEFAULTS), '#FF0000')
  assert.equal(tintHexFor('W_top_hoodie_Accent', colors, DEFAULTS), null)
  assert.equal(tintHexFor('W_head_accessory_cat_ear_Main', colors, DEFAULTS), null)
  assert.equal(tintHexFor('BB_Briefs', colors, DEFAULTS), null)
})
