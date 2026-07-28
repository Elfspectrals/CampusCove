import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Collider, World } from '@dimforge/rapier3d-compat'

const CAPSULE_HALF_HEIGHT = 0.55
const CAPSULE_RADIUS = 0.35
const CAPSULE_CENTER_Y = 0.9
const CONTROLLER_OFFSET = 0.02
const MAX_TRIMESH_TRIANGLES = 150_000
const MIN_HALF_EXTENT = 0.01
/** Player capsule walking band; colliders fully outside can never block. */
const WALK_BAND_MIN_Y = 0.3
const WALK_BAND_MAX_Y = 1.8
/** Instance footprints only use vertices below this local height (clips tree crowns to trunks). */
const FOOTPRINT_CLIP_LOCAL_Y = 2.5
const BORDER_WALL_THICKNESS = 0.5
const BORDER_WALL_HEIGHT = 8
const SKIP_NAME_RE = /sky|leaf|flower|ivy|vine|grass|fern/i

export interface WorldCollisionStats {
  instancedCuboids: number
  trimeshColliders: number
  meshCuboids: number
  borderWalls: number
  instancedMeshBatches: number
  regularMeshesCollided: number
  skippedDecorative: number
  skippedHeight: number
}

const stats: WorldCollisionStats = {
  instancedCuboids: 0,
  trimeshColliders: 0,
  meshCuboids: 0,
  borderWalls: 0,
  instancedMeshBatches: 0,
  regularMeshesCollided: 0,
  skippedDecorative: 0,
  skippedHeight: 0,
}

let world: World | null = null
let initPromise: Promise<void> | null = null
let builtGroup: THREE.Object3D | null = null
let buildInFlight: Promise<void> | null = null
let collidersReady = false

let characterController: RAPIER.KinematicCharacterController | null = null
let playerBody: RAPIER.RigidBody | null = null
let playerCollider: Collider | null = null

const tmpMatrix = new THREE.Matrix4()
const tmpPosition = new THREE.Vector3()
const tmpQuaternion = new THREE.Quaternion()
const tmpScale = new THREE.Vector3()
const tmpCenter = new THREE.Vector3()
const tmpHalfExtents = new THREE.Vector3()
const tmpBox = new THREE.Box3()
const tmpVertex = new THREE.Vector3()
const identityQuat = new THREE.Quaternion()

const desiredDelta = new RAPIER.Vector3(0, 0, 0)

function resetStats(): void {
  stats.instancedCuboids = 0
  stats.trimeshColliders = 0
  stats.meshCuboids = 0
  stats.borderWalls = 0
  stats.instancedMeshBatches = 0
  stats.regularMeshesCollided = 0
  stats.skippedDecorative = 0
  stats.skippedHeight = 0
}

function shouldSkipByName(obj: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = obj
  while (current) {
    if (SKIP_NAME_RE.test(current.name)) return true
    current = current.parent
  }
  return false
}

function clampHalfExtents(halfExtents: THREE.Vector3): void {
  halfExtents.x = Math.max(halfExtents.x, MIN_HALF_EXTENT)
  halfExtents.y = Math.max(halfExtents.y, MIN_HALF_EXTENT)
  halfExtents.z = Math.max(halfExtents.z, MIN_HALF_EXTENT)
}

/**
 * Local-space footprint box built only from vertices below FOOTPRINT_CLIP_LOCAL_Y.
 * For walls this matches the full footprint; for trees it shrinks the box to the
 * trunk instead of blocking a crown-sized area. Returns null when the geometry
 * has no vertices near the ground (e.g. hanging decor).
 */
function getGeometryFootprintBox(geometry: THREE.BufferGeometry): {
  center: THREE.Vector3
  halfExtents: THREE.Vector3
} | null {
  const posAttr = geometry.getAttribute('position')
  if (!posAttr) return null
  const bb = new THREE.Box3()
  let found = false
  for (let i = 0; i < posAttr.count; i++) {
    tmpVertex.fromBufferAttribute(posAttr as THREE.BufferAttribute, i)
    if (tmpVertex.y > FOOTPRINT_CLIP_LOCAL_Y) continue
    bb.expandByPoint(tmpVertex)
    found = true
  }
  if (!found) return null
  const center = bb.getCenter(new THREE.Vector3())
  const halfExtents = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  clampHalfExtents(halfExtents)
  return { center, halfExtents }
}

function addFixedCuboidCollider(
  w: World,
  position: THREE.Vector3,
  rotation: THREE.Quaternion,
  halfExtents: THREE.Vector3,
  centerOffset: THREE.Vector3,
): void {
  const body = w.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(new RAPIER.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w)),
  )
  const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setTranslation(
    centerOffset.x,
    centerOffset.y,
    centerOffset.z,
  )
  w.createCollider(desc, body)
}

function addInstancedMeshColliders(w: World, mesh: THREE.InstancedMesh): void {
  if (!mesh.geometry) return
  mesh.updateMatrixWorld(true)

  const footprint = getGeometryFootprintBox(mesh.geometry)
  if (!footprint) return
  const { center: localCenter, halfExtents: localHalfExtents } = footprint
  stats.instancedMeshBatches += 1

  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, tmpMatrix)
    tmpMatrix.premultiply(mesh.matrixWorld)
    tmpMatrix.decompose(tmpPosition, tmpQuaternion, tmpScale)

    tmpHalfExtents.set(
      Math.abs(localHalfExtents.x * tmpScale.x),
      Math.abs(localHalfExtents.y * tmpScale.y),
      Math.abs(localHalfExtents.z * tmpScale.z),
    )
    clampHalfExtents(tmpHalfExtents)

    tmpCenter.set(
      localCenter.x * tmpScale.x,
      localCenter.y * tmpScale.y,
      localCenter.z * tmpScale.z,
    )

    // Skip instances entirely outside the walking band (roofs, upper floors,
    // balconies): they can never block the ground-level capsule.
    const worldCenterY = tmpPosition.y + tmpCenter.y
    const top = worldCenterY + tmpHalfExtents.y
    const bottom = worldCenterY - tmpHalfExtents.y
    if (top < WALK_BAND_MIN_Y || bottom > WALK_BAND_MAX_Y) {
      stats.skippedHeight += 1
      continue
    }

    addFixedCuboidCollider(w, tmpPosition, tmpQuaternion, tmpHalfExtents, tmpCenter)
    stats.instancedCuboids += 1
  }
}

function meshWorldBox(mesh: THREE.Mesh): THREE.Box3 {
  mesh.updateMatrixWorld(true)
  if (mesh.geometry) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    if (mesh.geometry.boundingBox) {
      tmpBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld)
      return tmpBox.clone()
    }
  }
  return tmpBox.setFromObject(mesh).clone()
}

function buildWorldTrimesh(mesh: THREE.Mesh): {
  vertices: Float32Array
  indices: Uint32Array
  triangleCount: number
} | null {
  const geometry = mesh.geometry
  const posAttr = geometry.getAttribute('position')
  if (!posAttr) return null

  mesh.updateMatrixWorld(true)
  const matrix = mesh.matrixWorld
  const vertices = new Float32Array(posAttr.count * 3)

  for (let i = 0; i < posAttr.count; i++) {
    tmpVertex.fromBufferAttribute(posAttr as THREE.BufferAttribute, i).applyMatrix4(matrix)
    const base = i * 3
    vertices[base] = tmpVertex.x
    vertices[base + 1] = tmpVertex.y
    vertices[base + 2] = tmpVertex.z
  }

  const indexAttr = geometry.index
  let indices: Uint32Array
  if (indexAttr) {
    indices = new Uint32Array(indexAttr.count)
    for (let i = 0; i < indexAttr.count; i++) {
      indices[i] = indexAttr.getX(i)
    }
  } else {
    indices = new Uint32Array(posAttr.count)
    for (let i = 0; i < posAttr.count; i++) {
      indices[i] = i
    }
  }

  return { vertices, indices, triangleCount: indices.length / 3 }
}

function addRegularMeshCollider(w: World, mesh: THREE.Mesh): void {
  const worldBox = meshWorldBox(mesh)
  if (worldBox.max.y < 0.5 || worldBox.min.y > 3) {
    stats.skippedHeight += 1
    return
  }

  const trimeshData = buildWorldTrimesh(mesh)
  if (!trimeshData) return

  // Never approximate a huge mesh by its AABB: merged map-wide meshes (e.g.
  // all trees joined into one) would become a solid box covering everything.
  if (trimeshData.triangleCount > MAX_TRIMESH_TRIANGLES) {
    stats.meshCuboids += 1
    return
  }

  const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  w.createCollider(RAPIER.ColliderDesc.trimesh(trimeshData.vertices, trimeshData.indices), body)
  stats.trimeshColliders += 1
  stats.regularMeshesCollided += 1
}

function expandBoundsForColliderMesh(box: THREE.Box3, mesh: THREE.Mesh): void {
  if (shouldSkipByName(mesh)) return
  const worldBox = meshWorldBox(mesh)
  if (worldBox.max.y < 0.5 || worldBox.min.y > 3) return
  box.union(worldBox)
}

function addBorderWalls(w: World, bounds: THREE.Box3): void {
  if (bounds.isEmpty()) return

  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const halfX = size.x * 0.5
  const halfZ = size.z * 0.5
  const wallHalfHeight = BORDER_WALL_HEIGHT * 0.5
  const wallHalfThickness = BORDER_WALL_THICKNESS * 0.5
  const wallY = center.y + wallHalfHeight

  const configs: Array<{ pos: THREE.Vector3; half: THREE.Vector3 }> = [
    {
      pos: new THREE.Vector3(bounds.max.x + wallHalfThickness, wallY, center.z),
      half: new THREE.Vector3(wallHalfThickness, wallHalfHeight, halfZ + wallHalfThickness),
    },
    {
      pos: new THREE.Vector3(bounds.min.x - wallHalfThickness, wallY, center.z),
      half: new THREE.Vector3(wallHalfThickness, wallHalfHeight, halfZ + wallHalfThickness),
    },
    {
      pos: new THREE.Vector3(center.x, wallY, bounds.max.z + wallHalfThickness),
      half: new THREE.Vector3(halfX + wallHalfThickness, wallHalfHeight, wallHalfThickness),
    },
    {
      pos: new THREE.Vector3(center.x, wallY, bounds.min.z - wallHalfThickness),
      half: new THREE.Vector3(halfX + wallHalfThickness, wallHalfHeight, wallHalfThickness),
    },
  ]

  for (const cfg of configs) {
    addFixedCuboidCollider(w, cfg.pos, identityQuat, cfg.half, new THREE.Vector3())
    stats.borderWalls += 1
  }
}

function ensureCharacterController(): void {
  if (!world || playerCollider) return

  playerBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().lockRotations())
  const colliderDesc = RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS).setActiveCollisionTypes(
    RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
  )
  playerCollider = world.createCollider(colliderDesc, playerBody)
  characterController = world.createCharacterController(CONTROLLER_OFFSET)
  characterController.setSlideEnabled(true)
}

async function ensureWorld(): Promise<World> {
  if (world) return world
  if (!initPromise) {
    initPromise = (async () => {
      await RAPIER.init()
      world = new RAPIER.World(new RAPIER.Vector3(0, 0, 0))
      ensureCharacterController()
    })()
  }
  await initPromise
  return world!
}

function disposeWorld(): void {
  if (world) {
    world.free()
  }
  world = null
  initPromise = null
  playerBody = null
  playerCollider = null
  characterController = null
  collidersReady = false
}

async function buildCollidersFromGroup(group: THREE.Object3D): Promise<void> {
  // Always rebuild from a clean world so HMR / re-enter never stacks stale colliders.
  disposeWorld()
  const w = await ensureWorld()
  resetStats()
  collidersReady = false

  group.updateMatrixWorld(true)

  const mapBounds = new THREE.Box3()

  group.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) {
      if (shouldSkipByName(obj)) {
        stats.skippedDecorative += 1
        return
      }
      addInstancedMeshColliders(w, obj)
      return
    }

    if (!(obj instanceof THREE.Mesh)) return
    if (shouldSkipByName(obj)) {
      stats.skippedDecorative += 1
      return
    }

    addRegularMeshCollider(w, obj)
    expandBoundsForColliderMesh(mapBounds, obj)
  })

  addBorderWalls(w, mapBounds)
  // One step registers all the new static colliders in the broad-phase; without
  // it, computeColliderMovement casts against an empty query structure and
  // nothing ever blocks movement.
  w.step()
  collidersReady = true
}

export function getWorldCollisionStats(): Readonly<WorldCollisionStats> {
  return stats
}

export function buildWorldCollisionFromGroup(group: THREE.Object3D): Promise<void> {
  if (builtGroup === group && collidersReady) {
    return Promise.resolve()
  }
  if (builtGroup === group && buildInFlight) {
    return buildInFlight
  }

  builtGroup = group
  buildInFlight = buildCollidersFromGroup(group).finally(() => {
    buildInFlight = null
  })
  return buildInFlight
}

export function resolveWorldMovement(
  current: { x: number; y: number; z: number },
  dx: number,
  dz: number,
): { x: number; z: number } {
  const fallback = { x: current.x + dx, z: current.z + dz }
  if (
    !collidersReady ||
    !world ||
    !characterController ||
    !playerBody ||
    !playerCollider ||
    !playerCollider.isValid()
  ) {
    return fallback
  }

  playerBody.setTranslation(new RAPIER.Vector3(current.x, CAPSULE_CENTER_Y, current.z), true)
  world.propagateModifiedBodyPositionsToColliders()

  desiredDelta.x = dx
  desiredDelta.y = 0
  desiredDelta.z = dz
  characterController.computeColliderMovement(playerCollider, desiredDelta)

  const movement = characterController.computedMovement()
  return { x: current.x + movement.x, z: current.z + movement.z }
}

export function useWorldCollision() {
  return {
    buildFromGroup: buildWorldCollisionFromGroup,
    resolveMovement: resolveWorldMovement,
    getStats: getWorldCollisionStats,
  }
}
