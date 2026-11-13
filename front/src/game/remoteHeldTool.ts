import * as THREE from 'three'
import { createGltfLoader } from './gltfLoaderFactory'

const TOOL_CODE = /^tool_([a-z]+)$/
const GRIP_HEIGHT = 0.35
const loader = createGltfLoader()

function heldToolUrl(code: string): string | null {
  const key = TOOL_CODE.exec(code)?.[1]
  return key ? `/assets/items/tools/${key}/model.glb` : null
}

export interface RemoteHeldTool {
  code: string
  dispose: () => void
}

export function createRemoteHeldTool(avatar: THREE.Object3D, code: string): RemoteHeldTool {
  let disposed = false
  let shown: THREE.Object3D | null = null
  const url = heldToolUrl(code)
  if (url) {
    loader
      .loadAsync(url)
      .then((gltf) => {
        if (disposed) return
        const hand = avatar.getObjectByName('HandR') ?? avatar
        const box = new THREE.Box3().setFromObject(gltf.scene)
        gltf.scene.position.y = -(box.min.y + GRIP_HEIGHT * (box.max.y - box.min.y))
        const tool = new THREE.Group()
        tool.name = 'remoteHeldTool'
        tool.add(gltf.scene)
        tool.rotation.x = Math.PI / 2
        hand.updateWorldMatrix(true, false)
        tool.scale.setScalar(1 / hand.getWorldScale(new THREE.Vector3()).x)
        hand.add(tool)
        shown = tool
      })
      .catch((err: unknown) => console.error('[remoteHeldTool] model load failed', url, err))
  }
  return {
    code,
    dispose: () => {
      disposed = true
      shown?.removeFromParent()
    },
  }
}
