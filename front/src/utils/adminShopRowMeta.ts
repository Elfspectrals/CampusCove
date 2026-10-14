import type { AdminShopCatalogRow } from '../api/adminShop'

export function rowPriceText(row: AdminShopCatalogRow): string {
  const parts: string[] = []
  if (row.allow_coins && row.coins_price !== null) parts.push(`Coins ${row.coins_price.toLocaleString()}`)
  if (row.allow_premium && row.premium_price !== null) parts.push(`Premium ${row.premium_price.toLocaleString()}`)
  if (parts.length === 0) parts.push(`${row.currency} ${row.price.toLocaleString()}`)
  return parts.join(' / ')
}

export function statusLabel(row: AdminShopCatalogRow): string {
  if (row.deleted_at) return 'Deleted'
  if (!row.is_active) return 'Inactive'
  if (!row.is_published) return 'Draft'
  return 'Live'
}

export function statusClass(row: AdminShopCatalogRow): string {
  if (row.deleted_at) return 'opacity-60'
  if (!row.is_active) return 'cc-chip-sun'
  if (!row.is_published) return 'cc-chip-grape'
  return 'cc-chip-mint'
}
