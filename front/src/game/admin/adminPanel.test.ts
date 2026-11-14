import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { HousingUnitPayload } from '../../types/gameRealtime.ts'
import { ADMIN_MAX_MONEY, adminGrantedMessage, adminResultMessage, adminTargets, filterAdminItems, housePins, houseRegions, regionCrop, wholeIn } from './adminPanel.ts'

const apple = { code: 'farm_apple', name: 'Apple', kind: 'consumable', preview: null, portion: null }
const hat = { code: 'wear_straw_hat', name: 'Straw hat', kind: 'cosmetic', preview: null, portion: null }
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
  const live = { stars: 0, vitals: { health: 100, hunger: 100, thirst: 100, intoxication: 0 }, powers: [] }
  assert.deepEqual(adminResultMessage({ action: 'power', ok: true, sessionId: 'b', pseudo: 'Bea', power: 'god', on: true, ...live }, names, clock), { key: 'adminPanel.result.on.god', params: { name: 'Bea' } })
  assert.deepEqual(adminResultMessage({ action: 'power', ok: true, sessionId: 'b', pseudo: 'Bea', power: 'endless_food', on: false, ...live }, names, clock), { key: 'adminPanel.result.off.endless_food', params: { name: 'Bea' } })
  assert.deepEqual(adminResultMessage({ action: 'power', ok: true, sessionId: 'b', pseudo: 'Bea', power: 'heal', on: null, ...live }, names, clock), { key: 'adminPanel.result.boost.heal', params: { name: 'Bea' } })
  assert.deepEqual(adminResultMessage({ action: 'house', ok: true, sessionId: 'b', pseudo: 'Bea', unit: 'u', modelKey: 'house_01' }, names, clock), { key: 'adminPanel.result.house', params: { name: 'Bea', house: 'Maple Cottage' } })
  assert.deepEqual(adminResultMessage({ action: 'item', ok: false, message: 'This item is bought with gems.' }, names, clock), { key: 'adminPanel.result.failed', params: { message: 'This item is bought with gems.' } })
})

test('the player who received a grant is told by whom', () => {
  assert.deepEqual(adminGrantedMessage({ kind: 'money', byPseudo: 'Admin', wallet: 'cash', amount: 500, cash: 600, bank: 0 }), { key: 'adminPanel.granted.cash', params: { amount: 500, name: 'Admin' } })
  assert.deepEqual(adminGrantedMessage({ kind: 'item', byPseudo: 'Admin', code: 'farm_apple', quantity: 3 }), { key: 'adminPanel.granted.item', params: { quantity: 3, name: 'Admin' } })
  assert.deepEqual(adminGrantedMessage({ kind: 'power', byPseudo: 'Admin', power: 'endless_water', on: true }), { key: 'adminPanel.granted.on.endless_water', params: { name: 'Admin' } })
  assert.deepEqual(adminGrantedMessage({ kind: 'power', byPseudo: 'Admin', power: 'sober', on: null }), { key: 'adminPanel.granted.boost.sober', params: { name: 'Admin' } })
  assert.deepEqual(adminGrantedMessage({ kind: 'house', byPseudo: 'Admin', modelKey: 'unknown_villa' }), { key: 'adminPanel.granted.house', params: { name: 'Admin', house: 'unknown_villa' } })
})

test('each house is pinned on the town picture as free, owned by the chosen player or by someone else', () => {
  const unit = (public_id: string, status: string, occupant: number | null, pos_x: number, pos_z: number) =>
    ({ public_id, model_key: 'house_01', status, price_coins: 500, occupant_account_id: occupant, occupant_name: occupant ? `p${occupant}` : null, pos_x, pos_z }) as HousingUnitPayload
  const area = { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }
  const pins = housePins([unit('a', 'vacant', null, -100, -50), unit('b', 'occupied', 7, 0, 0), unit('c', 'occupied', 8, 100, 50)], area, 7)
  assert.deepEqual(pins.map((p) => [p.unit, p.state, p.owner, p.u, p.v]), [
    ['a', 'vacant', null, 0, 0],
    ['b', 'theirs', 'p7', 0.5, 0.5],
    ['c', 'taken', 'p8', 1, 1],
  ])
  assert.equal(pins[0]!.name, 'Maple Cottage')
  assert.equal(housePins([unit('b', 'occupied', 7, 0, 0)], area, null)[0]!.state, 'taken')
})

test('regions are the zones with a house, with a margin; a house on an overlap belongs to the first zone', () => {
  const unit = (public_id: string, pos_x: number, pos_z: number) => ({ public_id, model_key: null, status: 'vacant', price_coins: 1, occupant_account_id: null, occupant_name: null, pos_x, pos_z }) as HousingUnitPayload
  const zones = [
    { key: 'town', bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } },
    { key: 'pond', bounds: { minX: -5, maxX: 40, minZ: 0, maxZ: 10 } },
    { key: 'heights', bounds: { minX: 100, maxX: 200, minZ: 100, maxZ: 200 } },
  ]
  const units = [unit('a', 0, 0), unit('b', 150, 150)]
  const regions = houseRegions(zones, units)
  assert.deepEqual(regions.map((r) => r.key), ['town', 'heights'])
  assert.deepEqual(regions[0]!.area, { minX: -16, maxX: 16, minZ: -16, maxZ: 16 })
  assert.deepEqual(regions.map((r) => r.units.map((u) => u.public_id)), [['a'], ['b']])
})

test('the town picture is cropped to a region by width and offset in percent', () => {
  const crop = regionCrop({ minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, { minX: 0, maxX: 50, minZ: 0, maxZ: 25 })
  assert.deepEqual(crop, { width: 400, left: -200, top: -200 })
})
