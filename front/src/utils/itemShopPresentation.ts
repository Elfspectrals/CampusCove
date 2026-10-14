import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../api/itemShop'

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Gems'
}

export function priceBadge(option: ShopItemCurrencyOption): string {
  return `${option.price.toLocaleString()} ${currencyLabel(option.currency)}`
}

/**
 * The public catalog does not expose item rarity yet, so the tier is derived from how
 * the item is sold: premium-purchasable items read as rarer than coin-only ones.
 */
export function itemRarity(item: ShopItem): ItemRarity {
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
