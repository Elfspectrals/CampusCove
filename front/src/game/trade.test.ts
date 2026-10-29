import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_TRADE_LINES,
  clampCoins,
  closedMessage,
  describeOffer,
  draftFromOffer,
  draftPayload,
  emptyDraft,
  sameDraft,
  withItemQuantity,
} from './trade.ts'

test('coins stay whole and within the balance', () => {
  assert.equal(clampCoins(42.9, 100), 42)
  assert.equal(clampCoins(500, 100), 100)
  assert.equal(clampCoins(-3, 100), 0)
  assert.equal(clampCoins(Number.NaN, 100), 0)
})

test('item lines stay within the owned quantity and 0 removes them', () => {
  let draft = withItemQuantity(emptyDraft(), 'food_sandwich', 5, 3)
  assert.deepEqual(draft.items, { food_sandwich: 3 })
  draft = withItemQuantity(draft, 'food_sandwich', 0, 3)
  assert.deepEqual(draft.items, {})
})

test('no more lines than the server accepts', () => {
  let draft = emptyDraft()
  for (let i = 0; i < MAX_TRADE_LINES + 2; i++) draft = withItemQuantity(draft, `item_${i}`, 1, 1)
  assert.equal(Object.keys(draft.items).length, MAX_TRADE_LINES)
  // an existing line can still change
  draft = withItemQuantity(draft, 'item_0', 1, 1)
  assert.equal(draft.items.item_0, 1)
})

test('a draft round-trips through the server offer', () => {
  const offer = { coins: 20, items: [{ code: 'a', name: 'A', kind: 'misc', quantity: 2, previewImage: null }] }
  const draft = draftFromOffer(offer)
  assert.deepEqual(draftPayload(draft), { coins: 20, items: [{ code: 'a', quantity: 2 }] })
  assert.ok(sameDraft(draft, { coins: 20, items: { a: 2 } }))
  assert.ok(!sameDraft(draft, { coins: 21, items: { a: 2 } }))
})

test('offers and endings read as sentences', () => {
  assert.equal(describeOffer({ coins: 0, items: [] }), 'nothing')
  assert.equal(
    describeOffer({ coins: 120, items: [{ code: 's', name: 'Sandwich', kind: 'consumable', quantity: 2, previewImage: null }] }),
    '120 coins, 2 × Sandwich',
  )
  assert.equal(closedMessage('declined', false, 'Sam'), 'Sam declined your trade request.')
  assert.equal(closedMessage('cancelled', true, 'Sam'), 'Trade cancelled.')
})
