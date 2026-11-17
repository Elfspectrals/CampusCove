import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemType } from './itemType.ts'

const food = (hunger: number, thirst: number) => ({ portions: 1, hunger, thirst, health: 0, effect: null })

test('clothes, furniture and plain items read their kind', () => {
  assert.deepEqual(itemType({ kind: 'cosmetic', code: 'wear_top_jersey' }), { label: 'Clothing', use: null })
  assert.deepEqual(itemType({ kind: 'furniture', code: 'decor_sofa_classic' }), { label: 'Furniture', use: null })
  assert.deepEqual(itemType({ kind: 'apartment_asset', code: 'decor_floor_lamp' }), { label: 'Furniture', use: null })
  assert.deepEqual(itemType({ kind: 'misc', code: 'misc_ticket' }), { label: 'Item', use: null })
})

test('a consumable is a drink when it quenches more than it feeds, care when it is medical', () => {
  assert.equal(itemType({ kind: 'consumable', code: 'drink_stout', food: food(0, 8) }).label, 'Drink')
  assert.equal(itemType({ kind: 'consumable', code: 'grocery_apple', food: food(12, 2) }).label, 'Food')
  assert.equal(itemType({ kind: 'consumable', code: 'cafe_mystery' }).label, 'Food')
  assert.equal(itemType({ kind: 'consumable', code: 'med_bandage', food: food(0, 0) }).label, 'Care')
})

test('an item made for one place or activity says where it is used', () => {
  assert.deepEqual(itemType({ kind: 'tool', code: 'tool_secateurs' }), { label: 'Tool', use: 'Orchard: picks an apple in 2 s instead of 3' })
  assert.equal(itemType({ kind: 'furniture', code: 'decor_alarm' }).use, 'Your house: goes off on a break-in')
  assert.equal(itemType({ kind: 'tool', code: 'tool_house_key' }).use, null)
})

test('sports gear says which venue needs it', () => {
  assert.deepEqual(itemType({ kind: 'sports_gear', code: 'gear_ice_skates' }), { label: 'Sports gear', use: 'Ice rink: needed to skate' })
  assert.equal(itemType({ kind: 'sports_gear', code: 'gear_swimsuit' }).use, 'Pool: needed to swim and dive')
})
