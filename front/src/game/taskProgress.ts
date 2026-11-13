export type NextGoal = { tier: number; target: number } | null

export function nextGoal(value: number, tiers: readonly number[]): NextGoal {
  for (const [index, threshold] of tiers.entries()) {
    if (value < threshold) return { tier: index + 1, target: threshold }
  }
  return null
}

export const TIER_TONE = {
  1: { text: 'text-[#c27a3e]', border: 'border-[#c27a3e]', fill: 'bg-[#c27a3e]' },
  2: { text: 'text-[#a9b4bf]', border: 'border-[#a9b4bf]', fill: 'bg-[#a9b4bf]' },
  3: { text: 'text-[#e5b53a]', border: 'border-[#e5b53a]', fill: 'bg-[#e5b53a]' },
} as const
