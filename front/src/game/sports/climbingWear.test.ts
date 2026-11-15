import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { CLIMBING_SHOES_WEAR_URL, climbingWear } from './climbingWear.ts'

const models = { hair: '/assets/wear/hair/short/model.glb', head_accessory: null, top: null, bottom: null, shoes: '/assets/wear/shoes/runners/model.glb' }

test('with the lent climbing shoes the shoes are swapped, the rest of the outfit is kept', () => {
  assert.deepEqual(climbingWear(models, true), { ...models, shoes: CLIMBING_SHOES_WEAR_URL })
  assert.equal(climbingWear(models, false), models)
  assert.ok(existsSync(new URL(`../../../public${CLIMBING_SHOES_WEAR_URL}`, import.meta.url)))
})
