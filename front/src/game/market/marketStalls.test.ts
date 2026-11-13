import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MarketLotView, MarketSnapshot } from '../../types/gameRealtime.ts'
import { MAX_COPIES_SHOWN, copiesShown, copiesThatFit, firstFreeSlot, ownStallNo, slotOrigin, stallLook, stallLookKey } from './marketStalls.ts'

const apples: MarketLotView = { lot_id: 9, slot: 2, code: 'farm_apple', name: 'Apple', quantity: 20, unit_price: 5, container: 'crate', preview_image: null, model_glb: '/assets/items/farm/apple/model.glb' }

function market(open: boolean): MarketSnapshot {
  return { open, stall_fee: 15, market_date: '2026-11-14', opens_at: '2026-11-14T15:00:00+01:00', closes_at: '2026-11-14T17:00:00+01:00', stalls: open ? [{ stall_no: 3, account_id: 7, canopy: 'blue', lots: [apples] }] : [] }
}

test('a stall is folded while the market is closed or unknown, bare when free, covered when taken', () => {
  assert.deepEqual(stallLook(null, 3), { state: 'folded', canopy: null, lots: [] })
  assert.deepEqual(stallLook(market(false), 3), { state: 'folded', canopy: null, lots: [] })
  assert.deepEqual(stallLook(market(true), 1), { state: 'free', canopy: null, lots: [] })
  assert.deepEqual(stallLook(market(true), 3), { state: 'taken', canopy: 'blue', lots: [apples] })
})

test('one copy is shown per unit up to eight, then the heap stays full', () => {
  assert.equal(copiesShown(1), 1)
  assert.equal(copiesShown(3), 3)
  assert.equal(copiesShown(MAX_COPIES_SHOWN), 8)
  assert.equal(copiesShown(9), 8)
  assert.equal(copiesShown(20), 8)
})

test('a crate holds fewer copies of a big item than of a small one', () => {
  assert.equal(copiesThatFit('crate', [0.08, 0.08, 0.08], 20), 8)
  assert.equal(copiesThatFit('crate', [0.18, 0.18, 0.14], 20), 4)
  assert.equal(copiesThatFit('basket', [0.3, 0.3, 0.3], 5), 0)
})

test('slots run from left to right along the 3 m table, 0.5 m apart, on its top', () => {
  assert.deepEqual(slotOrigin(1), [-1.25, 0.85, 0])
  assert.deepEqual(slotOrigin(6), [1.25, 0.85, 0])
})

test('the stall look changes key when the shown heap changes, not for every sale', () => {
  const sold = (quantity: number) => stallLookKey(stallLook({ ...market(true), stalls: [{ stall_no: 3, account_id: 7, canopy: 'blue', lots: [{ ...apples, quantity }] }] }, 3))
  assert.equal(sold(20), sold(9))
  assert.notEqual(sold(9), sold(7))
})

test('a player holds a stall only while the market is open', () => {
  assert.equal(ownStallNo(market(true), 7), 3)
  assert.equal(ownStallNo(market(true), 8), null)
  assert.equal(ownStallNo(market(false), 7), null)
  assert.equal(ownStallNo(market(true), null), null)
})

test('a new lot goes to the first free slot from the left, none when the table is full', () => {
  assert.equal(firstFreeSlot([]), 1)
  assert.equal(firstFreeSlot([apples]), 1)
  assert.equal(firstFreeSlot([{ ...apples, slot: 1 }, { ...apples, slot: 3 }]), 2)
  assert.equal(firstFreeSlot([1, 2, 3, 4, 5, 6].map((slot) => ({ ...apples, slot }))), null)
})
