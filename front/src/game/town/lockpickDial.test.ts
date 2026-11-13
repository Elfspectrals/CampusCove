import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dialPosition, secondsUntilReady } from './lockpickDial.ts'
import { housingActionFor, type HousingUnit } from './housing.ts'

test('the needle starts at the phase sent by the socket and turns once per period', () => {
  const pin = { period: 1200, phase: 0, receivedAt: 5000 }
  assert.equal(dialPosition(pin, 5000), 0)
  assert.equal(dialPosition(pin, 5600), 0.5)
  assert.equal(dialPosition(pin, 6200), 0)
})

test('the needle wraps past the top', () => {
  assert.ok(Math.abs(dialPosition({ period: 1200, phase: 0.9, receivedAt: 0 }, 240) - 0.1) < 1e-9)
})

test('the countdown shows whole seconds and stops at zero', () => {
  assert.equal(secondsUntilReady(8000, 0), 8)
  assert.equal(secondsUntilReady(8000, 7001), 1)
  assert.equal(secondsUntilReady(8000, 8000), 0)
  assert.equal(secondsUntilReady(8000, 9000), 0)
})

const lockedHouse = { status: 'occupied', door_locked: true, occupant_account_id: 9, key_holder_account_ids: [4] } as unknown as HousingUnit

test('a locked door offers to pick the lock only with a lockpick in hand and no keys', () => {
  assert.equal(housingActionFor(lockedHouse, { myAccountId: 1, doorOpen: false, holdingHouseKey: false, holdingLockpick: true }), 'pick')
  assert.equal(housingActionFor(lockedHouse, { myAccountId: 1, doorOpen: false, holdingHouseKey: false, holdingLockpick: false }), 'locked')
  assert.equal(housingActionFor(lockedHouse, { myAccountId: 4, doorOpen: false, holdingHouseKey: false, holdingLockpick: true }), 'locked')
  assert.equal(housingActionFor({ ...lockedHouse, door_locked: false }, { myAccountId: 1, doorOpen: false, holdingHouseKey: false, holdingLockpick: true }), 'open')
})

test('the owner holding a reinforced lock is offered to fit it, once', () => {
  const owned = { ...lockedHouse, occupant_account_id: 1, reinforced_lock: false } as HousingUnit
  const holding = { myAccountId: 1, doorOpen: false, holdingHouseKey: false, holdingReinforcedLock: true }
  assert.equal(housingActionFor(owned, holding), 'reinforce')
  assert.equal(housingActionFor({ ...owned, reinforced_lock: true }, holding), 'locked')
  assert.equal(housingActionFor(lockedHouse, holding), 'locked')
})
