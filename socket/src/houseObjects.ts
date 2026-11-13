import { toInterior, unitAt } from './movement.ts'
import type { Bounds, FurnitureObject, GameRoom, HousingUnit, Player, Vec3 } from './types.ts'
import { type WorldHouse, worldHouse } from './world.ts'

export const OBJECT_REACH = 2.5
export const OBJECT_HEIGHT_REACH = 1.5
export const EYE_HEIGHT = 1.6
export const BESIDE_BED = 1
const WALL_MARGIN = 0.4
const LYING_HEIGHT = 0.5

export interface PlacedObject {
  unit: HousingUnit
  house: WorldHouse
  object: FurnitureObject
}

export function placedObject(room: GameRoom, unit: HousingUnit | undefined, objectId: string): PlacedObject | null {
  const house = unit?.model_key ? worldHouse(unit.model_key) : null
  const object = room.houseFurniture.find((h) => h.model_key === unit?.model_key)?.objects.find((o) => o.objectId === objectId)
  return unit && house && object && unit.occupant_account_id !== null ? { unit, house, object } : null
}

export function placedObjectInReach(room: GameRoom, player: Player, objectId: string): PlacedObject | null {
  const found = placedObject(room, unitAt(room.housingUnits, player.x, player.z) ?? undefined, objectId)
  if (!found) return null
  const { house, object } = found
  const p = toInterior(house, player.x, player.z)
  const feetY = player.y - EYE_HEIGHT - house.position.y - house.interiorOffset.y
  const near = Math.hypot(object.x - p.x, object.z - p.z) <= OBJECT_REACH && Math.abs(object.y - feetY) <= OBJECT_HEIGHT_REACH
  return near ? found : null
}

export function fromInterior(house: WorldHouse, x: number, y: number, z: number): Vec3 {
  const qx = x + house.interiorOffset.x
  const qz = z + house.interiorOffset.z
  const cos = Math.cos(house.rotationY)
  const sin = Math.sin(house.rotationY)
  return {
    x: house.position.x + qx * cos + qz * sin,
    y: house.position.y + house.interiorOffset.y + y,
    z: house.position.z - qx * sin + qz * cos
  }
}

export function standBeside(object: FurnitureObject, bounds: Bounds): { x: number, z: number } {
  const cos = Math.cos(object.rotY ?? 0)
  const sin = Math.sin(object.rotY ?? 0)
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({
    x: object.x + (dx * cos + dz * sin) * BESIDE_BED,
    z: object.z + (-dx * sin + dz * cos) * BESIDE_BED
  }))
  const inside = (p: { x: number, z: number }) => p.x >= bounds.minX + WALL_MARGIN && p.x <= bounds.maxX - WALL_MARGIN
    && p.z >= bounds.minZ + WALL_MARGIN && p.z <= bounds.maxZ - WALL_MARGIN
  return sides.find(inside) ?? { x: object.x, z: object.z }
}

export function bedWakeUp({ unit, house, object }: PlacedObject): { position: Vec3, bed: Vec3 } | null {
  if (!unit.interior_bounds) return null
  const stand = standBeside(object, unit.interior_bounds)
  const feet = fromInterior(house, stand.x, object.y, stand.z)
  return {
    position: { ...feet, y: feet.y + EYE_HEIGHT },
    bed: fromInterior(house, object.x, object.y + LYING_HEIGHT, object.z)
  }
}
