import * as THREE from 'three'
import { decorModelUrl } from '../assets/catalog'
import { createGltfLoader } from '../gltfLoaderFactory'
import { type GloveSide, boundsOfVertices, trianglesBySide } from './boxing'

export const GLOVES_KEY = 'boxing_gloves'
const FP_FINGERS_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
const FP_GLOVE_SCALE = 0.55

function gloveFrom(mesh: THREE.Mesh, triangles: number[]): THREE.Mesh {
  const geometry = mesh.geometry.clone()
  geometry.setIndex(triangles)
  const { min, max } = boundsOfVertices(geometry.getAttribute('position').array, triangles)
  geometry.translate(-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2)
  geometry.computeBoundingBox()
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

interface GloveFit {
  turn: THREE.Quaternion
  scale: number
}

export function attachGlove(hand: THREE.Object3D, template: THREE.Mesh, fit?: GloveFit): THREE.Object3D {
  const glove = template.clone()
  glove.name = 'boxingGlove'
  if (fit) glove.quaternion.copy(fit.turn)
  hand.updateWorldMatrix(true, false)
  glove.scale.setScalar((fit?.scale ?? 1) / hand.getWorldScale(new THREE.Vector3()).x)
  hand.add(glove)
  return glove
}

export interface WornGloves {
  dispose: () => void
}

function wearGloves(hands: Record<GloveSide, THREE.Object3D | null>, fit?: GloveFit): WornGloves {
  let disposed = false
  const worn: THREE.Object3D[] = []
  loadGlovePair()
    .then((templates) => {
      if (disposed) return
      for (const side of ['left', 'right'] as const) {
        const hand = hands[side]
        if (hand) worn.push(attachGlove(hand, templates[side], fit))
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

const FP_HAND_MESH = /^HandMesh_/

export function wearFpGloves(hands: Record<GloveSide, THREE.Object3D | null>): WornGloves {
  const gloves = wearGloves(hands, { turn: FP_FINGERS_TURN, scale: FP_GLOVE_SCALE })
  const bareHands: THREE.Object3D[] = []
  for (const hand of [hands.left, hands.right]) hand?.traverse((o) => FP_HAND_MESH.test(o.name) && bareHands.push(o))
  for (const mesh of bareHands) mesh.visible = false
  return {
    dispose: () => {
      gloves.dispose()
      for (const mesh of bareHands) mesh.visible = true
    },
  }
}

export function wearGlovesOn(avatar: THREE.Object3D): WornGloves {
  return wearGloves({ left: avatar.getObjectByName('HandL') ?? null, right: avatar.getObjectByName('HandR') ?? null })
}
