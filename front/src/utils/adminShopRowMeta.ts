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
  if (row.deleted_at) return 'bg-slate-300 text-slate-800'
  if (!row.is_active) return 'bg-amber-100 text-amber-900'
  if (!row.is_published) return 'bg-violet-100 text-violet-900'
  return 'bg-emerald-100 text-emerald-900'
}
