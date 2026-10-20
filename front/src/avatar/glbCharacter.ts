import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { createGltfLoader } from '../game/gltfLoaderFactory'
import type { CosmeticColors } from '../api/characterCosmetics'
import { DEFAULT_SLOT_COLORS, SLOT_ORDER } from '../api/characterCosmetics'
import { DEFAULT_SKIN } from '../game/assets/catalog'
import { AvatarClipSelector, clampDt } from './avatarAnimationLogic'

/** Animation clips per loaded / cloned root (kept out of userData, which three JSON-clones). */
const clipsByRoot = new WeakMap<THREE.Object3D, THREE.AnimationClip[]>()
const animStateByRoot = new WeakMap<THREE.Object3D, AvatarAnimState>()

let templateRoot: THREE.Group | null = null
let loadFailed = false
const modelCache = new Map<string, Promise<THREE.Group | null>>()

/**
 * Loads the default skin (catalog DEFAULT_SKIN, public/assets/skins/campus_classic/model.glb) once,
 * centers and scales to ~1.75m tall (feet at y=0). Used when a player has no body skin equipped.
 */
export async function loadCharacterTemplate(): Promise<THREE.Group | null> {
  if (loadFailed) return null
  if (templateRoot) return templateRoot

  try {
    const loader = createGltfLoader()
    const url = DEFAULT_SKIN.modelUrl
    const gltf = await loader.loadAsync(url)
    const root = gltf.scene as THREE.Group
    clipsByRoot.set(root, gltf.animations)
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
      const loader = createGltfLoader()
      const gltf = await loader.loadAsync(normalized)
      const root = gltf.scene as THREE.Group
      clipsByRoot.set(root, gltf.animations)
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

/** True for rigged (skinned) models such as the premium skins. */
export function hasSkinnedMesh(root: THREE.Object3D): boolean {
  let found = false
  root.traverse((obj) => {
    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) found = true
  })
  return found
}

/** Remember the animation clips of a loaded model so its clones can animate (see attachAvatarAnimations). */
export function setCharacterClips(root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
  clipsByRoot.set(root, clips)
}

/**
 * Clone for one avatar instance.
 * - Static skins: deep clone with unique materials so each instance can be tinted independently.
 * - Rigged skins: own skeleton per instance (otherwise every clone shares and fights over one pose), but geometry and
 *   materials stay shared with the cached template (they are never tinted) and are flagged so `disposeObject3D`
 *   does not free what other instances still use. Skinned meshes are never frustum-culled: their bounds are the
 *   bind pose, which the cape / halo / orbiting crystals leave.
 */
export function cloneCharacterWithUniqueMaterials(source: THREE.Object3D): THREE.Group {
  const rigged = hasSkinnedMesh(source)
  const c = (rigged ? cloneSkinned(source) : source.clone(true)) as THREE.Group
  clipsByRoot.set(c, clipsByRoot.get(source) ?? [])
  c.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return
    obj.userData.sharedGeometry = true // clones always share the template's geometry
    if (rigged) {
      obj.userData.sharedMaterials = true
      obj.frustumCulled = false
      return
    }
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => m.clone())
    } else {
      obj.material = obj.material.clone()
    }
  })
  return c
}

/**
 * Single-material GLB (Sketchfab export): blend all slot hexes for a balanced tint.
 * Multi-material skins (the Blender-built ones in assets/skins/: skin, hair, textured clothes) carry
 * their own look, so they are left untouched.
 */
export function applyCosmeticColors(root: THREE.Object3D, colors: CosmeticColors): void {
  // rigged premium skins share their materials across instances and are never tinted
  if (hasSkinnedMesh(root)) return
  const materials = new Set<string>()
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.material) return
    for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) materials.add(m.name || m.uuid)
  })
  if (materials.size > 1) return
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
  attachAvatarAnimations(instance)
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
  attachAvatarAnimations(instance)
  return instance
}

interface AvatarAnimState {
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  current: THREE.AnimationAction | null
  selector: AvatarClipSelector
}

const CROSSFADE_S = 0.22

/**
 * Premium skins ship rigged with "Idle" / "Walk" / "Run" clips. Starts a mixer on the instance (no-op for
 * the legacy static skins, which have no clips).
 */
export function attachAvatarAnimations(root: THREE.Object3D): void {
  const clips = clipsByRoot.get(root) ?? []
  if (clips.length === 0) return
  const mixer = new THREE.AnimationMixer(root)
  const actions = new Map<string, THREE.AnimationAction>()
  for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip))
  const state: AvatarAnimState = { mixer, actions, current: null, selector: new AvatarClipSelector() }
  animStateByRoot.set(root, state)
  playClip(state, 'Idle', 1)
}

function playClip(state: AvatarAnimState, name: string, timeScale: number): void {
  const next = state.actions.get(name)
  if (!next) return
  next.timeScale = timeScale
  if (state.current === next) return
  next.reset().setEffectiveWeight(1).play()
  if (state.current) state.current.crossFadeTo(next, CROSSFADE_S, false)
  state.current = next
}

/** True when the instance has a running mixer (rigged skin). */
export function hasAvatarAnimations(root: THREE.Object3D): boolean {
  return animStateByRoot.has(root)
}

/**
 * Advance the avatar's clips; `speed` is its horizontal speed in m/s (picks Idle / Walk / Run, smoothed with
 * hysteresis). `dt` is clamped so a background tab can't fast-forward the animation.
 */
export function updateAvatarAnimation(root: THREE.Object3D, dt: number, speed: number): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  const { clip, timeScale } = state.selector.update(dt, speed)
  playClip(state, clip, timeScale)
  state.mixer.update(clampDt(dt))
}

/** Stop and forget an instance's mixer (call before disposing the avatar). */
export function disposeAvatarAnimations(root: THREE.Object3D): void {
  const state = animStateByRoot.get(root)
  if (!state) return
  state.mixer.stopAllAction()
  state.mixer.uncacheRoot(root)
  animStateByRoot.delete(root)
}
