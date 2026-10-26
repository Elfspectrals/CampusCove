import * as THREE from 'three'
import { createGltfLoader } from './gltfLoaderFactory'

const HELD_ITEM_POSITION = new THREE.Vector3(-0.01, 0.045, -0.06)
const HELD_ITEM_ROTATION = new THREE.Euler(0.6708, 0, 1.3208, 'ZYX')
const HELD_ITEM_SCALE = 1.15

export function createHeldItem() {
  const loader = createGltfLoader()
  const models = new Map<string, Promise<THREE.Object3D>>()
  let hands: THREE.Object3D | null = null
  let modelUrl: string | null = null
  let shown: THREE.Object3D | null = null

  function load(url: string): Promise<THREE.Object3D> {
    let model = models.get(url)
    if (!model) {
      model = loader.loadAsync(url).then((gltf) => {
        gltf.scene.position.copy(HELD_ITEM_POSITION)
        gltf.scene.rotation.copy(HELD_ITEM_ROTATION)
        gltf.scene.scale.setScalar(HELD_ITEM_SCALE)
        return gltf.scene
      })
      models.set(url, model)
    }
    return model
  }

  function update(nextHands: THREE.Object3D | null, nextModelUrl: string | null): void {
    if (nextHands === hands && nextModelUrl === modelUrl) return
    hands = nextHands
    modelUrl = nextModelUrl
    shown?.removeFromParent()
    shown = null
    if (!hands || !modelUrl) return
    const wantedHands = hands
    const wantedUrl = modelUrl
    load(wantedUrl)
      .then((model) => {
        if (hands !== wantedHands || modelUrl !== wantedUrl) return
        wantedHands.add(model)
        shown = model
      })
      .catch((err: unknown) => {
        console.error('[heldItem] model load failed', wantedUrl, err)
      })
  }

  return { update }
}
