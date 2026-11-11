import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  BUILDS,
  FACE_COUNT,
  HAIRCUTS,
  SEXES,
  bodyUrlFor,
  fitOf,
  haircutOfUrl,
  parseCharacterLook,
  pieceUrlFor,
  randomChoice,
} from './characterLook.ts'

test('the reference body and a missing look keep model.glb', () => {
  assert.equal(fitOf(null), 'm_normal')
  assert.equal(bodyUrlFor('/assets/wear/base/model.glb', null), '/assets/wear/base/model.glb')
  assert.equal(bodyUrlFor('/assets/wear/base/model.glb', { sex: 'm', face: 4, build: 'normal' }), '/assets/wear/base/model.glb')
})

test('other bodies load their own fit of the body, tops and bottoms', () => {
  const look = { sex: 'f', face: 2, build: 'broad' } as const
  assert.equal(bodyUrlFor('/assets/wear/base/model.glb', look), '/assets/wear/base/model_f_broad.glb')
  assert.equal(pieceUrlFor('top', '/assets/wear/top/hoodie/model.glb', look), '/assets/wear/top/hoodie/model_f_broad.glb')
  assert.equal(pieceUrlFor('bottom', '/assets/wear/bottom/jeans/model.glb', look), '/assets/wear/bottom/jeans/model_f_broad.glb')
})

test('hair, head accessories and shoes have one file for every body', () => {
  const look = { sex: 'f', face: 2, build: 'slim' } as const
  for (const [slot, url] of [['hair', '/assets/wear/hair/long/model.glb'], ['head_accessory', '/assets/wear/head_accessory/gamer/model.glb'], ['shoes', '/assets/wear/shoes/boots/model.glb']]) {
    assert.equal(pieceUrlFor(slot!, url!, look), url)
  }
})

test('a look is kept whole or dropped', () => {
  assert.deepEqual(parseCharacterLook({ sex: 'f', face: 6, build: 'slim' }), { sex: 'f', face: 6, build: 'slim' })
  for (const raw of [null, {}, { sex: 'f', face: 0, build: 'slim' }, { sex: 'f', face: 7, build: 'slim' }, { sex: 'x', face: 1, build: 'slim' }, { sex: 'm', face: 1, build: 'huge' }, { sex: 'm', face: '1', build: 'slim' }]) {
    assert.equal(parseCharacterLook(raw), null, JSON.stringify(raw))
  }
})

test('the haircut is read back from its model URL', () => {
  assert.equal(haircutOfUrl('/assets/wear/hair/curly/model.glb'), 'curly')
  assert.equal(haircutOfUrl('/assets/wear/head_accessory/gamer/model.glb'), null)
  assert.equal(haircutOfUrl(null), null)
})

test('a random character only uses allowed values', () => {
  for (const r of [0, 0.25, 0.5, 0.999999]) {
    const c = randomChoice(() => r)
    assert.ok(SEXES.includes(c.sex))
    assert.ok(BUILDS.includes(c.build))
    assert.ok(HAIRCUTS.includes(c.hair))
    assert.ok(Number.isInteger(c.face) && c.face >= 1 && c.face <= FACE_COUNT)
  }
})
