import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consumablePreviewUrl, findWork, toolModelUrl, wearTopFpArmsUrl } from './catalog.ts'

test('every top, the newcomer tee included, has its first-person arms; no top means bare arms', () => {
  assert.equal(wearTopFpArmsUrl('/assets/wear/top/newcomer/model.glb'), '/assets/wear/top/newcomer/fp_arms.glb')
  assert.equal(wearTopFpArmsUrl('/assets/wear/top/track_jacket/model.glb'), '/assets/wear/top/track_jacket/fp_arms.glb')
  assert.equal(wearTopFpArmsUrl(null), '/assets/wear/bare/fp_arms.glb')
})

test('a model that is not a top is an explicit error', () => {
  assert.throws(() => wearTopFpArmsUrl('/assets/wear/bottom/jeans/model.glb'), /jeans/)
  assert.throws(() => wearTopFpArmsUrl('/assets/wear/top/hoodieXmodel.glb'), /hoodie/)
})

test('food and medical previews resolve to their own folders', () => {
  assert.equal(consumablePreviewUrl('food_cookie'), '/assets/items/food/cookie/preview.png')
  assert.equal(consumablePreviewUrl('med_painkillers'), '/assets/items/medical/painkillers/preview.png')
})

test('orchard produce resolves to the farm folder', () => {
  assert.equal(consumablePreviewUrl('farm_apple'), '/assets/items/farm/apple/preview.png')
})

test('an unknown consumable code is an explicit error', () => {
  assert.throws(() => consumablePreviewUrl('house_key'), /house_key/)
})

test('a tool code resolves to the tools folder, any other code is an explicit error', () => {
  assert.equal(toolModelUrl('tool_lockpick'), '/assets/items/tools/lockpick/model.glb')
  assert.throws(() => toolModelUrl('food_cookie'), /food_cookie/)
})

test('the clinic is a medic work building', () => {
  assert.equal(findWork('clinic')?.job, 'medic')
  assert.equal(findWork('clinic')?.interiorUrl, '/assets/work/clinic/interior.glb')
})
