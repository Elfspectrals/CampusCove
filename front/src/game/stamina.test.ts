import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FULL_STAMINA,
  MAX_STAMINA,
  PUNCH_STAMINA_COST,
  STAMINA_REGEN_DELAY_MS,
  isTired,
  snapStamina,
  spendPunchStamina,
  staminaAt,
} from './stamina.ts'

test('a punch costs 20 and regen waits for the delay', () => {
  const spent = spendPunchStamina(FULL_STAMINA, 10_000, true)
  assert.ok(spent)
  assert.deepEqual(spent, { stamina: MAX_STAMINA - PUNCH_STAMINA_COST, spentAt: 10_000 })
  assert.equal(staminaAt(spent, 10_000 + STAMINA_REGEN_DELAY_MS), 80)
  assert.equal(staminaAt(spent, 10_000 + STAMINA_REGEN_DELAY_MS + 400), 90)
  assert.equal(staminaAt(spent, 10_000 + STAMINA_REGEN_DELAY_MS + 5000), MAX_STAMINA)
})

test('a punch is refused below one punch of stamina', () => {
  assert.equal(spendPunchStamina({ stamina: PUNCH_STAMINA_COST - 1, spentAt: 1000 }, 1000, true), null)
  assert.equal(isTired(PUNCH_STAMINA_COST - 1), true)
  assert.equal(isTired(PUNCH_STAMINA_COST), false)
})

test('snapping during the delay keeps the delay', () => {
  const snapped = snapStamina({ stamina: 60, spentAt: 1000 }, 40, 1200)
  assert.equal(staminaAt(snapped, 1200), 40)
  assert.equal(staminaAt(snapped, 1000 + STAMINA_REGEN_DELAY_MS), 40)
  assert.equal(staminaAt(snapped, 1000 + STAMINA_REGEN_DELAY_MS + 1000), 65)
})

test('snapping after the delay regenerates from the server value at once', () => {
  const snapped = snapStamina({ stamina: 0, spentAt: 1000 }, 50, 5000)
  assert.equal(staminaAt(snapped, 5000), 50)
  assert.equal(staminaAt(snapped, 6000), 75)
})

test('a miss empties a full gauge in three punches', () => {
  let state = FULL_STAMINA
  for (let i = 1; i <= 3; i++) state = spendPunchStamina(state, 10_000 + i * 100, false) ?? state
  assert.equal(state.stamina, 0)
})
