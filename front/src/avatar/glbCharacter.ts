import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CosmeticColors } from '../api/characterCosmetics'
import { DEFAULT_SLOT_COLORS, SLOT_ORDER } from '../api/characterCosmetics'

let templateRoot: THREE.Group | null = null
let loadFailed = false

/**
 * Loads `assets/models/low_poly_character.glb` once, centers and scales to ~1.75m tall (feet at y=0).
 */
export async function loadCharacterTemplate(): Promise<THREE.Group | null> {
  if (loadFailed) return null
  if (templateRoot) return templateRoot

  try {
    const loader = new GLTFLoader()
    const url = new URL('../assets/models/low_poly_character.glb', import.meta.url).href
    const gltf = await loader.loadAsync(url)
    const root = gltf.scene as THREE.Group
    normalizeCharacterScale(root)
    templateRoot = root
    return templateRoot
  } catch {
    loadFailed = true
    return null
  }
}

function normalizeCharacterScale(root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const targetH = 1.75
  const scale = targetH / Math.max(size.y, 0.001)
  root.scale.setScalar(scale)
  root.position.copy(center).multiplyScalar(-scale)
  const box2 = new THREE.Box3().setFromObject(root)
  root.position.y -= box2.min.y
}

/** Deep clone with unique materials so each instance can be tinted independently. */
export function cloneCharacterWithUniqueMaterials(source: THREE.Object3D): THREE.Group {
  const c = source.clone(true) as THREE.Group
  c.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone())
      } else {
        obj.material = obj.material.clone()
      }
    }
  })
  return c
}

/**
 * Single-material GLB (Sketchfab export): blend all slot hexes for a balanced tint.
 * When you add per-mesh materials later, map mesh names → slots here.
 */
export function applyCosmeticColors(root: THREE.Object3D, colors: CosmeticColors): void {
  const blended = blendSlotHexes(colors)
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material) {
      const apply = (m: THREE.Material) => {
        if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
          m.color.copy(blended)
          m.needsUpdate = true
        }
      }
      if (Array.isArray(obj.material)) {
        obj.material.forEach(apply)
      } else {
        apply(obj.material)
      }
    }
  })
}

function blendSlotHexes(colors: CosmeticColors): THREE.Color {
  const out = new THREE.Color()
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const slot of SLOT_ORDER) {
    const hex = colors[slot] ?? DEFAULT_SLOT_COLORS[slot]
    out.set(hex)
    r += out.r
    g += out.g
    b += out.b
    n += 1
  }
  if (n === 0) return new THREE.Color(0x8b7aa8)
  return new THREE.Color(r / n, g / n, b / n)
}

export async function createTintedCharacter(colors: CosmeticColors): Promise<THREE.Group | null> {
  const template = await loadCharacterTemplate()
  if (!template) return null
  const instance = cloneCharacterWithUniqueMaterials(template)
  applyCosmeticColors(instance, colors)
  return instance
}
