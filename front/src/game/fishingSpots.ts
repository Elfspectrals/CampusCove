import type { TownLayout } from './assets/catalog'

export type FishingSpot = NonNullable<TownLayout['pond']>['fishingSpots'][number]

export function findNearestFishingSpot(x: number, z: number, spots: readonly FishingSpot[]): FishingSpot | null {
  let best: FishingSpot | null = null
  let bestDistSq = Infinity
  for (const spot of spots) {
    const dx = x - spot.position[0]
    const dz = z - spot.position[2]
    const distSq = dx * dx + dz * dz
    if (distSq <= spot.radius * spot.radius && distSq < bestDistSq) {
      bestDistSq = distSq
      best = spot
    }
  }
  return best
}
