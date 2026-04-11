/**
 * Item Shop API (expects Laravel routes under /api):
 * - GET  /shop/items          — public catalog
 * - POST /shop/purchase       — authenticated (Bearer token)
 */
import { applyCachedBalanceAfterPurchase, formatApiError, getStoredAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type ShopCurrency = 'coins' | 'premium'

export interface ShopItem {
  shop_catalog_item_id: number
  code: string
  name: string
  description: string | null
  /** Price in `currency` units (legacy field name). */
  price_coins: number
  currency: ShopCurrency
}

export interface PurchaseSuccess {
  message: string
  shop_catalog_item_id?: number
  balance_after: number
  currency: ShopCurrency
  total_debit: number
}

function authJsonHeaders(): HeadersInit {
  const auth = getStoredAuth()
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCurrency(value: unknown): ShopCurrency | null {
  if (value === 'coins' || value === 'premium') return value
  return null
}

function normalizeCatalogRow(row: unknown): ShopItem | null {
  if (!isRecord(row)) return null
  if (typeof row.shop_catalog_item_id !== 'number') return null
  if (typeof row.price !== 'number') return null
  const currency = parseCurrency(row.currency)
  if (currency === null) return null
  if (!isRecord(row.item)) return null
  if (typeof row.item.code !== 'string') return null
  if (typeof row.item.name !== 'string') return null
  if (!(row.item.description === undefined || row.item.description === null || typeof row.item.description === 'string')) return null

  return {
    shop_catalog_item_id: row.shop_catalog_item_id,
    code: row.item.code,
    name: row.item.name,
    description: typeof row.item.description === 'string' ? row.item.description : null,
    price_coins: row.price,
    currency,
  }
}

function parseCatalog(data: unknown): { items: ShopItem[] } {
  if (!isRecord(data)) throw new Error('Invalid catalog response')
  const rec = data
  if (!Array.isArray(rec.items)) throw new Error('Invalid catalog response')
  const items: ShopItem[] = []
  for (const row of rec.items) {
    const item = normalizeCatalogRow(row)
    if (!item) throw new Error('Invalid catalog item')
    items.push(item)
  }
  return { items }
}

export async function fetchItemShopCatalog(): Promise<{ items: ShopItem[] }> {
  const res = await fetch(`${API_BASE}/shop/items`, {
    headers: { Accept: 'application/json' },
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseCatalog(data)
}

export async function purchaseShopItem(shopCatalogItemId: number): Promise<PurchaseSuccess> {
  const res = await fetch(`${API_BASE}/shop/purchase`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ shop_catalog_item_id: shopCatalogItemId }),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  if (!isRecord(data)) throw new Error('Invalid purchase response')
  if (!isRecord(data.purchase)) throw new Error('Invalid purchase response')

  const purchase = data.purchase
  const totalDebit = typeof purchase.total_debit === 'number' ? purchase.total_debit : null
  const currency = parseCurrency(purchase.currency)
  const balanceAfter = typeof purchase.balance_after === 'number' ? purchase.balance_after : null
  if (totalDebit === null || currency === null || balanceAfter === null) {
    throw new Error('Invalid purchase response')
  }

  applyCachedBalanceAfterPurchase(currency, balanceAfter)

  const message = `Purchase successful (-${totalDebit.toLocaleString()} ${currency})`
  const shopItem = isRecord(purchase.shop_item) ? purchase.shop_item : null
  const parsedId = shopItem && typeof shopItem.shop_catalog_item_id === 'number'
    ? shopItem.shop_catalog_item_id
    : undefined

  return {
    message,
    shop_catalog_item_id: parsedId,
    balance_after: balanceAfter,
    currency,
    total_debit: totalDebit,
  }
}
