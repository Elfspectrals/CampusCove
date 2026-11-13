import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BID_ZONE_RADIUS, OPENING_WINDOW_MS, PREVIEW_MS, RESULT_MS, WALK_MS,
  acceptBid, advance, bidZoneCenter, hammered, inBidZone, parisClock, saleTrigger, startSale,
  type SaleLot, type SaleState, type StorageUnit
} from './storageSale.ts'

const lot = (id: string, openingBid = 250): SaleLot => ({ id, source: 'generated', formerOwnerName: null, openingBid, contents: [] })
const unit: StorageUnit = { id: 'unit_01', door: 'Door_Rollup_01', threshold: { x: 137.7, y: 0.2, z: 6.6 }, inside: { x: 137.7, y: 0.2, z: 4.0 } }

test('the Paris clock follows winter and summer time', () => {
  assert.deepEqual(parisClock(Date.parse('2026-11-13T18:00:00Z')), { night: '2026-11-13', minutes: 19 * 60 })
  assert.deepEqual(parisClock(Date.parse('2026-07-01T17:00:00Z')), { night: '2026-07-01', minutes: 19 * 60 })
})

test('the sale is announced at 18:55 and starts at 19:00 Paris time, once a night, only until 20:00', () => {
  assert.equal(saleTrigger(Date.parse('2026-11-13T17:54:59Z'), null, null), null)
  assert.deepEqual(saleTrigger(Date.parse('2026-11-13T17:55:00Z'), null, null), { kind: 'announce', night: '2026-11-13' })
  assert.equal(saleTrigger(Date.parse('2026-11-13T17:58:00Z'), '2026-11-13', null), null)
  assert.deepEqual(saleTrigger(Date.parse('2026-11-13T18:00:00Z'), '2026-11-13', null), { kind: 'start', night: '2026-11-13' })
  assert.equal(saleTrigger(Date.parse('2026-11-13T18:30:00Z'), '2026-11-13', '2026-11-13'), null)
  assert.equal(saleTrigger(Date.parse('2026-11-13T19:00:00Z'), null, null), null)
})

test('each box walks, shows for 45 s, opens bidding for 15 s, then waits for the hammer', () => {
  const t = 1_000_000
  let s = startSale('2026-11-13', [lot('a'), lot('b')], 12, t)!
  assert.equal(s.phase, 'walking')
  s = advance(s, t + WALK_MS)!
  assert.equal(s.phase, 'preview')
  s = advance(s, t + WALK_MS + PREVIEW_MS - 1)!
  assert.equal(s.phase, 'preview')
  s = advance(s, t + WALK_MS + PREVIEW_MS)!
  assert.equal(s.phase, 'bidding')
  assert.equal(s.phaseEndsAt, t + WALK_MS + PREVIEW_MS + OPENING_WINDOW_MS)
  s = advance(s, s.phaseEndsAt)!
  assert.equal(s.phase, 'hammering')
  assert.equal(advance(s, s.phaseEndsAt + 60_000), s)
})

test('every bid adds 10 s to the time left, with no ceiling', () => {
  const open = 0
  let s: SaleState = { ...startSale('2026-11-13', [lot('a')], 12, 0)!, phase: 'bidding', phaseEndsAt: open + 15_000 }
  s = acceptBid(s, { accountId: 1, pseudo: 'ann', amount: 250 }, 260)
  assert.equal(s.phaseEndsAt, open + 25_000)
  s = acceptBid(s, { accountId: 2, pseudo: 'bob', amount: 260 }, 270)
  assert.equal(s.phaseEndsAt, open + 35_000)
  assert.equal(s.nextBid, 270)
  assert.equal(s.leader?.pseudo, 'bob')
})

test('after the result the next box starts at its own opening bid, and the last one ends the sale', () => {
  let s = startSale('2026-11-13', [lot('a'), lot('b', 400)], 12, 0)!
  s = hammered({ ...s, phase: 'hammering' }, { status: 'sold', winnerAccountId: 1, price: 250 }, 100)
  assert.equal(s.phase, 'result')
  s = advance(s, 100 + RESULT_MS)!
  assert.equal(s.index, 1)
  assert.equal(s.nextBid, 400)
  assert.equal(s.leader, null)
  s = hammered({ ...s, phase: 'hammering' }, { status: 'listed', winnerAccountId: null, price: null }, 200)
  assert.equal(advance(s, 200 + RESULT_MS), null)
})

test('only as many boxes as units are put on sale, and none means no sale', () => {
  const lots = Array.from({ length: 14 }, (_, i) => lot(`l${i}`))
  assert.equal(startSale('2026-11-13', lots, 12, 0)!.lots.length, 12)
  assert.equal(startSale('2026-11-13', [], 12, 0), null)
})

test('the bid zone is a 6 m circle in the aisle, 3 m in front of the box', () => {
  assert.deepEqual(bidZoneCenter(unit), { x: 137.7, z: 9.6 })
  assert.equal(inBidZone({ x: 137.7, z: 9.6 + BID_ZONE_RADIUS }, unit), true)
  assert.equal(inBidZone({ x: 137.7, z: 9.6 + BID_ZONE_RADIUS + 0.01 }, unit), false)
})
