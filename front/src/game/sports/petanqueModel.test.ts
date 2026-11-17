import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BOULE_GROOVE, BOULE_STEEL, JACK_WOOD, firstComponent, petanquePieces, trianglesNear } from './petanqueModel.ts'

function sphereAt(x: number, r: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, 8, 6).translate(x, r, 0)
}

function triangles(geometry: THREE.BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
}

test('the first connected piece of a merged mesh is one boule', () => {
  const one = sphereAt(0, 0.04)
  const merged = mergeGeometries([sphereAt(0, 0.04), sphereAt(0.1, 0.04), sphereAt(0.2, 0.04)])
  assert.equal(triangles(firstComponent(merged)), triangles(one))
})

test('only the triangles near a centre are kept', () => {
  const merged = mergeGeometries([sphereAt(0, 0.04), sphereAt(0.3, 0.04)])
  const near = trianglesNear(merged, new THREE.Vector3(0.3, 0.04, 0), 0.05)
  assert.equal(triangles(near), triangles(sphereAt(0, 0.04)))
})

test('one boule and the jack come out of the set model, centred', () => {
  const material = (name: string) => Object.assign(new THREE.MeshStandardMaterial(), { name })
  const scene = new THREE.Group()
  scene.add(new THREE.Mesh(mergeGeometries([sphereAt(0, 0.0375), sphereAt(0.1, 0.0375), sphereAt(0.2, 0.0375)]), material(BOULE_STEEL)))
  scene.add(new THREE.Mesh(mergeGeometries([sphereAt(0, 0.038), sphereAt(0.1, 0.038)]), material(BOULE_GROOVE)))
  scene.add(new THREE.Mesh(sphereAt(0.3, 0.015), material(JACK_WOOD)))
  const pieces = petanquePieces(scene)
  assert.ok(Math.abs(pieces.bouleRadius - 0.0375) < 1e-3)
  assert.ok(Math.abs(pieces.jackRadius - 0.015) < 1e-3)
  const box = new THREE.Box3().setFromObject(pieces.boule)
  assert.ok(box.getCenter(new THREE.Vector3()).length() < 1e-3)
  assert.equal(pieces.boule.children.length, 2)
  assert.throws(() => petanquePieces(new THREE.Group()), /no mesh with material/)
})
