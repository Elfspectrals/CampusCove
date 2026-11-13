import type { OfferableItem } from '../../api/trades'

export const STORAGE_FURNITURE_CODES: readonly string[] = ['decor_dresser', 'decor_toy_chest', 'decor_fridge_retro']

const PLACEABLE_KINDS: readonly string[] = ['furniture', 'apartment_asset']

export function isStorageFurniture(code: string): boolean {
  return STORAGE_FURNITURE_CODES.includes(code)
}

export function storableItems(bag: readonly OfferableItem[], foodOnly: boolean): OfferableItem[] {
  return bag.filter((item) => !PLACEABLE_KINDS.includes(item.kind) && (!foodOnly || item.kind === 'consumable'))
}
