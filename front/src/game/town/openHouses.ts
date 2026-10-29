import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { findHouse, findStore, findWork } from '../assets/catalog'
import { APARTMENT_ROOM_HEIGHT } from '../gameRoomConstants'
import {
  fetchCollisionFile,
  setDoorBlocker,
  type CollisionCuboidJson,
  type CollisionFileJson,
  type CollisionTrimeshJson,
} from '../collision/worldCollision'
import {
  houseBuildings,
  storeBuildings,
  workBuildings,
  type HouseBuilding,
  type StoreBuilding,
  type WorkBuilding,
  type WorldManifest,
} from '../world/worldManifest'
import { parseHouseLayout, singleLevelLayout, surfaceHeight, type HouseLayout } from './houseLevels'

type InteriorOffset = { interiorOffset: [number, number, number] }
type OpenHouseLot = HouseBuilding & InteriorOffset
type OpenWorkLot = WorkBuilding & InteriorOffset
type OpenStoreLot = StoreBuilding & InteriorOffset
type OpenLot = OpenHouseLot | OpenWorkLot | OpenStoreLot
type ShellLot = OpenWorkLot | OpenStoreLot

interface BuildingFloor {
  houseKey: string
  worldToInterior: THREE.Matrix4
  bounds: NonNullable<CollisionFileJson['bounds']>
  baseY: number
  layout: HouseLayout
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
/** Interior colliders the gameplay switches on and off (the pub's staff door), kept out of the static world. */
const TOGGLED_INTERIOR_COLLIDERS = new Set(['COL_Door_Secret'])
const toggledColliders = new Map<string, CollisionCuboidJson>()

interface FrontDoor {
  node: THREE.Object3D
  blocker: CollisionCuboidJson | null
  /** Open / close angle; the rattle jiggle is added on top of it. */
  swing: number
  /** Seconds left of a rattle (someone tried the handle of the locked door). */
  rattleLeft: number
}

const RATTLE_SECONDS = 0.35
const RATTLE_ANGLE = 0.025
const RATTLE_HZ = 18

const frontDoors = new Map<string, FrontDoor>()

export function openHouseLots(manifest: WorldManifest): OpenHouseLot[] {
  return houseBuildings(manifest).filter((lot): lot is OpenHouseLot => lot.interiorOffset !== undefined)
}

export function openWorkLots(manifest: WorldManifest): OpenWorkLot[] {
  return workBuildings(manifest).filter((lot): lot is OpenWorkLot => lot.interiorOffset !== undefined)
}

export function openStoreLots(manifest: WorldManifest): OpenStoreLot[] {
  return storeBuildings(manifest).filter((lot): lot is OpenStoreLot => lot.interiorOffset !== undefined)
}

function interiorAssetOf(lot: OpenLot): { interiorUrl: string; interiorCollisionUrl: string; interiorLightmapUrl: string } {
  const asset = lot.kind === 'house' ? findHouse(lot.key) : lot.kind === 'work' ? findWork(lot.key) : findStore(lot.key)
  if (!asset) throw new Error(`Unknown ${lot.kind} in the world manifest: ${lot.key}`)
  return asset
}

export function registerFrontDoor(exterior: THREE.Object3D, houseKey: string): void {
  const door = exterior.getObjectByName('Door')
  if (!door) throw new Error(`House ${houseKey} has no Door node`)
  door.rotation.y = OPEN_DOOR_ANGLE
  frontDoors.set(houseKey, { node: door, blocker: null, swing: OPEN_DOOR_ANGLE, rattleLeft: 0 })
}

/** The swinging door of a building (house model key or work key), to play its sounds on. */
export function frontDoorNode(buildingKey: string): THREE.Object3D | null {
  const door = frontDoors.get(buildingKey)
  return door?.node.parent ? door.node : null
}

export function rattleFrontDoor(buildingKey: string): void {
  const door = frontDoors.get(buildingKey)
  if (door) door.rattleLeft = RATTLE_SECONDS
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
    const delta = target - door.swing
    door.swing = Math.abs(delta) <= step ? target : door.swing + Math.sign(delta) * step
    door.rattleLeft = Math.max(0, door.rattleLeft - dt)
    // a decaying shake against the frame: the latch holds, so it only moves a hair
    const fade = door.rattleLeft / RATTLE_SECONDS
    door.node.rotation.y = door.swing + Math.sin(door.rattleLeft * RATTLE_HZ * Math.PI * 2) * RATTLE_ANGLE * fade
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
  placed.userData.visibilityReach = 'footprint' in lot ? Math.hypot(...lot.footprint) / 2 : 0
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
    const reach = placed.userData.visibilityReach as number
    if (placed.visible && distance > INTERIOR_HIDE_DISTANCE + reach) placed.visible = false
    else if (!placed.visible && distance < INTERIOR_SHOW_DISTANCE + reach) placed.visible = true
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

async function fetchHouseLayout(lot: OpenLot): Promise<HouseLayout | null> {
  const house = lot.kind === 'house' ? findHouse(lot.key) : null
  if (!house) return null
  const res = await fetch(house.interiorLayoutUrl)
  const isJson = res.headers.get('content-type')?.includes('json') ?? false
  if (res.status === 404 || (res.ok && !isJson)) return null
  if (!res.ok) throw new Error(`Failed to load house layout ${house.interiorLayoutUrl}: ${res.status}`)
  return parseHouseLayout(await res.json(), lot.key)
}

function boundsReach(bounds: NonNullable<CollisionFileJson['bounds']>, [ox, , oz]: [number, number, number]): number {
  return Math.max(...[bounds.minX, bounds.maxX].flatMap((x) => [bounds.minZ, bounds.maxZ].map((z) => Math.hypot(x + ox, z + oz))))
}

async function composeTownCollisionData(manifest: WorldManifest): Promise<CollisionFileJson> {
  const workLots = openWorkLots(manifest)
  const shellLots: ShellLot[] = [...workLots, ...openStoreLots(manifest)]
  const lots: OpenLot[] = [...openHouseLots(manifest), ...shellLots]
  const zoneCollisionUrls = manifest.zones.flatMap((zone) => (zone.collisionUrl ? [zone.collisionUrl] : []))
  const [zones, interiors, layouts, shells] = await Promise.all([
    Promise.all(zoneCollisionUrls.map(fetchCollisionFile)),
    Promise.all(lots.map((lot) => fetchCollisionFile(interiorAssetOf(lot).interiorCollisionUrl))),
    Promise.all(lots.map(fetchHouseLayout)),
    Promise.all(shellLots.map((lot) => {
      const building = lot.kind === 'work' ? findWork(lot.key) : findStore(lot.key)
      if (!building) throw new Error(`Unknown building in the world manifest: ${lot.key}`)
      return fetchCollisionFile(building.exteriorCollisionUrl)
    })),
  ])

  const zoneCuboids = zones.flatMap((zone) => zone.cuboids)
  const solidHouses = new Set([
    ...openHouseLots(manifest).map((lot) => `COL_House_${lot.key}`),
    ...workLots.map((lot) => `COL_Work_${lot.key}`),
  ])
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
    for (const cuboid of interior.cuboids) {
      const placed = transformCuboid(cuboid, matrix)
      if (TOGGLED_INTERIOR_COLLIDERS.has(cuboid.name ?? '')) toggledColliders.set(`${lot.key}/${cuboid.name}`, placed)
      else cuboids.push(placed)
    }
    trimeshes.push(...(interior.trimeshes ?? []).map((trimesh) => transformTrimesh(trimesh, matrix)))
    buildingFloors.push({
      houseKey: lot.key,
      worldToInterior: matrix.clone().invert(),
      bounds: interior.bounds,
      baseY: lot.position[1] + lot.interiorOffset[1],
      layout: layouts[i] ?? singleLevelLayout(lot.key, interior.bounds, APARTMENT_ROOM_HEIGHT),
    })
    const placed = lot.kind === 'house' ? interiorsByHouse.get(lot.key)?.parent : null
    if (placed) placed.userData.visibilityReach = boundsReach(interior.bounds, lot.interiorOffset)
  })
  shellLots.forEach((lot, i) => {
    const matrix = lotToWorld(lot)
    cuboids.push(...shells[i]!.cuboids.map((cuboid) => transformCuboid(cuboid, matrix)))
  })

  return { version: 1, source: 'world.manifest.json', mode: 'composed', borders: true, bounds: manifest.bounds, cuboids, trimeshes }
}

/** Block or free one of the toggled interior colliders of a building; a no-op until the collision is composed. */
export function setInteriorColliderBlocked(lotKey: string, colliderName: string, blocked: boolean): void {
  const key = `${lotKey}/${colliderName}`
  const cuboid = toggledColliders.get(key)
  if (!cuboid) return
  setDoorBlocker(key, blocked ? cuboid : null)
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

function floorAt(x: number, z: number): { floor: BuildingFloor; local: THREE.Vector3 } | null {
  const p = new THREE.Vector3()
  for (const floor of buildingFloors) {
    p.set(x, 0, z).applyMatrix4(floor.worldToInterior)
    const { minX, maxX, minZ, maxZ } = floor.bounds
    if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) return { floor, local: p }
  }
  return null
}

export function buildingFloorAt(x: number, z: number, feetY: number): number | null {
  const found = floorAt(x, z)
  if (!found) return null
  const { floor, local } = found
  const surface = surfaceHeight(floor.layout, local.x, local.z, feetY - floor.baseY)
  return surface === null ? null : floor.baseY + surface
}

export function capsuleLiftInBuilding(x: number, z: number, feetY: number): number {
  return floorAt(x, z) ? Math.max(0, feetY) : 0
}

export function houseLayout(houseKey: string): HouseLayout {
  const floor = buildingFloors.find((f) => f.houseKey === houseKey)
  if (!floor) throw new Error(`House ${houseKey} has no composed collision yet`)
  return floor.layout
}

export function houseKeyAt(x: number, z: number): string | null {
  return floorAt(x, z)?.floor.houseKey ?? null
}
