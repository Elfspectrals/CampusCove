/**
 * Rapier world used while decorating a house: the room shell (floor, ceiling, walls, door) plus one kinematic
 * box per placed prop, so the placement ghost can be tested for overlaps.
 */
import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Collider, World } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import {
  APARTMENT_DOOR_POS,
  APARTMENT_HALF_EXTENT,
  APARTMENT_ROOM_HEIGHT,
  APARTMENT_WALL_THICKNESS,
} from '../gameRoomConstants'

interface PropPhysicsUserData {
  kind: 'apartmentPlacementProp'
  objectId: string
}

interface StaticPhysicsUserData {
  kind: 'apartmentPlacementStatic'
  subkind: 'floor' | 'ceiling' | 'wall' | 'door'
}

function isPropPhysicsUserData(v: unknown): v is PropPhysicsUserData {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as PropPhysicsUserData).kind === 'apartmentPlacementProp' &&
    typeof (v as PropPhysicsUserData).objectId === 'string'
  )
}

function isStaticPhysicsUserData(v: unknown): v is StaticPhysicsUserData {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as StaticPhysicsUserData).kind === 'apartmentPlacementStatic' &&
    typeof (v as StaticPhysicsUserData).subkind === 'string'
  )
}

/** Id of a placed prop mesh ('' when the mesh is not one). */
export function apartmentObjectIdOf(obj: THREE.Object3D): string {
  return typeof obj.userData.apartmentObjectId === 'string' ? obj.userData.apartmentObjectId : ''
}

/** Local AABB of mesh hierarchy; half extents and center in mesh root space. */
function computePlacementLocalAabb(root: THREE.Object3D): { halfExtents: THREE.Vector3; centerLocal: THREE.Vector3 } {
  const box = new THREE.Box3()
  const corner = new THREE.Vector3()
  root.updateMatrixWorld(true)
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  let found = false
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return
    const geom = obj.geometry
    if (!geom.boundingBox) geom.computeBoundingBox()
    const bb = geom.boundingBox
    if (!bb) return
    const { min, max } = bb
    for (const x of [min.x, max.x]) {
      for (const y of [min.y, max.y]) {
        for (const z of [min.z, max.z]) {
          corner.set(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(invRoot)
          box.expandByPoint(corner)
          found = true
        }
      }
    }
  })
  if (!found) {
    box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
  }
  const centerLocal = box.getCenter(new THREE.Vector3())
  const halfExtents = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  const minHalf = 0.04
  halfExtents.x = Math.max(halfExtents.x, minHalf)
  halfExtents.y = Math.max(halfExtents.y, minHalf)
  halfExtents.z = Math.max(halfExtents.z, minHalf)
  return { halfExtents, centerLocal }
}

function addStaticBox(
  w: World,
  subkind: StaticPhysicsUserData['subkind'],
  [x, y, z]: [number, number, number],
  [hx, hy, hz]: [number, number, number],
): void {
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
  const userData: StaticPhysicsUserData = { kind: 'apartmentPlacementStatic', subkind }
  body.userData = userData as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body)
}

function addApartmentStaticColliders(w: World): void {
  const e = APARTMENT_HALF_EXTENT
  const h = APARTMENT_ROOM_HEIGHT
  const t = APARTMENT_WALL_THICKNESS
  addStaticBox(w, 'floor', [0, -t / 2, 0], [e, t / 2, e])
  addStaticBox(w, 'ceiling', [0, h + t / 2, 0], [e, t / 2, e])
  addStaticBox(w, 'wall', [0, h / 2, -e], [e, h / 2, t / 2])
  addStaticBox(w, 'wall', [0, h / 2, e], [e, h / 2, t / 2])
  addStaticBox(w, 'wall', [-e, h / 2, 0], [t / 2, h / 2, e])
  addStaticBox(w, 'wall', [e, h / 2, 0], [t / 2, h / 2, e])
  addStaticBox(w, 'door', [APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z], [0.6, 1.1, 0.05])
}

export function createPlacementPhysics() {
  let world: World | null = null
  let initPromise: Promise<void> | null = null
  const propBodies = new Map<string, RAPIER.RigidBody>()
  const propMeshById = new Map<string, THREE.Mesh>()
  /** Props registered before the world finished initialising. */
  const pendingMeshes: THREE.Mesh[] = []

  function isReady(): boolean {
    return world !== null
  }

  async function ensureReady(): Promise<void> {
    if (world) return
    if (!initPromise) {
      initPromise = (async () => {
        await RAPIER.init()
        const w = new RAPIER.World(new RAPIER.Vector3(0, 0, 0))
        addApartmentStaticColliders(w)
        world = w
        const pending = pendingMeshes.splice(0)
        for (const m of pending) registerProp(m)
      })()
    }
    await initPromise
  }

  function unregisterProp(objectId: string): void {
    const kept = pendingMeshes.filter((m) => apartmentObjectIdOf(m) !== objectId)
    pendingMeshes.splice(0, pendingMeshes.length, ...kept)
    propMeshById.delete(objectId)
    const body = propBodies.get(objectId)
    if (body && body.isValid() && world) world.removeRigidBody(body)
    propBodies.delete(objectId)
  }

  function registerProp(mesh: THREE.Mesh): void {
    const objectId = apartmentObjectIdOf(mesh)
    if (!objectId) return
    if (!world) {
      pendingMeshes.push(mesh)
      return
    }
    unregisterProp(objectId)
    const { halfExtents, centerLocal } = computePlacementLocalAabb(mesh)
    const pos = mesh.position
    const quat = mesh.quaternion
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(pos.x, pos.y, pos.z)
        .setRotation(new RAPIER.Quaternion(quat.x, quat.y, quat.z, quat.w)),
    )
    const userData: PropPhysicsUserData = { kind: 'apartmentPlacementProp', objectId }
    body.userData = userData as unknown
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setTranslation(centerLocal.x, centerLocal.y, centerLocal.z)
        .setDensity(0),
      body,
    )
    propBodies.set(objectId, body)
    propMeshById.set(objectId, mesh)
  }

  /** Copy every visible prop mesh pose into its body (skipping the prop being moved). */
  function syncProps(skipObjectId: string): void {
    if (!world) return
    for (const [id, mesh] of propMeshById) {
      if (id === skipObjectId || !mesh.visible) continue
      const body = propBodies.get(id)
      if (!body || !body.isValid()) continue
      const p = mesh.position
      const q = mesh.quaternion
      body.setTranslation(new RAPIER.Vector3(p.x, p.y, p.z), true)
      body.setRotation(new RAPIER.Quaternion(q.x, q.y, q.z, q.w), true)
    }
    world.propagateModifiedBodyPositionsToColliders()
  }

  /**
   * Does the ghost's AABB overlap the room or another prop? The floor never counts (the ghost rests on it),
   * nor `ignoredObjectIds` (the moved prop, and the prop the ghost is stacked on).
   */
  function ghostIntersects(ghost: THREE.Object3D, ignoredObjectIds: ReadonlySet<string>): boolean {
    if (!world) return false
    ghost.updateMatrixWorld(true)
    const { halfExtents, centerLocal } = computePlacementLocalAabb(ghost)
    const centerWorld = centerLocal.clone().applyMatrix4(ghost.matrixWorld)
    const q = ghost.quaternion
    let hit = false
    world.propagateModifiedBodyPositionsToColliders()
    world.intersectionsWithShape(
      new RAPIER.Vector3(centerWorld.x, centerWorld.y, centerWorld.z),
      new RAPIER.Quaternion(q.x, q.y, q.z, q.w),
      new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      () => {
        hit = true
        return false
      },
      undefined,
      undefined,
      undefined,
      undefined,
      (collider: Collider) => {
        const ud = collider.parent()?.userData as unknown
        if (isPropPhysicsUserData(ud)) return !ignoredObjectIds.has(ud.objectId)
        return !(isStaticPhysicsUserData(ud) && ud.subkind === 'floor')
      },
    )
    return hit
  }

  function dispose(): void {
    for (const body of propBodies.values()) {
      if (world && body.isValid()) world.removeRigidBody(body)
    }
    propBodies.clear()
    propMeshById.clear()
    pendingMeshes.length = 0
    world?.free()
    world = null
    initPromise = null
  }

  return { isReady, ensureReady, registerProp, unregisterProp, syncProps, ghostIntersects, dispose }
}
