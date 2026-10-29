import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFoodItem, isMedicalItem, itemRarity } from './itemShopPresentation.ts'
import type { ShopItem } from '../api/itemShop.ts'

function item(rarity: number | null, currencies: Array<'coins' | 'premium'>): ShopItem {
  return {
    item_def_id: 1, shop_catalog_item_id: 1, public_id: 'x', code: 'X', name: 'X', description: null,
    preview_image: null, model_glb: null, rarity, kind: 'cosmetic',
    options: currencies.map((currency) => ({ shop_catalog_item_id: 1, public_id: 'x', currency, price: 100 })),
  }
}

test('stored rarity 5 is legendary whatever the price or currency', () => {
  assert.equal(itemRarity(item(5, ['premium'])), 'legendary')
  assert.equal(itemRarity(item(5, ['coins'])), 'legendary')
})

test('repricing a non-legendary item never promotes it', () => {
  const cheap = item(4, ['premium'])
  cheap.options[0]!.price = 99_999
  assert.equal(itemRarity(cheap), 'rare')
})

test('falls back to the sales-mode tiers when rarity is missing', () => {
  assert.equal(itemRarity(item(null, ['coins'])), 'uncommon')
  assert.equal(itemRarity(item(null, ['premium'])), 'rare')
  assert.equal(itemRarity(item(null, ['coins', 'premium'])), 'epic')
})

test('med_ consumables are medical items and stay hidden from the web shop like food', () => {
  const consumable = (code: string) => ({ kind: 'consumable' as const, code })
  assert.equal(isFoodItem(consumable('food_cookie')), true)
  assert.equal(isFoodItem(consumable('med_bandage')), true)
  assert.equal(isMedicalItem(consumable('med_bandage')), true)
  assert.equal(isMedicalItem(consumable('food_cookie')), false)
  assert.equal(isMedicalItem({ kind: 'furniture', code: 'med_bandage' }), false)
})
