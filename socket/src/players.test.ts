import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeSlotModels } from './players.ts'

test('keeps wear models that belong to their slot', () => {
  const models = normalizeSlotModels({ top: '/assets/wear/top/hoodie/model.glb', hair: '/assets/wear/hair/curly/model.glb' })
  assert.equal(models.top, '/assets/wear/top/hoodie/model.glb')
  assert.equal(models.hair, '/assets/wear/hair/curly/model.glb')
  assert.equal(models.shoes, null)
})

test('drops foreign URLs and models sent for another slot', () => {
  const models = normalizeSlotModels({
    top: 'https://evil.example/model.glb',
    bottom: '/assets/wear/top/hoodie/model.glb',
    shoes: '/assets/wear/shoes/../../secret/model.glb',
    hair: 42,
  })
  assert.deepEqual(models, { hair: null, head_accessory: null, top: null, bottom: null, shoes: null })
})
