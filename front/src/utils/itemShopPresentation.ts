import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../api/itemShop'

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

/** item_defs.rarity from which an item is presented as legendary (the premium rigged skins are 5). */
const LEGENDARY_MIN_RARITY = 5

export function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Gems'
}

export function priceBadge(option: ShopItemCurrencyOption): string {
  return `${option.price.toLocaleString()} ${currencyLabel(option.currency)}`
}

/**
 * Legendary comes from the stored rarity; below that the tier is derived from how
 * the item is sold: premium-purchasable items read as rarer than coin-only ones.
 */
export function itemRarity(item: ShopItem): ItemRarity {
  // the stored rarity wins when the API provides it; otherwise fall back to how the item is sold
  if (item.rarity !== null && item.rarity >= LEGENDARY_MIN_RARITY) return 'legendary'
  const hasPremium = item.options.some((option) => option.currency === 'premium')
  const hasCoins = item.options.some((option) => option.currency === 'coins')
  if (hasPremium && hasCoins) return 'epic'
  if (hasPremium) return 'rare'
  return 'uncommon'
}

/** `cc-rarity-*` classes used by `.cc-card` / `.cc-rarity-bg` (see style.css). */
export function rarityClass(rarity: ItemRarity): string {
  return `cc-rarity cc-rarity-${rarity}`
}
