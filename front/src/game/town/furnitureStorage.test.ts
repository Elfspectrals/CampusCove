import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { OfferableItem } from '../../api/trades'
import { isStorageFurniture, storableItems } from './furnitureStorage.ts'

const item = (code: string, kind: string) => ({ item_def_id: 1, code, name: code, kind, quantity: 1, preview_image: null, cosmetic_slot: null }) as OfferableItem
const bag = [item('food_cookie', 'consumable'), item('tool_lockpick', 'tool'), item('decor_sofa_classic', 'furniture'), item('COS_WEAR_BOTTOM_LEGGINGS', 'cosmetic')]

test('a dresser, a toy chest and a fridge hold items, a sofa does not', () => {
  assert.equal(isStorageFurniture('decor_dresser'), true)
  assert.equal(isStorageFurniture('decor_fridge_retro'), true)
  assert.equal(isStorageFurniture('decor_sofa_classic'), false)
})

test('furniture never goes in a storage, and a fridge takes food only', () => {
  assert.deepEqual(storableItems(bag, false).map((i) => i.code), ['food_cookie', 'tool_lockpick', 'COS_WEAR_BOTTOM_LEGGINGS'])
  assert.deepEqual(storableItems(bag, true).map((i) => i.code), ['food_cookie'])
})
