export type NextGoal = { tier: number; target: number } | null

export function nextGoal(value: number, tiers: readonly number[]): NextGoal {
  for (const [index, threshold] of tiers.entries()) {
    if (value < threshold) return { tier: index + 1, target: threshold }
  }
  return null
}

export const TIER_TONE = {
  1: { text: 'text-[#d08a4e]', border: 'border-[#d08a4e]/70', fill: 'bg-[#d08a4e]' },
  2: { text: 'text-[#d6dde4]', border: 'border-[#d6dde4]/70', fill: 'bg-[#d6dde4]' },
  3: { text: 'text-sun', border: 'border-sun/70', fill: 'bg-sun' },
} as const
