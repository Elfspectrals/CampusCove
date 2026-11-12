import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { bakeStaticFigure } from './staticFigure.ts'

function armOnTwoBones(material: THREE.Material): { arm: THREE.SkinnedMesh; elbow: THREE.Bone } {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0, 0, 2, 0], 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3))
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], 4))
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4))
  const shoulder = new THREE.Bone()
  const elbow = new THREE.Bone()
  elbow.position.y = 1
  shoulder.add(elbow)
  const arm = new THREE.SkinnedMesh(geometry, material)
  arm.name = 'Arm'
  arm.add(shoulder)
  arm.bind(new THREE.Skeleton([shoulder, elbow]))
  return { arm, elbow }
}

function rounded(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number): number[] {
  return new THREE.Vector3().fromBufferAttribute(attribute, i).toArray().map((value) => Math.round(value * 1e5) / 1e5 + 0)
}

test('a posed skinned piece becomes a plain mesh frozen in that pose', () => {
  const cloth = new THREE.MeshStandardMaterial({ name: 'W_top_Cloth' })
  const character = new THREE.Group()
  const { arm, elbow } = armOnTwoBones(cloth)
  arm.userData = { slot: 'top', sharedGeometry: true, sharedMaterials: true }
  character.add(arm)
  elbow.rotation.z = Math.PI / 2

  const figure = bakeStaticFigure(character)

  assert.equal(figure.children.length, 1)
  const baked = figure.children[0] as THREE.Mesh
  assert.equal(baked instanceof THREE.SkinnedMesh, false)
  assert.equal(baked.name, 'Arm')
  assert.equal(baked.material, cloth)
  assert.deepEqual(baked.userData, { slot: 'top', sharedGeometry: false, sharedMaterials: true })
  assert.equal(baked.geometry.getAttribute('skinIndex'), undefined)
  assert.equal(baked.geometry.getAttribute('skinWeight'), undefined)
  const position = baked.geometry.getAttribute('position')
  assert.deepEqual(rounded(position, 0), [0, 0, 0])
  assert.deepEqual(rounded(position, 1), [0, 1, 0])
  assert.deepEqual(rounded(position, 2), [-1, 1, 0])
  const normal = baked.geometry.getAttribute('normal')
  assert.deepEqual(rounded(normal, 1), [1, 0, 0])
  assert.deepEqual(rounded(normal, 2), [0, 1, 0])
  assert.deepEqual(rounded(arm.geometry.getAttribute('position'), 2), [0, 2, 0])
})

test('the figure stands where the character stood and keeps its rig scale', () => {
  const character = new THREE.Group()
  character.position.set(3, 0, -2)
  character.scale.setScalar(2)
  const rig = new THREE.Group()
  rig.scale.setScalar(0.5)
  const { arm } = armOnTwoBones(new THREE.MeshStandardMaterial())
  rig.add(arm)
  character.add(rig)

  const figure = bakeStaticFigure(character)
  figure.updateMatrixWorld(true)

  assert.deepEqual(figure.position.toArray(), [3, 0, -2])
  assert.deepEqual(figure.scale.toArray(), [2, 2, 2])
  const baked = figure.children[0] as THREE.Mesh
  const top = new THREE.Vector3().fromBufferAttribute(baked.geometry.getAttribute('position'), 2).applyMatrix4(baked.matrixWorld)
  assert.deepEqual(top.toArray(), [3, 2, -2])
})

test('hidden pieces are left out', () => {
  const character = new THREE.Group()
  const shown = armOnTwoBones(new THREE.MeshStandardMaterial()).arm
  const hiddenFace = armOnTwoBones(new THREE.MeshStandardMaterial()).arm
  hiddenFace.visible = false
  const hiddenGroup = new THREE.Group()
  hiddenGroup.visible = false
  hiddenGroup.add(armOnTwoBones(new THREE.MeshStandardMaterial()).arm)
  character.add(shown, hiddenFace, hiddenGroup)

  assert.equal(bakeStaticFigure(character).children.length, 1)
})
