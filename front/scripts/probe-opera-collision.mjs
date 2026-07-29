import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as RAPIER from '@dimforge/rapier3d-compat'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Resolve from CampusCove/front when run via node with cwd or absolute import path
const root = process.env.CC_ROOT || path.resolve(__dirname, '..')
const collisionPath = path.join(root, 'public/maps/LobbyMap.collision.json')

const CAPSULE_HALF_HEIGHT = 0.55
const CAPSULE_RADIUS = 0.35
const CAPSULE_CENTER_Y = 0.9
const CONTROLLER_OFFSET = 0.02
const BORDER_WALL_THICKNESS = 0.5
const BORDER_WALL_HEIGHT = 8

const START = { x: -99.6, y: CAPSULE_CENTER_Y, z: 21.6 }
const TARGET = { x: -100.5, z: 24.5 } // toward Opera facade / into building

function addFixedCuboid(w, c) {
  const body = w.createRigidBody(
    RAPIER.RigidBodyDesc.fixed()
      .setTranslation(c.cx, c.cy, c.cz)
      .setRotation(new RAPIER.Quaternion(c.qx, c.qy, c.qz, c.qw)),
  )
  w.createCollider(RAPIER.ColliderDesc.cuboid(c.hx, c.hy, c.hz), body)
}

function addFixedTrimesh(w, t) {
  if (!t.vertices || t.vertices.length < 9 || !t.indices || t.indices.length < 3) {
    return { ok: false, reason: 'too few verts/indices' }
  }
  const verts = new Float32Array(t.vertices)
  const idx = new Uint32Array(t.indices)
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const desc = RAPIER.ColliderDesc.trimesh(verts, idx)
  if (!desc) return { ok: false, reason: 'ColliderDesc.trimesh returned null' }
  w.createCollider(desc, body)
  return { ok: true, verts: verts.length / 3, tris: idx.length / 3 }
}

function addBorderWalls(w, bounds) {
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
  const halfX = (bounds.maxX - bounds.minX) * 0.5
  const halfZ = (bounds.maxZ - bounds.minZ) * 0.5
  const wallHalfHeight = BORDER_WALL_HEIGHT * 0.5
  const wallHalfThickness = BORDER_WALL_THICKNESS * 0.5
  const wallY = wallHalfHeight
  const configs = [
    { cx: bounds.maxX + wallHalfThickness, cy: wallY, cz: centerZ, hx: wallHalfThickness, hy: wallHalfHeight, hz: halfZ + wallHalfThickness },
    { cx: bounds.minX - wallHalfThickness, cy: wallY, cz: centerZ, hx: wallHalfThickness, hy: wallHalfHeight, hz: halfZ + wallHalfThickness },
    { cx: centerX, cy: wallY, cz: bounds.maxZ + wallHalfThickness, hx: halfX + wallHalfThickness, hy: wallHalfHeight, hz: wallHalfThickness },
    { cx: centerX, cy: wallY, cz: bounds.minZ - wallHalfThickness, hx: halfX + wallHalfThickness, hy: wallHalfHeight, hz: wallHalfThickness },
  ]
  for (const c of configs) {
    addFixedCuboid(w, { ...c, qx: 0, qy: 0, qz: 0, qw: 1 })
  }
  return configs.length
}

function resolveMove(world, characterController, playerBody, playerCollider, current, dx, dz) {
  playerBody.setTranslation(new RAPIER.Vector3(current.x, CAPSULE_CENTER_Y, current.z), true)
  world.propagateModifiedBodyPositionsToColliders()
  characterController.computeColliderMovement(playerCollider, new RAPIER.Vector3(dx, 0, dz))
  const movement = characterController.computedMovement()
  return {
    desired: { dx, dz },
    actual: { dx: movement.x, dy: movement.y, dz: movement.z },
    next: { x: current.x + movement.x, z: current.z + movement.z },
    blockedRatio: Math.hypot(dx, dz) > 1e-9
      ? 1 - Math.hypot(movement.x, movement.z) / Math.hypot(dx, dz)
      : 0,
  }
}

await RAPIER.init()
const data = JSON.parse(fs.readFileSync(collisionPath, 'utf8'))
const world = new RAPIER.World(new RAPIER.Vector3(0, 0, 0))

let cuboids = 0
for (const c of data.cuboids ?? []) {
  addFixedCuboid(world, c)
  cuboids++
}

const trimeshResults = []
let operaLoaded = false
for (const t of data.trimeshes ?? []) {
  const r = addFixedTrimesh(world, t)
  const entry = { name: t.name || '(unnamed)', ...r }
  trimeshResults.push(entry)
  if ((t.name || '').includes('SM_Opera_A') && r.ok) operaLoaded = true
}

let borders = 0
if (data.borders && data.bounds) borders = addBorderWalls(world, data.bounds)

const playerBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().lockRotations())
const playerCollider = world.createCollider(
  RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS).setActiveCollisionTypes(
    RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
  ),
  playerBody,
)
const characterController = world.createCharacterController(CONTROLLER_OFFSET)
characterController.setSlideEnabled(true)

world.step()

const dx = TARGET.x - START.x
const dz = TARGET.z - START.z
const step = resolveMove(world, characterController, playerBody, playerCollider, START, dx, dz)

// Also try a stronger push straight into the building (+Z / -X mix)
const intoBuilding = resolveMove(world, characterController, playerBody, playerCollider, START, -2, 4)
const alongFacade = resolveMove(world, characterController, playerBody, playerCollider, START, 0, 3)
const intoDoor = resolveMove(world, characterController, playerBody, playerCollider, START, -1.5, 2.5)

// Ablation: rebuild WITHOUT Opera trimesh only, same start move
const worldNoOpera = new RAPIER.World(new RAPIER.Vector3(0, 0, 0))
for (const c of data.cuboids ?? []) addFixedCuboid(worldNoOpera, c)
for (const t of data.trimeshes ?? []) {
  if ((t.name || '').includes('SM_Opera_A')) continue
  addFixedTrimesh(worldNoOpera, t)
}
if (data.borders && data.bounds) addBorderWalls(worldNoOpera, data.bounds)
const pb2 = worldNoOpera.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().lockRotations())
const pc2 = worldNoOpera.createCollider(
  RAPIER.ColliderDesc.capsule(CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS).setActiveCollisionTypes(
    RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
  ),
  pb2,
)
const cc2 = worldNoOpera.createCharacterController(CONTROLLER_OFFSET)
cc2.setSlideEnabled(true)
worldNoOpera.step()
const withoutOpera = resolveMove(worldNoOpera, cc2, pb2, pc2, START, dx, dz)
const withoutOperaInto = resolveMove(worldNoOpera, cc2, pb2, pc2, START, -2, 4)

const blocked = step.blockedRatio > 0.5
const operaIsCause =
  operaLoaded &&
  withoutOpera.blockedRatio < 0.35 &&
  step.blockedRatio > 0.5

console.log(JSON.stringify({
  collisionPath,
  mode: data.mode,
  cuboids,
  borders,
  trimeshes: trimeshResults,
  SM_Opera_A_loaded: operaLoaded,
  start: START,
  target: TARGET,
  moveTowardFacade: step,
  moveIntoBuilding: intoBuilding,
  moveAlongPlusZ: alongFacade,
  moveIntoDoor: intoDoor,
  withoutOperaTrimesh: { towardFacade: withoutOpera, intoBuilding: withoutOperaInto },
  verdict: {
    movementBlockedAtDoor: blocked,
    SM_Opera_A_trimeshLoaded: operaLoaded,
    SM_Opera_A_likelyBlockingDoor: operaIsCause || (operaLoaded && intoBuilding.blockedRatio > 0.5 && withoutOperaInto.blockedRatio < intoBuilding.blockedRatio - 0.2),
  },
}, null, 2))

world.free()
worldNoOpera.free()
