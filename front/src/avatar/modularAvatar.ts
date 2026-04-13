import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeObject3D } from './compositeAvatar'

export const MODULAR_SLOTS = ['head', 'torso', 'legs'] as const

export type ModularSlot = (typeof MODULAR_SLOTS)[number]

export interface ModularAvatarLoadout {
  head: string
  torso: string
  legs: string
}

export interface ModularAvatarBuildResult {
  root: THREE.Group
  usedFallbackSlots: ModularSlot[]
}

export const SAMPLE_MODULAR_LOADOUT: ModularAvatarLoadout = {
  head: 'head-a',
  torso: 'torso-b',
  legs: 'legs-c',
}

const SLOT_HEIGHT: Record<ModularSlot, number> = {
  head: 0.55,
  torso: 0.86,
  legs: 0.96,
}

const SLOT_Y_OFFSET: Record<ModularSlot, number> = {
  legs: 0,
  torso: 0.96,
  head: 1.82,
}

const SLOT_COLOR: Record<ModularSlot, number> = {
  head: 0x8fd3ff,
  torso: 0xffb98f,
  legs: 0xb5ff8f,
}

const loader = new GLTFLoader()
const templateCache = new Map<string, THREE.Group>()
const failedCache = new Set<string>()

export async function createModularAvatar(loadout: ModularAvatarLoadout): Promise<ModularAvatarBuildResult> {
  const root = new THREE.Group()
  const usedFallbackSlots: ModularSlot[] = []

  for (const slot of MODULAR_SLOTS) {
    const variant = loadout[slot]
    const loaded = await loadSlotGroup(slot, variant)
    if (loaded) {
      const normalized = normalizePart(loaded, SLOT_HEIGHT[slot])
      normalized.position.y = SLOT_Y_OFFSET[slot]
      root.add(normalized)
      continue
    }

    usedFallbackSlots.push(slot)
    const fallback = createFallbackPart(slot)
    fallback.position.y = SLOT_Y_OFFSET[slot]
    root.add(fallback)
  }

  root.updateMatrixWorld(true)
  return { root, usedFallbackSlots }
}

async function loadSlotGroup(slot: ModularSlot, variant: string): Promise<THREE.Group | null> {
  const assetPath = slotAssetPath(slot, variant)
  if (failedCache.has(assetPath)) return null

  const cached = templateCache.get(assetPath)
  if (cached) return cloneWithUniqueMaterials(cached)

  try {
    const gltf = await loader.loadAsync(assetPath)
    const source = gltf.scene as THREE.Group
    templateCache.set(assetPath, source)
    return cloneWithUniqueMaterials(source)
  } catch {
    failedCache.add(assetPath)
    return null
  }
}

function slotAssetPath(slot: ModularSlot, variant: string): string {
  return new URL(`./modular/${slot}/${variant}.glb`, import.meta.url).href
}

function normalizePart(source: THREE.Group, targetHeight: number): THREE.Group {
  const root = source.clone(true) as THREE.Group
  root.updateMatrixWorld(true)

  const box = new THREE.Box3().setFromObject(root)
  if (box.isEmpty()) return root

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const scale = targetHeight / Math.max(size.y, 0.001)

  root.scale.setScalar(scale)
  root.position.copy(center).multiplyScalar(-scale)
  root.updateMatrixWorld(true)

  const grounded = new THREE.Box3().setFromObject(root)
  root.position.y -= grounded.min.y
  root.updateMatrixWorld(true)

  const centered = new THREE.Box3().setFromObject(root)
  const centeredPoint = centered.getCenter(new THREE.Vector3())
  root.position.x -= centeredPoint.x
  root.position.z -= centeredPoint.z
  root.updateMatrixWorld(true)

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = true
    obj.receiveShadow = true
  })

  return root
}

function cloneWithUniqueMaterials(source: THREE.Object3D): THREE.Group {
  const cloned = source.clone(true) as THREE.Group
  cloned.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((material) => material.clone())
      return
    }
    obj.material = obj.material.clone()
  })
  return cloned
}

function createFallbackPart(slot: ModularSlot): THREE.Group {
  const group = new THREE.Group()
  const material = new THREE.MeshStandardMaterial({
    color: SLOT_COLOR[slot],
    roughness: 0.72,
    metalness: 0.1,
  })

  if (slot === 'legs') {
    const legGeometry = new THREE.CylinderGeometry(0.12, 0.13, 0.88, 12)
    const left = new THREE.Mesh(legGeometry, material)
    left.position.set(-0.14, 0.44, 0)
    const right = new THREE.Mesh(legGeometry.clone(), material.clone())
    right.position.set(0.14, 0.44, 0)
    group.add(left, right)
  } else if (slot === 'torso') {
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.42, 6, 12), material)
    torso.position.y = 0.43
    group.add(torso)
  } else {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 20, 16), material)
    head.position.y = 0.28
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0x0f244d,
        roughness: 0.2,
        metalness: 0.65,
      }),
    )
    visor.position.set(0, 0.3, 0.22)
    group.add(head, visor)
  }

  group.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.castShadow = true
    obj.receiveShadow = true
  })

  return group
}

export function disposeModularAvatar(root: THREE.Object3D): void {
  disposeObject3D(root)
}
