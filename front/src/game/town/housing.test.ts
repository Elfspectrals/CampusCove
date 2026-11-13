import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isFlatmate, type HousingUnit } from './housing.ts'

function unit(overrides: Partial<HousingUnit>): HousingUnit {
  return { status: 'occupied', occupant_account_id: 1, key_holder_account_ids: [2], ...overrides } as HousingUnit
}

test('a key holder of an occupied house is a flatmate', () => {
  assert.equal(isFlatmate(unit({}), 2), true)
})

test('the owner, a stranger and a guest are not flatmates', () => {
  assert.equal(isFlatmate(unit({}), 1), false)
  assert.equal(isFlatmate(unit({}), 3), false)
  assert.equal(isFlatmate(unit({}), null), false)
})

test('nobody is a flatmate of a vacant house', () => {
  assert.equal(isFlatmate(unit({ status: 'vacant' }), 2), false)
})
