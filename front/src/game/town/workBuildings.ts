import type { TownLayout } from '../assets/catalog'

/** One business-district building as listed in `town.layout.json` → `work`. */
export type WorkLot = NonNullable<TownLayout['work']>[number]

/** How close (XZ, metres) to a work building's door point the interact prompt appears. */
const WORK_DOOR_INTERACT_RADIUS = 2.2

export function findNearestWorkDoor(x: number, z: number, lots: readonly WorkLot[]): WorkLot | null {
  let best: WorkLot | null = null
  let bestDistSq = WORK_DOOR_INTERACT_RADIUS * WORK_DOOR_INTERACT_RADIUS
  for (const lot of lots) {
    const dx = x - lot.door[0]
    const dz = z - lot.door[2]
    const distSq = dx * dx + dz * dz
    if (distSq <= bestDistSq) {
      bestDistSq = distSq
      best = lot
    }
  }
  return best
}
