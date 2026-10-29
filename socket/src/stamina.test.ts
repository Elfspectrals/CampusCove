import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_STAMINA,
  PUNCH_STAMINA_COST,
  STAMINA_REGEN_DELAY_MS,
  spendPunchStamina,
  staminaAt
} from './stamina.ts'

test('stamina does not regenerate during the delay after a punch', () => {
  assert.equal(staminaAt(40, 1000, 1000 + STAMINA_REGEN_DELAY_MS), 40)
})

test('stamina regenerates 25 per second after the delay, up to the max', () => {
  assert.equal(staminaAt(40, 1000, 1000 + STAMINA_REGEN_DELAY_MS + 1000), 65)
  assert.equal(staminaAt(40, 1000, 1000 + STAMINA_REGEN_DELAY_MS + 60_000), MAX_STAMINA)
})

test('a punch costs 20 of the regenerated stamina', () => {
  assert.equal(spendPunchStamina(MAX_STAMINA, 0, 10_000, true), MAX_STAMINA - PUNCH_STAMINA_COST)
  assert.equal(spendPunchStamina(10, 1000, 1000 + STAMINA_REGEN_DELAY_MS + 400, true), 0)
})

test('a punch is refused below one punch of stamina', () => {
  assert.equal(spendPunchStamina(PUNCH_STAMINA_COST - 1, 1000, 1000, true), null)
})

test('five punches in a row empty a full gauge, the sixth is refused', () => {
  let stamina: number | null = MAX_STAMINA
  let spentAt = 0
  for (let i = 1; i <= 5; i++) {
    const now = 10_000 + i * 100
    stamina = spendPunchStamina(stamina ?? 0, spentAt, now, true)
    spentAt = now
  }
  assert.equal(stamina, 0)
  assert.equal(spendPunchStamina(stamina ?? 0, spentAt, spentAt + 100, true), null)
})

test('three misses in a row empty a full gauge', () => {
  let stamina: number | null = MAX_STAMINA
  let spentAt = 0
  for (let i = 1; i <= 3; i++) {
    const now = 10_000 + i * 100
    stamina = spendPunchStamina(stamina ?? 0, spentAt, now, false)
    spentAt = now
  }
  assert.equal(stamina, 0)
  assert.equal(spendPunchStamina(stamina ?? 0, spentAt, spentAt + 100, false), null)
})
