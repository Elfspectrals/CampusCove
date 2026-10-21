/**
 * Rarity tiers shown to players. `erasableSyntaxOnly` forbids `enum`, so this is a const object
 * used as an enum: `Rarity.Legendary`, plus the union type `Rarity`.
 * Colours mirror the `--cc-r-*` CSS variables in style.css (`cc-rarity-<tier>` classes).
 */
export const Rarity = {
  Common: 'common',
  Uncommon: 'uncommon',
  Rare: 'rare',
  Epic: 'epic',
  Legendary: 'legendary',
} as const

export type Rarity = (typeof Rarity)[keyof typeof Rarity]

export const RARITY_META: Record<Rarity, { label: string; color: string; glow: string }> = {
  [Rarity.Common]: { label: 'Commun', color: '#a0aac4', glow: 'rgba(160,170,196,0.35)' },
  [Rarity.Uncommon]: { label: 'Peu commun', color: '#5cd670', glow: 'rgba(92,214,112,0.4)' },
  [Rarity.Rare]: { label: 'Rare', color: '#40aaff', glow: 'rgba(64,170,255,0.45)' },
  [Rarity.Epic]: { label: 'Épique', color: '#be64ff', glow: 'rgba(190,100,255,0.5)' },
  [Rarity.Legendary]: { label: 'Légendaire', color: '#ffa030', glow: 'rgba(255,160,48,0.7)' },
}
