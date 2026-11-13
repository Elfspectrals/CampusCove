import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ADMIN_MAX_MONEY, adminGrantedMessage, adminResultMessage, adminTargets, filterAdminItems, wholeIn } from './adminPanel.ts'

const apple = { code: 'farm_apple', name: 'Apple', kind: 'consumable' }
const hat = { code: 'wear_straw_hat', name: 'Straw hat', kind: 'cosmetic' }
const names = (code: string) => (code === 'farm_apple' ? 'Apple' : code)
const clock = (iso: string) => iso.slice(11, 16)

test('the admin comes first as "me", then the other players, never twice', () => {
  const players = [
    { sessionId: 'b', pseudo: 'Bea', distance: 3 },
    { sessionId: 'a', pseudo: 'Admin', distance: 0 },
  ]
  assert.deepEqual(adminTargets('a', players), [
    { sessionId: 'a', pseudo: null },
    { sessionId: 'b', pseudo: 'Bea' },
  ])
  assert.deepEqual(adminTargets('a', []), [{ sessionId: 'a', pseudo: null }])
})

test('the item search matches the name or the code, ignoring case and spaces', () => {
  assert.deepEqual(filterAdminItems([apple, hat], ''), [apple, hat])
  assert.deepEqual(filterAdminItems([apple, hat], '  APP '), [apple])
  assert.deepEqual(filterAdminItems([apple, hat], 'straw_'), [hat])
  assert.deepEqual(filterAdminItems([apple, hat], 'pear'), [])
})

test('amounts are whole numbers inside the bounds, the bounds included', () => {
  assert.equal(wholeIn('1', 1, ADMIN_MAX_MONEY), 1)
  assert.equal(wholeIn('100000', 1, ADMIN_MAX_MONEY), 100_000)
  assert.equal(wholeIn('100001', 1, ADMIN_MAX_MONEY), null)
  assert.equal(wholeIn('0', 1, ADMIN_MAX_MONEY), null)
  assert.equal(wholeIn('2.5', 1, ADMIN_MAX_MONEY), null)
  assert.equal(wholeIn('', 1, ADMIN_MAX_MONEY), null)
  assert.equal(wholeIn('abc', 1, ADMIN_MAX_MONEY), null)
})

test('each server result has its own message', () => {
  assert.deepEqual(adminResultMessage({ action: 'money', ok: true, pseudo: 'Bea', wallet: 'bank', amount: 500 }, names, clock), { key: 'adminPanel.result.money.bank', params: { amount: 500, name: 'Bea' } })
  assert.deepEqual(adminResultMessage({ action: 'item', ok: true, pseudo: 'Bea', code: 'farm_apple', quantity: 2 }, names, clock), { key: 'adminPanel.result.item', params: { quantity: 2, item: 'Apple', name: 'Bea' } })
  assert.deepEqual(adminResultMessage({ action: 'market_open', ok: true, closesAt: '2026-11-13T10:10:00Z' }, names, clock), { key: 'adminPanel.result.marketOpen', params: { time: '10:10' } })
  assert.deepEqual(adminResultMessage({ action: 'market_close', ok: true, returned: 0 }, names, clock), { key: 'adminPanel.result.marketClose', params: { n: 0 } })
  assert.deepEqual(adminResultMessage({ action: 'taxes', ok: true, charged: 2, seized: 1 }, names, clock), { key: 'adminPanel.result.taxes', params: { charged: 2, seized: 1 } })
  assert.deepEqual(adminResultMessage({ action: 'item', ok: false, message: 'This item is bought with gems.' }, names, clock), { key: 'adminPanel.result.failed', params: { message: 'This item is bought with gems.' } })
})

test('the player who received a grant is told by whom', () => {
  assert.deepEqual(adminGrantedMessage({ kind: 'money', byPseudo: 'Admin', wallet: 'cash', amount: 500, cash: 600, bank: 0 }), { key: 'adminPanel.granted.cash', params: { amount: 500, name: 'Admin' } })
  assert.deepEqual(adminGrantedMessage({ kind: 'item', byPseudo: 'Admin', code: 'farm_apple', quantity: 3 }), { key: 'adminPanel.granted.item', params: { quantity: 3, name: 'Admin' } })
})
