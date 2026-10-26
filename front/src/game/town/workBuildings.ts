import type { TownLayout } from '../assets/catalog'

/** One business-district building as listed in `town.layout.json` → `work`. */
export type WorkLot = NonNullable<TownLayout['work']>[number]

/** How close (XZ, metres) to a work building's door point the interact prompt appears. */
const WORK_DOOR_INTERACT_RADIUS = 2.2

/** Nearest building door (work buildings, Cove Home) within reach of (x, z). */
export function findNearestWorkDoor<T extends { door: [number, number, number] }>(x: number, z: number, lots: readonly T[]): T | null {
  let best: T | null = null
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
