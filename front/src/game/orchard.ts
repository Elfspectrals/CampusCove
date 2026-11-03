type Point = { x: number; z: number }
type Vec3 = [number, number, number]

export const APPLE_CODE = 'farm_apple'
export const APPLE_PRICE = 3
export const PICK_MS = 3000
export const TREE_PROMPT_REACH = 2.2
export const TREE_KEEP_REACH = 2.5
export const FARMER_REACH = 2.8

export function withinReach(point: Vec3, at: Point, reach: number): boolean {
  return Math.hypot(point[0] - at.x, point[2] - at.z) <= reach
}

export function nearestTree(trees: Vec3[], at: Point, reach: number): number | null {
  let best: number | null = null
  let bestDistance = reach
  trees.forEach((tree, index) => {
    const distance = Math.hypot(tree[0] - at.x, tree[2] - at.z)
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

export function wholeApples(item: { quantity: number; portions?: number | null; portions_left?: number | null } | undefined): number {
  if (!item) return 0
  const bitten = item.portions != null && item.portions_left != null && item.portions_left < item.portions
  return Math.max(0, item.quantity - (bitten ? 1 : 0))
}

export function sellQuantity(wanted: number, carried: number): number {
  if (carried <= 0) return 0
  return Math.min(carried, Math.max(1, Math.round(wanted)))
}

export function saleLine(coins: number, fullPriceLeft: number): string {
  if (fullPriceLeft <= 0) return `+${coins} coins · the farmer pays 1 coin per apple until tomorrow`
  return `+${coins} coins · ${fullPriceLeft} ${fullPriceLeft === 1 ? 'apple' : 'apples'} left at ${APPLE_PRICE} coins today`
}
