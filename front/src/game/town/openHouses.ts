import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { findHouse } from '../assets/catalog'
import type { CollisionCuboidJson, CollisionFileJson, CollisionTrimeshJson } from '../collision/worldCollision'
import { houseBuildings, type HouseBuilding, type WorldManifest } from '../world/worldManifest'

type OpenHouseLot = HouseBuilding & { interiorOffset: [number, number, number] }

interface BuildingFloor {
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
const INTERIOR_SHOW_DISTANCE = 20
const INTERIOR_HIDE_DISTANCE = 26

const buildingFloors: BuildingFloor[] = []
const placedInteriors: THREE.Group[] = []

export function openHouseLots(manifest: WorldManifest): OpenHouseLot[] {
  return houseBuildings(manifest).filter((lot): lot is OpenHouseLot => lot.interiorOffset !== undefined)
}

export function openFrontDoor(exterior: THREE.Object3D, houseKey: string): void {
  const door = exterior.getObjectByName('Door')
  if (!door) throw new Error(`House ${houseKey} has no Door node`)
  door.rotation.y = OPEN_DOOR_ANGLE
}

export function placeOpenHouseInterior(interior: THREE.Group, lot: OpenHouseLot): THREE.Group {
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
  return placed
}

export function updateOpenHouseVisibility(x: number, z: number): void {
  for (const placed of placedInteriors) {
    const distance = Math.hypot(placed.position.x - x, placed.position.z - z)
    if (placed.visible && distance > INTERIOR_HIDE_DISTANCE) placed.visible = false
    else if (!placed.visible && distance < INTERIOR_SHOW_DISTANCE) placed.visible = true
  }
}

function interiorToWorld(lot: OpenHouseLot): THREE.Matrix4 {
  const lotMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(lot.position),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, lot.rotationY),
    new THREE.Vector3(1, 1, 1),
  )
  return lotMatrix.multiply(new THREE.Matrix4().makeTranslation(new THREE.Vector3().fromArray(lot.interiorOffset)))
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

async function fetchCollision(url: string): Promise<CollisionFileJson> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load collision ${url} (${res.status})`)
  return (await res.json()) as CollisionFileJson
}

async function composeTownCollisionData(manifest: WorldManifest): Promise<CollisionFileJson> {
  const lots = openHouseLots(manifest)
  const zoneCollisionUrls = manifest.zones.flatMap((zone) => (zone.collisionUrl ? [zone.collisionUrl] : []))
  const [zones, interiors] = await Promise.all([
    Promise.all(zoneCollisionUrls.map(fetchCollision)),
    Promise.all(lots.map((lot) => {
      const house = findHouse(lot.key)
      if (!house) throw new Error(`Unknown house in the world manifest: ${lot.key}`)
      return fetchCollision(house.interiorCollisionUrl)
    })),
  ])

  const zoneCuboids = zones.flatMap((zone) => zone.cuboids)
  const solidHouses = new Set(lots.map((lot) => `COL_House_${lot.key}`))
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
      worldToInterior: matrix.clone().invert(),
      bounds: interior.bounds,
      y: lot.position[1] + lot.interiorOffset[1],
    })
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

export function buildingFloorAt(x: number, z: number): number | null {
  const p = new THREE.Vector3()
  for (const floor of buildingFloors) {
    p.set(x, 0, z).applyMatrix4(floor.worldToInterior)
    const { minX, maxX, minZ, maxZ } = floor.bounds
    if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) return floor.y
  }
  return null
}
