import type { Bounds, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { ownedGear } from './gear.ts'

export const SWIMSUIT = 'gear_swimsuit'

let water: readonly Bounds[] = []
let poolZone: string | null = null
const swimsuits = new WeakMap<Player, boolean | 'pending'>()

export function configurePoolWater(rects: readonly Bounds[], zone: string): void {
  water = [...rects]
  poolZone = zone
}

function inside(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

export function inPoolWater(x: number, z: number): boolean {
  return water.some((b) => inside(b, x, z))
}

function checkSwimsuit(player: Player): void {
  if (!player.token) {
    swimsuits.set(player, false)
    return
  }
  swimsuits.set(player, 'pending')
  ownedGear(player).then(
    (gear) => {
      if (swimsuits.get(player) === 'pending') swimsuits.set(player, gear.includes(SWIMSUIT))
    },
    (error: unknown) => {
      if (swimsuits.get(player) === 'pending') swimsuits.delete(player)
      console.warn('[sports] swimsuit check failed:', error instanceof Error ? error.message : error)
    }
  )
}

function refreshSwimsuit(player: Player): void {
  const zone = poolZone === null ? null : worldSportsPassArea(poolZone)
  if (!zone || !inside(zone, player.x, player.z)) swimsuits.delete(player)
  else if (!swimsuits.has(player)) checkSwimsuit(player)
}

export function entersPoolWaterWithoutSwimsuit(player: Player, x: number, z: number): boolean {
  if (water.length === 0) return false
  refreshSwimsuit(player)
  if (!inPoolWater(x, z) || inPoolWater(player.x, player.z)) return false
  return swimsuits.get(player) !== true
}
