/**
 * Layout of the /NewNation showroom (`new_nation.layout.json`, written by map-src/NewNation): display slots
 * around the plaza and the walk-in model apartments that ring it.
 */
import type { ShowroomGroup } from './showroomItems'

export const PLAZA_RADIUS = 20
export const PARK_RADIUS = 34

export interface SlotDef {
  name: string
  group: ShowroomGroup
  position: [number, number, number]
}

export interface ApartmentDef {
  id: string
  name: string
  url: string
  /** Rotation of the north layout about the plaza centre (three.js rotation.y convention). */
  angle: number
  position: [number, number, number]
  rotationY: number
  /** Where walk mode drops you in front of the door, and the yaw that faces it. */
  doorStand: [number, number, number]
  doorYaw: number
  /** Footprint when placed north [minX, minZ, maxX, maxZ]; the real one is this rotated by `angle`. */
  footprint: [number, number, number, number]
}

export interface SlotsFile {
  slots: SlotDef[]
  apartments?: ApartmentDef[]
  /** Nodes removed from every interior (closed entrance door, indoor-only sky backdrops). */
  hideNodes?: string[]
  walkSpawn?: [number, number, number]
}

export interface ShowroomApartment {
  id: string
  name: string
}

/** Everything the 2D minimap needs, in game x/z coordinates. */
export interface MinimapState {
  plazaRadius: number
  parkRadius: number
  player: { x: number; z: number; yaw: number }
  apartments: Array<{ id: string; name: string; corners: Array<[number, number]>; door: [number, number] }>
  currentApartmentId: string | null
}

/** Rotate a game-space (x, z) point about the origin like three.js rotation.y = angle. */
function rotateXZ(x: number, z: number, angle: number): [number, number] {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [x * c + z * s, -x * s + z * c]
}

/** Which apartment (if any) contains the game-space point. */
export function apartmentAt(apartments: readonly ApartmentDef[], x: number, z: number): ApartmentDef | null {
  for (const def of apartments) {
    const [minX, minZ, maxX, maxZ] = def.footprint
    // Undo the apartment's rotation to test against the north footprint.
    const [nx, nz] = rotateXZ(x, z, -def.angle)
    if (nx >= minX && nx <= maxX && nz >= minZ && nz <= maxZ) return def
  }
  return null
}

/** Apartment outlines (rotated footprint corners) and door points for the minimap. */
export function minimapApartments(apartments: readonly ApartmentDef[]): MinimapState['apartments'] {
  return apartments.map((def) => {
    const [minX, minZ, maxX, maxZ] = def.footprint
    const corners: Array<[number, number]> = [[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]
    return {
      id: def.id,
      name: def.name,
      corners: corners.map(([x, z]) => rotateXZ(x, z, def.angle)),
      door: [def.doorStand[0], def.doorStand[2]],
    }
  })
}

/** Apartment whose door is closest to the point (to know where "next" starts from). */
export function nearestApartmentId(apartments: readonly ApartmentDef[], x: number, z: number): string | null {
  let best: string | null = null
  let bestD = Infinity
  for (const def of apartments) {
    const d = Math.hypot(x - def.doorStand[0], z - def.doorStand[2])
    if (d < bestD) {
      bestD = d
      best = def.id
    }
  }
  return best
}
