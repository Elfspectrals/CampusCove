/** Wireframe overlay of the loaded collision shapes (C key in /game): cuboids red, synth platforms green, trimeshes blue. */
import * as THREE from 'three'
import type { CollisionCuboidJson, CollisionTrimeshJson } from './worldCollision'

let debugGroup: THREE.Group | null = null
let shownCuboids: readonly CollisionCuboidJson[] = []
let shownTrimeshes: readonly CollisionTrimeshJson[] = []

function clearDebugGroup(): void {
  if (!debugGroup) return
  debugGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
  debugGroup.parent?.remove(debugGroup)
  debugGroup = null
}

function rebuildDebugGroup(): void {
  const parent = debugGroup?.parent ?? null
  const wasVisible = debugGroup?.visible ?? false
  clearDebugGroup()
  debugGroup = new THREE.Group()
  debugGroup.name = 'CollisionDebug'
  debugGroup.visible = wasVisible

  for (const c of shownCuboids) {
    const isSynth = /^Synth_/i.test(c.name || '')
    const geom = new THREE.BoxGeometry(c.hx * 2, c.hy * 2, c.hz * 2)
    const mat = new THREE.MeshBasicMaterial({
      color: isSynth ? 0x44ff88 : 0xff5533,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.position.set(c.cx, c.cy, c.cz)
    mesh.quaternion.set(c.qx, c.qy, c.qz, c.qw)
    mesh.name = c.name || 'cuboid'
    debugGroup.add(mesh)
  }

  for (const t of shownTrimeshes) {
    const geom = new THREE.BufferGeometry()
    geom.setAttribute('position', new THREE.Float32BufferAttribute(t.vertices, 3))
    geom.setIndex(t.indices)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x33aaff,
      wireframe: true,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.name = t.name || 'trimesh'
    debugGroup.add(mesh)
  }

  if (parent) parent.add(debugGroup)
}

/** Toggle green/red wireframe cuboids in the scene (C key). Synth platforms are green. */
function setCollisionDebugVisible(scene: THREE.Scene, visible: boolean): boolean {
  if (!visible) {
    if (debugGroup) debugGroup.visible = false
    return false
  }
  if (!debugGroup || debugGroup.parent !== scene) {
    rebuildDebugGroup()
    if (debugGroup) scene.add(debugGroup)
  }
  if (debugGroup) debugGroup.visible = true
  return true
}

export function toggleCollisionDebug(scene: THREE.Scene): boolean {
  const next = !(debugGroup?.visible && debugGroup.parent === scene)
  return setCollisionDebugVisible(scene, next)
}

/** Called after each collision rebuild so the overlay (open or not) shows the new shapes. */
export function refreshCollisionDebug(
  cuboids: readonly CollisionCuboidJson[],
  trimeshes: readonly CollisionTrimeshJson[],
): void {
  shownCuboids = cuboids
  shownTrimeshes = trimeshes
  if (debugGroup) rebuildDebugGroup()
}
