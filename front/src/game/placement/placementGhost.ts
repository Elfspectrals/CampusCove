/**
 * Translucent preview of the item being placed: a coloured cube until the item's GLB is loaded, tinted green
 * when the spot is free and red when it overlaps, with a short shake + flash when a placement is refused.
 */
import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { createGltfLoader } from '../gltfLoaderFactory'

const VALID_COLOR = 0x00ff88
const VALID_EMISSIVE_INT = 1.2
const VALID_OPACITY_BASE = 0.7

const INVALID_COLOR = 0xff3344
const INVALID_EMISSIVE_INT = 1.4
const INVALID_OPACITY_BASE = 0.65

const GHOST_RENDER_ORDER = 999
const VALIDITY_COLOR_BLEND_MS = 120
const DENY_SHAKE_MS = 150

export const DEFAULT_GHOST_COLOR = '#8B7AA8'

function lerpHex(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function makeGhostMaterial(colorHex: string): THREE.MeshStandardMaterial {
  const col = new THREE.Color(colorHex)
  return new THREE.MeshStandardMaterial({
    color: col,
    emissive: col,
    emissiveIntensity: VALID_EMISSIVE_INT,
    transparent: true,
    opacity: VALID_OPACITY_BASE,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  })
}

export function createPlacementGhost() {
  /** Positioned by the placement system; the visual content is swapped underneath. */
  const root = new THREE.Group()
  root.name = 'ApartmentPlacementGhost'

  let content: THREE.Object3D | null = null
  const materials: THREE.MeshStandardMaterial[] = []
  const loader = createGltfLoader()
  const templateCache = new Map<string, THREE.Object3D>()

  let valid = true
  let validityBlend = 1
  let colorLerpRemaining = 0
  let colorLerpFrom = 1
  let colorLerpTo = 1
  let denyShakeMsRemaining = 0
  let denyShakeIntensity = 0
  let denyFlashEmissiveBoost = 0
  let time = 0

  function hasContent(): boolean {
    return content !== null
  }

  function setContent(next: THREE.Object3D): void {
    clear()
    content = next
    root.add(next)
    next.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) materials.push(o.material)
    })
  }

  function clear(): void {
    if (!content) return
    root.remove(content)
    disposeObject3D(content)
    content = null
    materials.length = 0
  }

  /** Unit cube shown immediately while the real model loads (or when there is none). */
  function showPlaceholder(colorHex: string): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), makeGhostMaterial(colorHex))
    mesh.renderOrder = GHOST_RENDER_ORDER
    setContent(mesh)
  }

  async function loadTemplate(url: string): Promise<THREE.Object3D | null> {
    const cached = templateCache.get(url)
    if (cached) return cached.clone(true)
    try {
      const gltf = await loader.loadAsync(url)
      templateCache.set(url, gltf.scene)
      return gltf.scene.clone(true)
    } catch {
      return null
    }
  }

  /** Replace the placeholder by the GLB, unless `stillWanted()` says the preview changed meanwhile. */
  async function upgradeToModel(url: string, colorHex: string, stillWanted: () => boolean): Promise<void> {
    const model = await loadTemplate(url)
    if (!model || !stillWanted()) return
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      o.material = makeGhostMaterial(colorHex)
      o.renderOrder = GHOST_RENDER_ORDER
      o.castShadow = false
      o.receiveShadow = false
    })
    // same anchor as the placed props: model feet half a unit below the anchor cube centre
    model.position.set(0, -0.5, 0)
    const wrapper = new THREE.Group()
    wrapper.add(model)
    setContent(wrapper)
  }

  /** Start blending towards the green or red palette. Returns false when the validity did not change. */
  function setValid(next: boolean): boolean {
    if (next === valid) return false
    valid = next
    colorLerpFrom = validityBlend
    colorLerpTo = next ? 1 : 0
    colorLerpRemaining = VALIDITY_COLOR_BLEND_MS / 1000
    return true
  }

  function deny(): void {
    denyShakeMsRemaining = DENY_SHAKE_MS
    denyShakeIntensity = 0.06
    denyFlashEmissiveBoost = 0.85
  }

  function resetFeedback(): void {
    valid = true
    validityBlend = 1
    colorLerpFrom = 1
    colorLerpTo = 1
    colorLerpRemaining = 0
    denyShakeMsRemaining = 0
    denyFlashEmissiveBoost = 0
  }

  /** Decay the deny shake / flash; `restPosition` is where the ghost settles when the shake ends. */
  function tickFeedback(dt: number, restPosition: THREE.Vector3): void {
    time += dt
    if (denyShakeMsRemaining > 0) {
      denyShakeMsRemaining = Math.max(0, denyShakeMsRemaining - dt * 1000)
      const t = denyShakeMsRemaining / DENY_SHAKE_MS
      denyShakeIntensity *= t > 0 ? t : 0
      if (denyShakeMsRemaining <= 0) {
        denyShakeIntensity = 0
        root.position.copy(restPosition)
      }
    }
    if (denyFlashEmissiveBoost > 0) {
      denyFlashEmissiveBoost = Math.max(0, denyFlashEmissiveBoost - dt * 4)
    }
  }

  /** Sideways jitter while a refusal is being shown (call after positioning the ghost). */
  function applyShake(): void {
    if (denyShakeMsRemaining > 0 && denyShakeIntensity > 0) {
      root.translateX(Math.sin(time * 40) * denyShakeIntensity)
    }
  }

  /** Advance the green/red blend and the opacity pulse, then paint every ghost material. */
  function updateColors(dt: number): void {
    if (colorLerpRemaining > 0) {
      colorLerpRemaining = Math.max(0, colorLerpRemaining - dt)
      const span = VALIDITY_COLOR_BLEND_MS / 1000
      validityBlend = THREE.MathUtils.lerp(colorLerpFrom, colorLerpTo, 1 - colorLerpRemaining / span)
    } else {
      validityBlend = colorLerpTo
    }
    const color = lerpHex(INVALID_COLOR, VALID_COLOR, validityBlend)
    const emissiveIntensity = INVALID_EMISSIVE_INT + (VALID_EMISSIVE_INT - INVALID_EMISSIVE_INT) * validityBlend
    const opacityBase = INVALID_OPACITY_BASE + (VALID_OPACITY_BASE - INVALID_OPACITY_BASE) * validityBlend
    const opacity = Math.max(0.08, Math.min(1, opacityBase + Math.sin(time * 3) * 0.05))
    for (const m of materials) {
      m.color.setHex(color)
      m.emissive.setHex(color)
      m.emissiveIntensity = emissiveIntensity + denyFlashEmissiveBoost
      m.opacity = opacity
      m.transparent = true
      m.depthWrite = false
      m.needsUpdate = true
    }
  }

  return {
    root,
    hasContent,
    clear,
    showPlaceholder,
    upgradeToModel,
    setValid,
    deny,
    resetFeedback,
    tickFeedback,
    applyShake,
    updateColors,
  }
}
