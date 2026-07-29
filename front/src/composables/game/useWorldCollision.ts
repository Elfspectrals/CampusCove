import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Collider, World } from '@dimforge/rapier3d-compat'
import * as THREE from 'three'

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
let debugGroup: THREE.Group | null = null

let characterController: RAPIER.KinematicCharacterController | null = null
let playerBody: RAPIER.RigidBody | null = null
let playerCollider: Collider | null = null

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
): void {
  const body = w.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(cx, cy, cz)
      .setRotation(new RAPIER.Quaternion(qx, qy, qz, qw)),
  )
  w.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz), body)
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
}

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

  for (const c of loadedCuboids) {
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

  for (const t of loadedTrimeshes) {
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
  if (debugGroup) rebuildDebugGroup()
}

/**
 * Load a sidecar `.collision.json` (produced by `npm run collision:extract` /
 * `make optimize` / `map-optimize` / `apartment-optimize`) into the Rapier world.
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
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to load collision file ${url}: ${res.status}`)
    }
    const data = (await res.json()) as CollisionFileJson
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

export function getWorldCollisionStats(): Readonly<WorldCollisionStats> {
  return stats
}

export function getLoadedCollisionCuboids(): readonly CollisionCuboidJson[] {
  return loadedCuboids
}

/** Toggle green/red wireframe cuboids in the scene (C key). Synth platforms are green. */
export function setCollisionDebugVisible(scene: THREE.Scene, visible: boolean): boolean {
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
    buildFromUrl: buildWorldCollisionFromUrl,
    resolveMovement: resolveWorldMovement,
    getStats: getWorldCollisionStats,
    toggleDebug: toggleCollisionDebug,
  }
}
