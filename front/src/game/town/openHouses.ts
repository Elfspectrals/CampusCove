import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { TOWN, findHouse, type TownLayout } from '../assets/catalog'
import type { CollisionCuboidJson, CollisionFileJson, CollisionTrimeshJson } from '../collision/worldCollision'

type HouseLot = TownLayout['houses'][number]
type OpenHouseLot = HouseLot & { interiorOffset: [number, number, number] }

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

const buildingFloors: BuildingFloor[] = []

export function openHouseLots(layout: TownLayout): OpenHouseLot[] {
  return layout.houses.filter((lot): lot is OpenHouseLot => lot.interiorOffset !== undefined)
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
  placed.add(interior)
  return placed
}

function interiorToWorld(lot: OpenHouseLot): THREE.Matrix4 {
  const lotMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(lot.position),
    new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, lot.rotationY),
    new THREE.Vector3(1, 1, 1),
  )
  return lotMatrix.multiply(new THREE.Matrix4().makeTranslation(...lot.interiorOffset))
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

export async function buildTownCollisionData(layout: TownLayout): Promise<CollisionFileJson> {
  const lots = openHouseLots(layout)
  const [town, interiors] = await Promise.all([
    fetchCollision(TOWN.collisionUrl),
    Promise.all(lots.map((lot) => {
      const house = findHouse(lot.key)
      if (!house) throw new Error(`Unknown house in the town layout: ${lot.key}`)
      return fetchCollision(house.interiorCollisionUrl)
    })),
  ])

  const solidHouses = new Set(lots.map((lot) => `COL_House_${lot.key}`))
  const cuboids = town.cuboids.filter((cuboid) => !solidHouses.has(cuboid.name ?? ''))
  if (town.cuboids.length - cuboids.length !== solidHouses.size) {
    throw new Error(`Town collision is missing one of ${[...solidHouses].join(', ')}`)
  }
  const trimeshes = [...(town.trimeshes ?? [])]

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

  return { ...town, cuboids, trimeshes }
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
