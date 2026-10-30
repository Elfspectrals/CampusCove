import { seededRandom } from './drinkFast.ts'

export const SHOT_COUNT = 10

export function shotLayout(seed: number): number[] {
  const random = seededRandom(seed)
  const order = Array.from({ length: SHOT_COUNT }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swapped = order[i]!
    order[i] = order[j]!
    order[j] = swapped
  }
  return order
}

export function shotsScore(ms: number): { coins: number } {
  if (ms < 6000) return { coins: 30 }
  if (ms < 9000) return { coins: 15 }
  return { coins: 0 }
}
