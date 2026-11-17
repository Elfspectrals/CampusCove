import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'
import { ICE_SKATES_WEAR_URL, skatingWear } from './skateWear.ts'

const models = { hair: '/assets/wear/hair/short/model.glb', head_accessory: null, top: null, bottom: null, shoes: '/assets/wear/shoes/runners/model.glb' }

test('on the ice the shoes are swapped for the skates, the rest of the outfit is kept', () => {
  assert.deepEqual(skatingWear(models, true), { ...models, shoes: ICE_SKATES_WEAR_URL })
  assert.equal(skatingWear(models, false), models)
  assert.ok(existsSync(new URL(`../../../../public${ICE_SKATES_WEAR_URL}`, import.meta.url)))
})
