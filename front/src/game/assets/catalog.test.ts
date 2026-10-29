import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consumablePreviewUrl, findWork } from './catalog.ts'

test('food and medical previews resolve to their own folders', () => {
  assert.equal(consumablePreviewUrl('food_cookie'), '/assets/items/food/cookie/preview.png')
  assert.equal(consumablePreviewUrl('med_painkillers'), '/assets/items/medical/painkillers/preview.png')
})

test('an unknown consumable code is an explicit error', () => {
  assert.throws(() => consumablePreviewUrl('house_key'), /house_key/)
})

test('the clinic is a medic work building', () => {
  assert.equal(findWork('clinic')?.job, 'medic')
  assert.equal(findWork('clinic')?.interiorUrl, '/assets/work/clinic/interior.glb')
})
