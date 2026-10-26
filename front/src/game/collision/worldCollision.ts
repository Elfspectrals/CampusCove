import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Collider, World } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { refreshCollisionDebug } from './collisionDebug'

const CAPSULE_HALF_HEIGHT = 0.55
const CAPSULE_RADIUS = 0.35
const CAPSULE_CENTER_Y = 0.9
const CONTROLLER_OFFSET = 0.02
const BORDER_WALL_THICKNESS = 0.5
const BORDER_WALL_HEIGHT = 8

export interface CollisionCuboidJson {
  name?: string
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
  qx: number
  qy: number
  qz: number
  qw: number
}

export interface CollisionTrimeshJson {
  name?: string
  /** Flat XYZ world positions */
  vertices: number[]
  indices: number[]
}

export interface CollisionFileJson {
  version: number
  source?: string
  mode?: string
  borders?: boolean
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number } | null
  cuboids: CollisionCuboidJson[]
  trimeshes?: CollisionTrimeshJson[]
}

export interface WorldCollisionStats {
  cuboids: number
  trimeshes: number
  trimeshTris: number
  borderWalls: number
  sourceUrl: string | null
  mode: string | null
}

const stats: WorldCollisionStats = {
  cuboids: 0,
  trimeshes: 0,
  trimeshTris: 0,
  borderWalls: 0,
  sourceUrl: null,
  mode: null,
}

let world: World | null = null
let initPromise: Promise<void> | null = null
let builtUrl: string | null = null
let buildInFlight: Promise<void> | null = null
let collidersReady = false
let loadedCuboids: CollisionCuboidJson[] = []
let loadedTrimeshes: CollisionTrimeshJson[] = []

let characterController: RAPIER.KinematicCharacterController | null = null
let playerBody: RAPIER.RigidBody | null = null
let playerCollider: Collider | null = null
const doorBlockers = new Map<string, RAPIER.RigidBody>()

const desiredDelta = new RAPIER.Vector3(0, 0, 0)

function resetStats(): void {
  stats.cuboids = 0
  stats.trimeshes = 0
  stats.trimeshTris = 0
  stats.borderWalls = 0
  stats.sourceUrl = null
  stats.mode = null
  loadedCuboids = []
  loadedTrimeshes = []
}

function addFixedCuboid(
  w: World,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): RAPIER.RigidBody {
  const body = w.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(cx, cy, cz)
      .setRotation(new RAPIER.Quaternion(qx, qy, qz, qw)),
  )
  w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body)
  return body
}

function addFixedTrimesh(w: World, vertices: number[], indices: number[]): void {
  if (vertices.length < 9 || indices.length < 3) return
  const verts = new Float32Array(vertices)
  const idx = new Uint32Array(indices)
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const desc = RAPIER.ColliderDesc.trimesh(verts, idx)
  if (!desc) return
  w.createCollider(desc, body)
}

function addBorderWalls(
  w: World,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
): void {
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
  const halfX = (bounds.maxX - bounds.minX) * 0.5
  const halfZ = (bounds.maxZ - bounds.minZ) * 0.5
  const wallHalfHeight = BORDER_WALL_HEIGHT * 0.5
  const wallHalfThickness = BORDER_WALL_THICKNESS * 0.5
  const wallY = wallHalfHeight

  const configs: Array<{ cx: number; cy: number; cz: number; hx: number; hy: number; hz: number }> = [
    {
      cx: bounds.maxX + wallHalfThickness,
      cy: wallY,
      cz: centerZ,
      hx: wallHalfThickness,
      hy: wallHalfHeight,
      hz: halfZ + wallHalfThickness,
    },
    {
      cx: bounds.minX - wallHalfThickness,
      cy: wallY,
      cz: centerZ,
      hx: wallHalfThickness,
      hy: wallHalfHeight,
      hz: halfZ + wallHalfThickness,
    },
    {
      cx: centerX,
      cy: wallY,
      cz: bounds.maxZ + wallHalfThickness,
      hx: halfX + wallHalfThickness,
      hy: wallHalfHeight,
      hz: wallHalfThickness,
    },
    {
      cx: centerX,
      cy: wallY,
      cz: bounds.minZ - wallHalfThickness,
      hx: halfX + wallHalfThickness,
      hy: wallHalfHeight,
      hz: wallHalfThickness,
    },
  ]

  for (const c of configs) {
    addFixedCuboid(w, c.cx, c.cy, c.cz, c.hx, c.hy, c.hz, 0, 0, 0, 1)
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
  doorBlockers.clear()
}

async function buildFromCollisionData(url: string, data: CollisionFileJson): Promise<void> {
  disposeWorld()
  const w = await ensureWorld()
  resetStats()
  collidersReady = false
  stats.sourceUrl = url
  stats.mode = data.mode ?? null
  loadedCuboids = data.cuboids ?? []
  loadedTrimeshes = data.trimeshes ?? []

  for (const c of loadedCuboids) {
    addFixedCuboid(w, c.cx, c.cy, c.cz, c.hx, c.hy, c.hz, c.qx, c.qy, c.qz, c.qw)
    stats.cuboids += 1
  }

  for (const t of loadedTrimeshes) {
    addFixedTrimesh(w, t.vertices, t.indices)
    stats.trimeshes += 1
    stats.trimeshTris += Math.floor((t.indices?.length ?? 0) / 3)
  }

  if (data.borders && data.bounds) {
    addBorderWalls(w, data.bounds)
  }

  w.step()
  collidersReady = true
  refreshCollisionDebug(loadedCuboids, loadedTrimeshes)
}

export async function fetchCollisionFile(url: string): Promise<CollisionFileJson> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load collision file ${url}: ${res.status}`)
  }
  return (await res.json()) as CollisionFileJson
}

/**
 * Load a sidecar `.collision.json` (produced by `npm run collision:extract` / `make assets-optimize`)
 * into the Rapier world. Calls with the URL already loaded are no-ops.
 */
export function buildWorldCollisionFromUrl(url: string): Promise<void> {
  if (builtUrl === url && collidersReady) {
    return Promise.resolve()
  }
  if (builtUrl === url && buildInFlight) {
    return buildInFlight
  }

  builtUrl = url
  buildInFlight = (async () => {
    const data = await fetchCollisionFile(url)
    await buildFromCollisionData(url, data)
    console.info(
      `[collision] loaded ${url}: ${stats.cuboids} cuboids, ${stats.trimeshes} trimeshes (${stats.trimeshTris} tris), ${stats.borderWalls} borders, mode=${stats.mode ?? 'n/a'}`,
    )
  })()
    .catch((err) => {
      builtUrl = null
      collidersReady = false
      throw err
    })
    .finally(() => {
      buildInFlight = null
    })
  return buildInFlight
}

/** Meshes that never block movement when building collision from a scene object. */
const OBJECT_SKIP_NAME_RE = /sky|leaf|flower|ivy|vine|grass|fern|rug|carpet/i
/** Only meshes overlapping the player's walking height can block. */
const OBJECT_WALK_BAND_MIN_Y = 0.5
const OBJECT_WALK_BAND_MAX_Y = 3

/**
 * Build collision straight from a loaded scene object (every visible mesh in the walking band
 * becomes a world-space trimesh), for models without a `.collision.json` sidecar — e.g. the
 * Blender-built CampusApartment interiors and the /NewNation showroom. `key` identifies the
 * source so repeated calls with the same key are no-ops.
 */
export function buildWorldCollisionFromObject(key: string, root: THREE.Object3D): Promise<void> {
  if (builtUrl === key && collidersReady) return Promise.resolve()
  if (builtUrl === key && buildInFlight) return buildInFlight

  builtUrl = key
  root.updateMatrixWorld(true)
  const trimeshes: CollisionTrimeshJson[] = []
  const bounds = new THREE.Box3()
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh) return
    for (let p: THREE.Object3D | null = obj; p; p = p.parent) {
      if (OBJECT_SKIP_NAME_RE.test(p.name)) return
    }
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    if (mats.every((m) => !m.visible)) return
    const pos = obj.geometry.getAttribute('position')
    if (!pos) return
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox()
    box.copy(obj.geometry.boundingBox!).applyMatrix4(obj.matrixWorld)
    if (box.max.y < OBJECT_WALK_BAND_MIN_Y || box.min.y > OBJECT_WALK_BAND_MAX_Y) return
    const vertices = new Array<number>(pos.count * 3)
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(obj.matrixWorld)
      vertices[i * 3] = v.x
      vertices[i * 3 + 1] = v.y
      vertices[i * 3 + 2] = v.z
    }
    const index = obj.geometry.index
    const indices = index ? Array.from(index.array as ArrayLike<number>) : Array.from({ length: pos.count }, (_, i) => i)
    trimeshes.push({ name: obj.name, vertices, indices })
    bounds.union(box)
  })

  const data: CollisionFileJson = {
    version: 1,
    source: key,
    mode: 'object',
    borders: !bounds.isEmpty(),
    bounds: bounds.isEmpty()
      ? null
      : { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z },
    cuboids: [],
    trimeshes,
  }
  buildInFlight = buildFromCollisionData(key, data)
    .catch((err) => {
      builtUrl = null
      collidersReady = false
      throw err
    })
    .finally(() => {
      buildInFlight = null
    })
  return buildInFlight
}

export function buildWorldCollisionFromData(key: string, data: CollisionFileJson): Promise<void> {
  if (builtUrl === key && collidersReady) return Promise.resolve()
  if (builtUrl === key && buildInFlight) return buildInFlight

  builtUrl = key
  buildInFlight = buildFromCollisionData(key, data)
    .catch((err) => {
      builtUrl = null
      collidersReady = false
      throw err
    })
    .finally(() => {
      buildInFlight = null
    })
  return buildInFlight
}

export function setDoorBlocker(key: string, cuboid: CollisionCuboidJson | null): void {
  if (!world || !collidersReady) return
  const existing = doorBlockers.get(key)
  if (cuboid === null) {
    if (!existing) return
    world.removeRigidBody(existing)
    doorBlockers.delete(key)
  } else {
    if (existing) return
    const c = cuboid
    doorBlockers.set(key, addFixedCuboid(world, c.cx, c.cy, c.cz, c.hx, c.hy, c.hz, c.qx, c.qy, c.qz, c.qw))
  }
  world.step()
}

export function getWorldCollisionStats(): Readonly<WorldCollisionStats> {
  return stats
}

export function resolveWorldMovement(
  current: { x: number; y: number; z: number },
  dx: number,
  dz: number,
): { x: number; z: number } {
  const blocked = { x: current.x, z: current.z }
  if (
    !collidersReady ||
    !world ||
    !characterController ||
    !playerBody ||
    !playerCollider ||
    !playerCollider.isValid()
  ) {
    return blocked
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
