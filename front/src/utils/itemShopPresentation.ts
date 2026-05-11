import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../api/itemShop'

export function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Premium'
}

export function priceBadge(option: ShopItemCurrencyOption): string {
  const sym = option.currency === 'coins' ? '🪙' : '✨'
  return `${sym} ${option.price.toLocaleString()}`
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
