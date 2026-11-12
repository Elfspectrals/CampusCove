import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { mergeStaticMeshes } from './mergeStaticMeshes.ts'

const NO_MOVING_NODES = new Set<string>()

function box(material: THREE.Material, x = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
  mesh.position.x = x
  return mesh
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj)
  })
  return meshes
}

test('meshes sharing a material become one mesh, placed where they were', () => {
  const brick = new THREE.MeshStandardMaterial({ name: 'EX_Brick' })
  const roof = new THREE.MeshStandardMaterial({ name: 'EX_Roof' })
  const root = new THREE.Group()
  const wing = new THREE.Group()
  wing.position.z = 4
  wing.add(box(brick, 10))
  root.add(box(brick), wing, box(roof))

  mergeStaticMeshes(root, NO_MOVING_NODES)

  const meshes = meshesOf(root)
  assert.equal(meshes.length, 2)
  const merged = meshes.find((mesh) => mesh.material === brick)!
  assert.equal(merged.name, 'Merged_EX_Brick')
  assert.equal(merged.geometry.getAttribute('position').count, 48)
  merged.geometry.computeBoundingBox()
  assert.deepEqual(merged.geometry.boundingBox!.min.toArray(), [-0.5, -0.5, -0.5])
  assert.deepEqual(merged.geometry.boundingBox!.max.toArray(), [10.5, 0.5, 4.5])
})

test('a moving node keeps its own meshes and can still be found by name', () => {
  const wood = new THREE.MeshStandardMaterial({ name: 'EX_Wood' })
  const root = new THREE.Group()
  const door = new THREE.Group()
  door.name = 'Door'
  const leaf = box(wood, 2)
  door.add(leaf)
  root.add(box(wood), box(wood, 1), door)

  mergeStaticMeshes(root, new Set(['Door']))

  assert.equal(root.getObjectByName('Door'), door)
  assert.equal(leaf.parent, door)
  assert.equal(meshesOf(root).length, 2)
})

test('glass, mirrored, hidden and parent meshes are left alone', () => {
  const glass = new THREE.MeshStandardMaterial({ name: 'EX_Glass', transparent: true, opacity: 0.3 })
  const brick = new THREE.MeshStandardMaterial({ name: 'EX_Brick' })
  const root = new THREE.Group()
  const mirrored = box(brick, 3)
  mirrored.scale.x = -1
  const hiddenGroup = new THREE.Group()
  hiddenGroup.visible = false
  hiddenGroup.add(box(brick, 6))
  const parent = box(brick, 9)
  parent.add(new THREE.Group())
  root.add(box(glass), box(glass, 1), box(brick), mirrored, hiddenGroup, parent)

  mergeStaticMeshes(root, NO_MOVING_NODES)

  assert.equal(meshesOf(root).length, 6)
  assert.equal(mirrored.parent, root)
  assert.equal(hiddenGroup.children.length, 1)
  assert.equal(parent.parent, root)
})

test('meshes with different vertex layouts are not merged together', () => {
  const brick = new THREE.MeshStandardMaterial({ name: 'EX_Brick' })
  const root = new THREE.Group()
  const lightmapped = [box(brick), box(brick, 2)]
  for (const mesh of lightmapped) mesh.geometry.setAttribute('uv1', mesh.geometry.getAttribute('uv').clone())
  root.add(...lightmapped, box(brick, 4), box(brick, 6))

  mergeStaticMeshes(root, NO_MOVING_NODES)

  const meshes = meshesOf(root)
  assert.equal(meshes.length, 2)
  assert.deepEqual(meshes.map((mesh) => Boolean(mesh.geometry.getAttribute('uv1'))).sort(), [false, true])
})
