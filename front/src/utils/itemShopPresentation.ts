import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../api/itemShop'

export function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Premium'
}

export function priceBadge(option: ShopItemCurrencyOption): string {
  const sym = option.currency === 'coins' ? '🪙' : '✨'
  return `${sym} ${option.price.toLocaleString()}`
}

const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'] as const

export function rarityLabel(rarity: number): string {
  if (!Number.isInteger(rarity) || rarity < 0) return 'Unknown'
  return RARITY_LABELS[Math.min(rarity, RARITY_LABELS.length - 1)] ?? 'Unknown'
}

export function rarityToneClasses(rarity: number): string {
  if (rarity >= 4) return 'border-amber-300 text-amber-200'
  if (rarity === 3) return 'border-fuchsia-300 text-fuchsia-200'
  if (rarity === 2) return 'border-cyan-300 text-cyan-200'
  if (rarity === 1) return 'border-emerald-300 text-emerald-200'
  return 'border-slate-300/60 text-slate-200'
}

export function kindLabel(item: ShopItem): string {
  if (item.kind === 'apartment_asset' || item.kind === 'furniture') return 'Apartment item'
  if (item.kind === 'cosmetic') return 'Character cosmetic'
  if (item.kind === 'consumable') return 'Consumable'
  return 'Collectible'
}

export function optionAvailable(option: ShopItemCurrencyOption): boolean {
  return option.stock_remaining === null || option.stock_remaining > 0
}

export function cardToneClasses(item: ShopItem): string {
  const hasPremium = item.options.some((option) => option.currency === 'premium')
  const hasCoins = item.options.some((option) => option.currency === 'coins')
  if (hasPremium && hasCoins) {
    return 'border-fuchsia-400/90 bg-[radial-gradient(circle_at_center,_#a855f7_0%,_#6d28d9_55%,_#3b1a73_100%)]'
  }
  if (hasPremium) {
    return 'border-cyan-300/90 bg-[radial-gradient(circle_at_center,_#4cc2ff_0%,_#1e5db7_58%,_#0e2b63_100%)]'
  }
  return 'border-orange-300/90 bg-[radial-gradient(circle_at_center,_#f59e66_0%,_#aa5b30_58%,_#6f311b_100%)]'
}
