import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { CosmeticColors } from '../api/characterCosmetics'
import { DEFAULT_SLOT_COLORS, SLOT_ORDER } from '../api/characterCosmetics'

let templateRoot: THREE.Group | null = null
let loadFailed = false
const modelCache = new Map<string, Promise<THREE.Group | null>>()

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

async function loadCharacterModelByUrl(url: string): Promise<THREE.Group | null> {
  const normalized = url.trim()
  if (normalized.length === 0) return null
  const existing = modelCache.get(normalized)
  if (existing) return existing

  const task = (async () => {
    try {
      const loader = new GLTFLoader()
      const gltf = await loader.loadAsync(normalized)
      const root = gltf.scene as THREE.Group
      normalizeCharacterScale(root)
      return root
    } catch {
      return null
    }
  })()
  modelCache.set(normalized, task)
  return task
}

function normalizeCharacterScale(root: THREE.Object3D): void {
  const targetH = 1.75
  root.updateMatrixWorld(true)

  let preBox = computeMeshBounds(root)
  if (!preBox) return
  const preSize = preBox.getSize(new THREE.Vector3())
  if (preSize.y < preSize.z * 0.6) {
    root.rotation.x = -Math.PI / 2
    root.updateMatrixWorld(true)
    preBox = computeMeshBounds(root)
    if (!preBox) return
  }

  const size = preBox.getSize(new THREE.Vector3())
  const measuredHeight = Math.max(size.y, size.z, 0.001)
  const scale = targetH / measuredHeight
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)

  const centeredBox = computeMeshBounds(root)
  if (!centeredBox) return
  const center = centeredBox.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= centeredBox.min.y
  root.updateMatrixWorld(true)

  const regrounded = computeMeshBounds(root)
  if (!regrounded) return
  root.position.y -= regrounded.min.y
}

function computeMeshBounds(root: THREE.Object3D): THREE.Box3 | null {
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  let hasMesh = false

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const geometry = obj.geometry
    if (!geometry.boundingBox) {
      geometry.computeBoundingBox()
    }
    const localBounds = geometry.boundingBox
    if (!localBounds) return
    const worldBounds = localBounds.clone().applyMatrix4(obj.matrixWorld)
    if (!hasMesh) {
      box.copy(worldBounds)
      hasMesh = true
      return
    }
    box.union(worldBounds)
  })

  if (hasMesh) return box
  const fallback = new THREE.Box3().setFromObject(root)
  if (fallback.isEmpty()) return null
  return fallback
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

export async function createTintedCharacterFromUrl(
  modelUrl: string | null | undefined,
  colors: CosmeticColors,
): Promise<THREE.Group | null> {
  const normalized = typeof modelUrl === 'string' ? modelUrl.trim() : ''
  const template = normalized.length > 0 ? await loadCharacterModelByUrl(normalized) : await loadCharacterTemplate()
  if (!template) return null
  const instance = cloneCharacterWithUniqueMaterials(template)
  applyCosmeticColors(instance, colors)
  return instance
}
