import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

const TEXTURE_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const

const texturesByContent = new Map<string, THREE.Texture>()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function contentKey(gltf: GLTF, texture: THREE.Texture): Promise<string | null> {
  const textureIndex = gltf.parser.associations.get(texture)?.textures
  if (textureIndex === undefined) return null
  const textureDef = gltf.parser.json.textures[textureIndex]
  const sourceIndex: number = textureDef.extensions?.EXT_texture_webp?.source ?? textureDef.source
  const bufferViewIndex: number | undefined = gltf.parser.json.images[sourceIndex]?.bufferView
  if (bufferViewIndex === undefined) return null
  const bytes: ArrayBuffer = await gltf.parser.getDependency('bufferView', bufferViewIndex)
  const digest = toHex(await crypto.subtle.digest('SHA-1', bytes))
  return [digest, texture.colorSpace, texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter, texture.flipY].join(':')
}

export async function shareTexturesAcrossModels(gltf: GLTF): Promise<void> {
  const materials = new Set<THREE.Material>()
  gltf.scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(material)
  })
  for (const material of materials) {
    const slots = material as unknown as Record<string, unknown>
    for (const slot of TEXTURE_SLOTS) {
      const texture = slots[slot]
      if (!(texture instanceof THREE.Texture)) continue
      const key = await contentKey(gltf, texture)
      if (key === null) continue
      const shared = texturesByContent.get(key)
      if (shared) slots[slot] = shared
      else texturesByContent.set(key, texture)
    }
  }
}
