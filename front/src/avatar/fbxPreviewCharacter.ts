import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import type { CosmeticColors, CosmeticSlot } from '../api/characterCosmetics'
import { DEFAULT_SLOT_COLORS, SLOT_ORDER } from '../api/characterCosmetics'

let templateRoot: THREE.Group | null = null
let loadFailed = false

/**
 * Loads `SK_Character_Biker.fbx` once, then normalizes to preview scale.
 */
export async function loadFbxPreviewTemplate(): Promise<THREE.Group | null> {
  if (loadFailed) return null
  if (templateRoot) return templateRoot

  try {
    const loader = new FBXLoader()
    const url = new URL('../SK_Character_Biker.fbx', import.meta.url).href
    const root = (await loader.loadAsync(url)) as THREE.Group
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

function cloneWithUniqueMaterials(source: THREE.Object3D): THREE.Group {
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

/**
 * Strict mapping by exact mesh/material names from exported FBX data.
 * `SK_Character_Biker.fbx` currently exposes one mesh/material, so unmatched parts
 * intentionally fall back to a blended tint until the asset is split in DCC.
 */
const SLOT_NAME_MAP: Readonly<Record<CosmeticSlot, readonly string[]>> = {
  body: ['SK_Character_Biker', 'lambert15'],
  hair: [],
  top: [],
  bottom: [],
  shoes: [],
  head_accessory: [],
}

function resolveSlotByNames(meshName: string, materialName: string): CosmeticSlot | null {
  for (const slot of SLOT_ORDER) {
    const names = SLOT_NAME_MAP[slot]
    if (names.includes(meshName) || names.includes(materialName)) {
      return slot
    }
  }
  return null
}

function hasColorProperty(material: THREE.Material): material is THREE.Material & { color: THREE.Color } {
  const maybe = material as unknown as { color?: unknown }
  return maybe.color instanceof THREE.Color
}

function applyMaterialColor(material: THREE.Material, color: THREE.Color): void {
  if (!hasColorProperty(material)) return
  material.color.copy(color)
  material.needsUpdate = true
}

export function applyFbxCosmeticColors(root: THREE.Object3D, colors: CosmeticColors): void {
  const blended = blendSlotHexes(colors)
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return
    const materialName = Array.isArray(obj.material) ? '' : obj.material.name
    const slot = resolveSlotByNames(obj.name, materialName)
    const target = slot !== null ? new THREE.Color(colors[slot] ?? DEFAULT_SLOT_COLORS[slot]) : blended
    if (Array.isArray(obj.material)) {
      obj.material.forEach((m) => applyMaterialColor(m, target))
    } else {
      applyMaterialColor(obj.material, target)
    }
  })
}

export async function createTintedFbxPreviewCharacter(colors: CosmeticColors): Promise<THREE.Group | null> {
  const template = await loadFbxPreviewTemplate()
  if (!template) return null
  const instance = cloneWithUniqueMaterials(template)
  applyFbxCosmeticColors(instance, colors)
  return instance
}
