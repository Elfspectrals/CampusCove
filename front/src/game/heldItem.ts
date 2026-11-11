import * as THREE from 'three'
import { createGltfLoader } from './gltfLoaderFactory'

const HELD_ITEM_GRIP = new THREE.Vector3(-0.032, 0, -0.1)
const GRIP_HEIGHT = 0.35
const HELD_ITEM_SCALE = 1.15

export function createHeldItem() {
  const loader = createGltfLoader()
  const models = new Map<string, Promise<THREE.Object3D>>()
  let hands: THREE.Object3D | null = null
  let modelUrl: string | null = null
  let shown: THREE.Object3D | null = null
  let scale = 1

  function load(url: string): Promise<THREE.Object3D> {
    let model = models.get(url)
    if (!model) {
      model = loader.loadAsync(url).then((gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene)
        gltf.scene.position.y = -(box.min.y + GRIP_HEIGHT * (box.max.y - box.min.y))
        const held = new THREE.Group()
        held.add(gltf.scene)
        held.position.copy(HELD_ITEM_GRIP)
        held.scale.setScalar(HELD_ITEM_SCALE)
        return held
      })
      models.set(url, model)
    }
    return model
  }

  /** `nextScale` shrinks a half-eaten food item (portions left / portions). */
  function update(nextHands: THREE.Object3D | null, nextModelUrl: string | null, nextScale = 1): void {
    if (nextScale !== scale) {
      scale = nextScale
      shown?.scale.setScalar(HELD_ITEM_SCALE * scale)
    }
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
        model.scale.setScalar(HELD_ITEM_SCALE * scale)
        wantedHands.add(model)
        shown = model
      })
      .catch((err: unknown) => {
        console.error('[heldItem] model load failed', wantedUrl, err)
      })
  }

  return { update }
}
