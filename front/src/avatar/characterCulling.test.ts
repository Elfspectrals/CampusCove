import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { CHARACTER_REACH, cullCharacterOutOfView } from './characterCulling.ts'

function skinnedPiece(): THREE.SkinnedMesh {
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshStandardMaterial())
  mesh.frustumCulled = false
  return mesh
}

function worldSphere(mesh: THREE.SkinnedMesh): THREE.Sphere {
  mesh.updateWorldMatrix(true, false)
  return mesh.boundingSphere!.clone().applyMatrix4(mesh.matrixWorld)
}

function assertSphere(sphere: THREE.Sphere, centre: [number, number, number], radius: number): void {
  assert.ok(sphere.center.distanceTo(new THREE.Vector3(...centre)) < 1e-6, `centre ${sphere.center.toArray()}`)
  assert.ok(Math.abs(sphere.radius - radius) < 1e-6, `radius ${sphere.radius}`)
}

test('every skinned piece is culled on one sphere around the feet of the character', () => {
  const character = new THREE.Group()
  const rig = new THREE.Group()
  rig.scale.setScalar(0.01)
  rig.position.y = 0.4
  const shoe = skinnedPiece()
  const hat = skinnedPiece()
  hat.position.y = 170
  rig.add(shoe, hat)
  character.add(rig)

  cullCharacterOutOfView(character)

  for (const piece of [shoe, hat]) {
    assert.equal(piece.frustumCulled, true)
    assertSphere(worldSphere(piece), [0, 0, 0], CHARACTER_REACH)
  }
})

test('the sphere follows a character that is moved and scaled afterwards', () => {
  const character = new THREE.Group()
  const body = skinnedPiece()
  character.add(body)
  cullCharacterOutOfView(character)

  character.position.set(40, 0, -12)
  character.scale.setScalar(2)
  character.updateMatrixWorld(true)

  assertSphere(worldSphere(body), [40, 0, -12], CHARACTER_REACH * 2)
})

test('a character behind the camera is out of the view frustum, one in front is in', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120)
  camera.updateMatrixWorld(true)
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  const placed = (z: number): THREE.SkinnedMesh => {
    const character = new THREE.Group()
    const body = skinnedPiece()
    character.add(body)
    cullCharacterOutOfView(character)
    character.position.z = z
    character.updateMatrixWorld(true)
    return body
  }

  assert.equal(frustum.intersectsObject(placed(-10)), true)
  assert.equal(frustum.intersectsObject(placed(10)), false)
  assert.equal(frustum.intersectsObject(placed(-121)), true)
  assert.equal(frustum.intersectsObject(placed(-123)), false)
})
