import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { findHouse, findWork } from '../assets/catalog'
import {
  fetchCollisionFile,
  setDoorBlocker,
  type CollisionCuboidJson,
  type CollisionFileJson,
  type CollisionTrimeshJson,
} from '../collision/worldCollision'
import { houseBuildings, workBuildings, type HouseBuilding, type WorkBuilding, type WorldManifest } from '../world/worldManifest'

type InteriorOffset = { interiorOffset: [number, number, number] }
type OpenHouseLot = HouseBuilding & InteriorOffset
type OpenWorkLot = WorkBuilding & InteriorOffset
type OpenLot = OpenHouseLot | OpenWorkLot

interface BuildingFloor {
  houseKey: string
  worldToInterior: THREE.Matrix4
  bounds: NonNullable<CollisionFileJson['bounds']>
  y: number
}

const HIDDEN_INTERIOR_NODES = new Set([
  'Sky_Front',
  'Sky_Back',
  'Sky_West',
  'Sky_East',
  'Door_Entrance',
  'Door_Entrance_Handle',
  'Door_Entrance_Sign',
])
const OPEN_DOOR_ANGLE = 1.4
const DOOR_SWING_SPEED = 3
const DOOR_BLOCKER_MIN_HALF = 0.08
const LIGHTMAP_INTENSITY = Math.PI * 0.65
const INTERIOR_SHOW_DISTANCE = 20
const INTERIOR_HIDE_DISTANCE = 26

const buildingFloors: BuildingFloor[] = []
const placedInteriors: THREE.Group[] = []
const interiorsByHouse = new Map<string, THREE.Group>()

interface FrontDoor {
  node: THREE.Object3D
  blocker: CollisionCuboidJson | null
}

const frontDoors = new Map<string, FrontDoor>()

export function openHouseLots(manifest: WorldManifest): OpenHouseLot[] {
  return houseBuildings(manifest).filter((lot): lot is OpenHouseLot => lot.interiorOffset !== undefined)
}

export function openWorkLots(manifest: WorldManifest): OpenWorkLot[] {
  return workBuildings(manifest).filter((lot): lot is OpenWorkLot => lot.interiorOffset !== undefined)
}

function interiorAssetOf(lot: OpenLot): { interiorUrl: string; interiorCollisionUrl: string; interiorLightmapUrl: string } {
  const asset = lot.kind === 'house' ? findHouse(lot.key) : findWork(lot.key)
  if (!asset) throw new Error(`Unknown ${lot.kind} in the world manifest: ${lot.key}`)
  return asset
}

export function registerFrontDoor(exterior: THREE.Object3D, houseKey: string): void {
  const door = exterior.getObjectByName('Door')
  if (!door) throw new Error(`House ${houseKey} has no Door node`)
  door.rotation.y = OPEN_DOOR_ANGLE
  frontDoors.set(houseKey, { node: door, blocker: null })
}

function closedDoorBlocker(door: THREE.Object3D): CollisionCuboidJson {
  const swing = door.rotation.y
  door.rotation.y = 0
  door.updateWorldMatrix(true, true)
  const worldToDoor = door.matrixWorld.clone().invert()
  const box = new THREE.Box3()
  door.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.geometry.computeBoundingBox()
    box.union(obj.geometry.boundingBox!.clone().applyMatrix4(worldToDoor.clone().multiply(obj.matrixWorld)))
  })
  if (box.isEmpty()) throw new Error(`Door ${door.name} has no mesh`)
  const center = box.getCenter(new THREE.Vector3()).applyMatrix4(door.matrixWorld)
  const half = box.getSize(new THREE.Vector3()).multiply(door.getWorldScale(new THREE.Vector3())).multiplyScalar(0.5)
  const rotation = door.getWorldQuaternion(new THREE.Quaternion())
  door.rotation.y = swing
  door.updateWorldMatrix(false, true)
  return {
    name: `Door_${door.name}`,
    cx: center.x,
    cy: center.y,
    cz: center.z,
    hx: Math.max(half.x, DOOR_BLOCKER_MIN_HALF),
    hy: Math.max(half.y, DOOR_BLOCKER_MIN_HALF),
    hz: Math.max(half.z, DOOR_BLOCKER_MIN_HALF),
    qx: rotation.x,
    qy: rotation.y,
    qz: rotation.z,
    qw: rotation.w,
  }
}

export function updateFrontDoors(dt: number, isDoorOpen: (houseKey: string) => boolean): void {
  for (const [houseKey, door] of frontDoors) {
    if (!door.node.parent) continue
    const open = isDoorOpen(houseKey)
    door.blocker ??= closedDoorBlocker(door.node)
    setDoorBlocker(houseKey, open ? null : door.blocker)
    const target = open ? OPEN_DOOR_ANGLE : 0
    const step = DOOR_SWING_SPEED * dt
    const delta = target - door.node.rotation.y
    door.node.rotation.y = Math.abs(delta) <= step ? target : door.node.rotation.y + Math.sign(delta) * step
  }
}

export function placeOpenHouseInterior(interior: THREE.Group, lot: OpenLot): THREE.Group {
  const hidden: THREE.Object3D[] = []
  interior.traverse((obj) => {
    if (HIDDEN_INTERIOR_NODES.has(obj.name.replace(/\.?\d{3,}$/, ''))) hidden.push(obj)
  })
  for (const obj of hidden) {
    obj.removeFromParent()
    disposeObject3D(obj)
  }
  interior.position.fromArray(lot.interiorOffset)
  const placed = new THREE.Group()
  placed.name = `OpenHouse_${lot.key}`
  placed.position.fromArray(lot.position)
  placed.rotation.y = lot.rotationY
  placed.visible = false
  placed.add(interior)
  placedInteriors.push(placed)
  interiorsByHouse.set(lot.key, interior)
  return placed
}

export function openHouseInterior(houseKey: string): THREE.Group | undefined {
  return interiorsByHouse.get(houseKey)
}

export function applyInteriorLightmap(interior: THREE.Object3D, lightmap: THREE.Texture): void {
  lightmap.flipY = false
  lightmap.channel = 1
  lightmap.colorSpace = THREE.NoColorSpace
  const lightmapped = new Map<THREE.Material, THREE.Material>()
  const withLightmap = (material: THREE.Material): THREE.Material => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return material
    let lit = lightmapped.get(material)
    if (!lit) {
      lit = new THREE.MeshBasicMaterial({
        name: material.name,
        color: material.color,
        map: material.map,
        alphaMap: material.alphaMap,
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        side: material.side,
        vertexColors: material.vertexColors,
        lightMap: lightmap,
        lightMapIntensity: LIGHTMAP_INTENSITY,
      })
      lightmapped.set(material, lit)
    }
    return lit
  }
  interior.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry.getAttribute('uv1')) return
    obj.material = Array.isArray(obj.material) ? obj.material.map(withLightmap) : withLightmap(obj.material)
  })
}

export function updateOpenHouseVisibility(x: number, z: number): void {
  for (const placed of placedInteriors) {
    const distance = Math.hypot(placed.position.x - x, placed.position.z - z)
    if (placed.visible && distance > INTERIOR_HIDE_DISTANCE) placed.visible = false
    else if (!placed.visible && distance < INTERIOR_SHOW_DISTANCE) placed.visible = true
  }
}

function lotToWorld(lot: OpenLot): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(lot.position),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, lot.rotationY),
    new THREE.Vector3(1, 1, 1),
  )
}

function interiorToWorld(lot: OpenLot): THREE.Matrix4 {
  return lotToWorld(lot).multiply(new THREE.Matrix4().makeTranslation(new THREE.Vector3().fromArray(lot.interiorOffset)))
}

function transformCuboid(cuboid: CollisionCuboidJson, matrix: THREE.Matrix4): CollisionCuboidJson {
  const center = new THREE.Vector3(cuboid.cx, cuboid.cy, cuboid.cz).applyMatrix4(matrix)
  const rotation = new THREE.Quaternion()
    .setFromRotationMatrix(matrix)
    .multiply(new THREE.Quaternion(cuboid.qx, cuboid.qy, cuboid.qz, cuboid.qw))
  return {
    ...cuboid,
    cx: center.x,
    cy: center.y,
    cz: center.z,
    qx: rotation.x,
    qy: rotation.y,
    qz: rotation.z,
    qw: rotation.w,
  }
}

function transformTrimesh(trimesh: CollisionTrimeshJson, matrix: THREE.Matrix4): CollisionTrimeshJson {
  const v = new THREE.Vector3()
  const vertices = [...trimesh.vertices]
  for (let i = 0; i < vertices.length; i += 3) {
    v.set(vertices[i]!, vertices[i + 1]!, vertices[i + 2]!).applyMatrix4(matrix)
    vertices[i] = v.x
    vertices[i + 1] = v.y
    vertices[i + 2] = v.z
  }
  return { ...trimesh, vertices }
}

async function composeTownCollisionData(manifest: WorldManifest): Promise<CollisionFileJson> {
  const workLots = openWorkLots(manifest)
  const lots: OpenLot[] = [...openHouseLots(manifest), ...workLots]
  const zoneCollisionUrls = manifest.zones.flatMap((zone) => (zone.collisionUrl ? [zone.collisionUrl] : []))
  const [zones, interiors, workShells] = await Promise.all([
    Promise.all(zoneCollisionUrls.map(fetchCollisionFile)),
    Promise.all(lots.map((lot) => fetchCollisionFile(interiorAssetOf(lot).interiorCollisionUrl))),
    Promise.all(workLots.map((lot) => {
      const work = findWork(lot.key)
      if (!work) throw new Error(`Unknown work building in the world manifest: ${lot.key}`)
      return fetchCollisionFile(work.exteriorCollisionUrl)
    })),
  ])

  const zoneCuboids = zones.flatMap((zone) => zone.cuboids)
  const solidHouses = new Set(lots.map((lot) => (lot.kind === 'house' ? `COL_House_${lot.key}` : `COL_Work_${lot.key}`)))
  const cuboids = zoneCuboids.filter((cuboid) => !solidHouses.has(cuboid.name ?? ''))
  if (zoneCuboids.length - cuboids.length !== solidHouses.size) {
    throw new Error(`Zone collision is missing one of ${[...solidHouses].join(', ')}`)
  }
  const trimeshes = zones.flatMap((zone) => zone.trimeshes ?? [])

  buildingFloors.length = 0
  lots.forEach((lot, i) => {
    const interior = interiors[i]!
    if (!interior.bounds) throw new Error(`House ${lot.key} interior collision has no bounds`)
    const matrix = interiorToWorld(lot)
    cuboids.push(...interior.cuboids.map((cuboid) => transformCuboid(cuboid, matrix)))
    trimeshes.push(...(interior.trimeshes ?? []).map((trimesh) => transformTrimesh(trimesh, matrix)))
    buildingFloors.push({
      houseKey: lot.key,
      worldToInterior: matrix.clone().invert(),
      bounds: interior.bounds,
      y: lot.position[1] + lot.interiorOffset[1],
    })
  })
  workLots.forEach((lot, i) => {
    const matrix = lotToWorld(lot)
    cuboids.push(...workShells[i]!.cuboids.map((cuboid) => transformCuboid(cuboid, matrix)))
  })

  return { version: 1, source: 'world.manifest.json', mode: 'composed', borders: true, bounds: manifest.bounds, cuboids, trimeshes }
}

let townCollision: Promise<CollisionFileJson> | null = null

export function buildTownCollisionData(manifest: WorldManifest): Promise<CollisionFileJson> {
  if (!townCollision) {
    townCollision = composeTownCollisionData(manifest).catch((error: unknown) => {
      townCollision = null
      throw error
    })
  }
  return townCollision
}

function floorAt(x: number, z: number): BuildingFloor | null {
  const p = new THREE.Vector3()
  for (const floor of buildingFloors) {
    p.set(x, 0, z).applyMatrix4(floor.worldToInterior)
    const { minX, maxX, minZ, maxZ } = floor.bounds
    if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) return floor
  }
  return null
}

export function buildingFloorAt(x: number, z: number): number | null {
  return floorAt(x, z)?.y ?? null
}

export function houseKeyAt(x: number, z: number): string | null {
  return floorAt(x, z)?.houseKey ?? null
}
