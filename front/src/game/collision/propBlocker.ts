/**
 * Player collision for placed furniture: one oriented box around the prop's model, registered in the world
 * collision so the player walks around it instead of through it.
 */
import * as THREE from 'three'
import { setPropBlocker, type CollisionCuboidJson } from './worldCollision'

/** Rugs, carpets and other near-flat props never block. */
const FLAT_PROP_MAX_HEIGHT = 0.15
const FLAT_PROP_NAME_RE = /rug|carpet|mat\b/i

const corner = new THREE.Vector3()
const invRoot = new THREE.Matrix4()

/**
 * World-space oriented box of `root`'s meshes. When the root holds a loaded model (`isApartmentVisual` child),
 * its own 1×1×1 anchor cube is left out so small props are not inflated to a metre cube.
 */
export function propCuboidOf(root: THREE.Object3D): CollisionCuboidJson | null {
  root.updateMatrixWorld(true)
  invRoot.copy(root.matrixWorld).invert()
  const hasVisual = root.children.some((c) => c.userData.isApartmentVisual === true)
  const box = new THREE.Box3()
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return
    if (hasVisual && obj === root) return
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
    const bb = obj.geometry.boundingBox
    if (!bb) return
    for (const x of [bb.min.x, bb.max.x]) {
      for (const y of [bb.min.y, bb.max.y]) {
        for (const z of [bb.min.z, bb.max.z]) {
          box.expandByPoint(corner.set(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(invRoot))
        }
      }
    }
  })
  if (box.isEmpty()) return null

  const scale = root.getWorldScale(new THREE.Vector3())
  const half = box.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(0.5)
  const center = box.getCenter(new THREE.Vector3()).applyMatrix4(root.matrixWorld)
  const q = root.getWorldQuaternion(new THREE.Quaternion())
  return { cx: center.x, cy: center.y, cz: center.z, hx: half.x, hy: half.y, hz: half.z, qx: q.x, qy: q.y, qz: q.z, qw: q.w }
}

function isFlatProp(mesh: THREE.Mesh, cuboid: CollisionCuboidJson): boolean {
  if (FLAT_PROP_NAME_RE.test(String(mesh.userData.apartmentObjectKey ?? ''))) return true
  // world-space height of the oriented box
  const up = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion(cuboid.qx, cuboid.qy, cuboid.qz, cuboid.qw)
  const height =
    2 *
    (Math.abs(new THREE.Vector3(cuboid.hx, 0, 0).applyQuaternion(q).dot(up)) +
      Math.abs(new THREE.Vector3(0, cuboid.hy, 0).applyQuaternion(q).dot(up)) +
      Math.abs(new THREE.Vector3(0, 0, cuboid.hz).applyQuaternion(q).dot(up)))
  return height < FLAT_PROP_MAX_HEIGHT
}

/** Make a placed prop block the player where it now stands, or stop blocking once it is hidden / gone. */
export function syncPropBlocker(objectId: string, mesh: THREE.Mesh | null): void {
  const key = `prop:${objectId}`
  if (!mesh || !mesh.visible || !mesh.parent) {
    setPropBlocker(key, null)
    return
  }
  const cuboid = propCuboidOf(mesh)
  setPropBlocker(key, cuboid && !isFlatProp(mesh, cuboid) ? cuboid : null)
}
