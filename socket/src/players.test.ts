import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeCharacter, normalizeSlotModels } from './players.ts'

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

test('keeps a whole character look', () => {
  assert.deepEqual(normalizeCharacter({ sex: 'f', face: 6, build: 'broad' }), { sex: 'f', face: 6, build: 'broad' })
  assert.deepEqual(normalizeCharacter({ sex: 'm', face: 1, build: 'slim', extra: 'x' }), { sex: 'm', face: 1, build: 'slim' })
})

test('drops the character look when any field is wrong or missing', () => {
  for (const raw of [
    null,
    'f',
    { sex: 'f', face: 3 },
    { sex: 'x', face: 3, build: 'normal' },
    { sex: 'm', face: 0, build: 'normal' },
    { sex: 'm', face: 7, build: 'normal' },
    { sex: 'm', face: 2.5, build: 'normal' },
    { sex: 'm', face: '2', build: 'normal' },
    { sex: 'm', face: 2, build: 'huge' },
  ]) {
    assert.equal(normalizeCharacter(raw), null, JSON.stringify(raw))
  }
})
