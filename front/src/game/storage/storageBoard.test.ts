import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inCircle, remainingMs, saleCall, secondsLeft } from './storageBoard.ts'

test('the auctioneer calls once at 5 s left and twice at 2 s, only while bidding', () => {
  assert.equal(saleCall('bidding', 6000), null)
  assert.equal(saleCall('bidding', 5000), 'once')
  assert.equal(saleCall('bidding', 2500), 'once')
  assert.equal(saleCall('bidding', 2000), 'twice')
  assert.equal(saleCall('bidding', 0), 'twice')
  assert.equal(saleCall('preview', 1000), null)
})

test('the time left follows the server clock and never goes below zero', () => {
  assert.equal(remainingMs(10_000, 4_000, 1_000), 5_000)
  assert.equal(remainingMs(10_000, 12_000, 0), 0)
  assert.equal(secondsLeft(4_200), 5)
  assert.equal(secondsLeft(0), 0)
})

test('the bid circle includes its edge', () => {
  const zone = { x: 137.7, z: 9.6, radius: 6 }
  assert.equal(inCircle({ x: 137.7, z: 15.6 }, zone), true)
  assert.equal(inCircle({ x: 137.7, z: 15.61 }, zone), false)
})
