import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GemOrder, GemOrderStatus } from '../api/gems'
import { POLL_DELAYS_MS, formatPrice, returnPhase } from './gemCheckout.ts'

function order(status: GemOrderStatus, refund: Partial<GemOrder['refund']> = {}, disputed = false): GemOrder {
  return {
    public_id: 'a',
    pack_code: 'gems_650',
    gems: 650,
    amount_cents: 999,
    currency: 'eur',
    status,
    livemode: false,
    delivered: status === 'paid',
    created_at: null,
    paid_at: null,
    refund: { status: 'none', refunded_cents: 0, gems_reversed: 0, ...refund },
    disputed,
  }
}

test('success comes only from the order the API reports as paid', () => {
  assert.equal(returnPhase(order('paid'), 'success', 0), 'success')
  // back on the success URL but not confirmed yet: keep asking
  assert.equal(returnPhase(order('open'), 'success', 0), 'checking')
  assert.equal(returnPhase(null, 'success', 3), 'checking')
})

test('the cancel button never hides a payment that went through', () => {
  assert.equal(returnPhase(order('open'), 'cancel', 0), 'cancelled')
  assert.equal(returnPhase(order('paid'), 'cancel', 0), 'success')
})

test('waiting is bounded, then the page offers to check again later', () => {
  assert.equal(returnPhase(order('open'), 'success', POLL_DELAYS_MS.length - 1), 'checking')
  assert.equal(returnPhase(order('open'), 'success', POLL_DELAYS_MS.length), 'timeout')
  assert.ok(POLL_DELAYS_MS.reduce((a, b) => a + b, 0) <= 40_000)
})

test('a refunded order is never announced as gems just added', () => {
  assert.equal(returnPhase(order('paid', { status: 'full', refunded_cents: 999, gems_reversed: 650 }), 'success', 0), 'refunded')
  assert.equal(returnPhase(order('paid', { status: 'partial', refunded_cents: 500, gems_reversed: 325 }), 'success', 0), 'partiallyRefunded')
  // 1 cent back rounds to 0 gems taken back: still a partial refund, not a plain success
  assert.equal(returnPhase(order('paid', { status: 'partial', refunded_cents: 1, gems_reversed: 0 }), 'success', 0), 'partiallyRefunded')
  // the cancel button does not hide the refund either
  assert.equal(returnPhase(order('paid', { status: 'full', refunded_cents: 999, gems_reversed: 650 }), 'cancel', 0), 'refunded')
})

test('a lost dispute takes gems back like a refund', () => {
  assert.equal(returnPhase(order('paid', { gems_reversed: 650 }, true), 'success', 0), 'refunded')
  assert.equal(returnPhase(order('paid', { gems_reversed: 200 }, true), 'success', 0), 'partiallyRefunded')
  // an open dispute takes nothing back yet
  assert.equal(returnPhase(order('paid', {}, true), 'success', 0), 'success')
})

test('delayed, failed and expired payments have their own state', () => {
  assert.equal(returnPhase(order('processing'), 'success', 0), 'processing')
  assert.equal(returnPhase(order('failed'), 'success', 0), 'failed')
  assert.equal(returnPhase(order('expired'), 'success', 0), 'expired')
  assert.equal(returnPhase(order('expired'), 'cancel', 0), 'cancelled')
})

test('prices are the charged amount in euros', () => {
  assert.equal(formatPrice(999, 'eur', 'fr').replace(/\s/g, ' '), '9,99 €')
  assert.equal(formatPrice(1999, 'eur', 'en'), '€19.99')
})
