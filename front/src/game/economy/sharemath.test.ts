import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { APPLE_SALE, PICKS_PER_HOUR, coinsAfter, dayCurve, salePayout, type SaleCurve } from './sharemath.ts'

interface Vector { curve: SaleCurve; soldToday: number; quantity: number; coins: number; fullPriceLeft: number }

const shared = JSON.parse(readFileSync(new URL('../../../../backend/tests/fixtures/sale_curve_vectors.json', import.meta.url), 'utf8')) as { apple: SaleCurve; vectors: Vector[] }

test('the sale curve pays the full price up to the daily quota, then the lower price, like the PHP side', () => {
  for (const v of shared.vectors) assert.deepEqual(salePayout(v.curve, v.soldToday, v.quantity), { coins: v.coins, fullPriceLeft: v.fullPriceLeft }, JSON.stringify(v))
})

test('the apple curve matches the one the API pays', () => {
  assert.deepEqual(APPLE_SALE, shared.apple)
})

test('an hour of picking apples earns 1200 apples worth, the quota caps the day', () => {
  assert.equal(PICKS_PER_HOUR, 1200)
  assert.equal(coinsAfter(APPLE_SALE, PICKS_PER_HOUR, 0.25), 900)
  assert.equal(coinsAfter(APPLE_SALE, PICKS_PER_HOUR, 1), 300 * 3)
  assert.deepEqual(dayCurve(APPLE_SALE, PICKS_PER_HOUR, 2, 2), [[0, 0], [1, 900], [2, 900]])
})
