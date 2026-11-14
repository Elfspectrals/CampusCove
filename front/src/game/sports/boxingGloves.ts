import * as THREE from 'three'
import { decorModelUrl } from '../assets/catalog'
import { createGltfLoader } from '../gltfLoaderFactory'
import { type GloveSide, trianglesBySide } from './boxing'

export const GLOVES_KEY = 'boxing_gloves'

function gloveFrom(mesh: THREE.Mesh, triangles: number[]): THREE.Mesh {
  const geometry = mesh.geometry.clone()
  geometry.setIndex(triangles)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox as THREE.Box3
  const centre = box.getCenter(new THREE.Vector3())
  geometry.translate(-centre.x, -box.min.y, -centre.z)
  return new THREE.Mesh(geometry, mesh.material)
}

let pair: Promise<Record<GloveSide, THREE.Mesh>> | null = null

export function loadGlovePair(): Promise<Record<GloveSide, THREE.Mesh>> {
  pair ??= createGltfLoader()
    .loadAsync(decorModelUrl(GLOVES_KEY))
    .then((gltf) => {
      gltf.scene.updateMatrixWorld(true)
      let mesh: THREE.Mesh | null = null
      gltf.scene.traverse((o) => {
        if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
      })
      if (!mesh) throw new Error('boxing gloves: the model has no mesh')
      const source = mesh as THREE.Mesh
      source.geometry.applyMatrix4(source.matrixWorld)
      source.geometry.computeBoundingBox()
      const centreX = (source.geometry.boundingBox as THREE.Box3).getCenter(new THREE.Vector3()).x
      const sides = trianglesBySide(source.geometry.getAttribute('position').array, source.geometry.getIndex()?.array ?? null, centreX)
      if (sides.left.length === 0 || sides.right.length === 0) throw new Error('boxing gloves: the model is not a pair')
      return { left: gloveFrom(source, sides.left), right: gloveFrom(source, sides.right) }
    })
  return pair
}

export function attachGlove(hand: THREE.Object3D, template: THREE.Mesh): THREE.Object3D {
  const glove = template.clone()
  glove.name = 'boxingGlove'
  hand.updateWorldMatrix(true, false)
  glove.scale.setScalar(1 / hand.getWorldScale(new THREE.Vector3()).x)
  hand.add(glove)
  return glove
}

export interface WornGloves {
  dispose: () => void
}

export function wearGloves(hands: Record<GloveSide, THREE.Object3D | null>): WornGloves {
  let disposed = false
  const worn: THREE.Object3D[] = []
  loadGlovePair()
    .then((templates) => {
      if (disposed) return
      for (const side of ['left', 'right'] as const) {
        const hand = hands[side]
        if (hand) worn.push(attachGlove(hand, templates[side]))
      }
    })
    .catch((error: unknown) => console.error('[boxing] gloves not shown', error))
  return {
    dispose: () => {
      disposed = true
      for (const glove of worn) glove.removeFromParent()
    },
  }
}

export function wearGlovesOn(avatar: THREE.Object3D): WornGloves {
  return wearGloves({ left: avatar.getObjectByName('HandL') ?? null, right: avatar.getObjectByName('HandR') ?? null })
}
