import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { createHitFlash } from './hitFlash.ts'

function avatar(): { group: THREE.Group; body: THREE.Mesh; skin: THREE.Material } {
  const skin = new THREE.MeshStandardMaterial({ map: new THREE.Texture() })
  const body = new THREE.Mesh(new THREE.BufferGeometry(), skin)
  const group = new THREE.Group()
  group.add(body)
  return { group, body, skin }
}

test('a hit flashes the avatar white then gives its skin back', () => {
  const { group, body, skin } = avatar()
  const flash = createHitFlash(group, 0)
  flash.update(0.01)
  assert.notEqual(body.material, skin)
  assert.equal(flash.update(0.1), false)
  assert.equal(body.material, skin)
})

test('two hits starting on the same frame leave the skin on', () => {
  const { group, body, skin } = avatar()
  const first = createHitFlash(group, 0)
  const second = createHitFlash(group, 0)
  first.update(0.01)
  second.update(0.01)
  first.update(0.1)
  assert.notEqual(body.material, skin, 'still white while the second flash runs')
  second.update(0.1)
  assert.equal(body.material, skin)
})

test('a hit landing mid-flash leaves the skin on', () => {
  const { group, body, skin } = avatar()
  const first = createHitFlash(group, 0)
  const second = createHitFlash(group, 0.03)
  first.update(0.04)
  second.update(0.04) // lands while the first flash still holds the avatar white
  assert.equal(first.update(0.05), false)
  assert.equal(second.update(0.05), true)
  assert.equal(second.update(0.05), false)
  assert.equal(body.material, skin)
})

test('flashes torn down in any order (avatar rebuilt) leave the skin on', () => {
  const { group, body, skin } = avatar()
  const first = createHitFlash(group, 0)
  const second = createHitFlash(group, 0)
  first.update(0.01)
  second.update(0.01)
  second.end()
  first.end()
  assert.equal(body.material, skin)
})

test('ending a flash twice (avatar rebuilt, then its timer) keeps the skin', () => {
  const { group, body, skin } = avatar()
  const flash = createHitFlash(group, 0)
  flash.update(0.01)
  flash.end()
  flash.update(0.1)
  assert.equal(body.material, skin)
})
