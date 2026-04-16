/**
 * Item Shop API (expects Laravel routes under /api):
 * - GET  /shop/items          — public catalog
 * - POST /shop/purchase       — authenticated (Bearer token)
 */
import { applyCachedBalanceAfterPurchase, formatApiError, getStoredAuth } from './auth'
import { normalizeApiAssetUrl } from './url'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type ShopCurrency = 'coins' | 'premium'

export interface ShopItemCurrencyOption {
  shop_catalog_item_id: number
  public_id: string
  currency: ShopCurrency
  price: number
}

export interface ShopItem {
  item_def_id: number
  shop_catalog_item_id: number
  public_id: string
  code: string
  name: string
  description: string | null
  preview_image: string | null
  model_glb: string | null
  options: ShopItemCurrencyOption[]
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
  if (typeof row.public_id !== 'string') return null
  if (typeof row.price !== 'number') return null
  const currency = parseCurrency(row.currency)
  const allowCoins = row.allow_coins === true
  const allowPremium = row.allow_premium === true
  const coinsPrice = typeof row.coins_price === 'number' ? row.coins_price : null
  const premiumPrice = typeof row.premium_price === 'number' ? row.premium_price : null
  if (!isRecord(row.item)) return null
  if (typeof row.item.item_def_id !== 'number') return null
  if (typeof row.item.code !== 'string') return null
  if (typeof row.item.name !== 'string') return null
  if (!(row.item.description === undefined || row.item.description === null || typeof row.item.description === 'string')) return null
  if (!(row.item.preview_image === undefined || row.item.preview_image === null || typeof row.item.preview_image === 'string')) return null
  if (!(row.item.model_glb === undefined || row.item.model_glb === null || typeof row.item.model_glb === 'string')) return null

  const options: ShopItemCurrencyOption[] = []
  if (allowCoins && coinsPrice !== null && coinsPrice > 0) {
    options.push({
      shop_catalog_item_id: row.shop_catalog_item_id,
      public_id: row.public_id,
      currency: 'coins',
      price: coinsPrice,
    })
  }
  if (allowPremium && premiumPrice !== null && premiumPrice > 0) {
    options.push({
      shop_catalog_item_id: row.shop_catalog_item_id,
      public_id: row.public_id,
      currency: 'premium',
      price: premiumPrice,
    })
  }
  if (options.length === 0 && currency !== null && row.price > 0) {
    options.push({
      shop_catalog_item_id: row.shop_catalog_item_id,
      public_id: row.public_id,
      currency,
      price: row.price,
    })
  }
  if (options.length === 0) return null

  return {
    item_def_id: row.item.item_def_id,
    shop_catalog_item_id: row.shop_catalog_item_id,
    public_id: row.public_id,
    code: row.item.code,
    name: row.item.name,
    description: typeof row.item.description === 'string' ? row.item.description : null,
    preview_image: normalizeApiAssetUrl(row.item.preview_image),
    model_glb: normalizeApiAssetUrl(row.item.model_glb),
    options,
  }
}

function parseCatalog(data: unknown): { items: ShopItem[] } {
  if (!isRecord(data)) throw new Error('Invalid catalog response')
  const rec = data
  if (!Array.isArray(rec.items)) throw new Error('Invalid catalog response')
  const byDef = new Map<number, ShopItem>()
  for (const row of rec.items) {
    const item = normalizeCatalogRow(row)
    if (!item) throw new Error('Invalid catalog item')
    const existing = byDef.get(item.item_def_id)
    if (!existing) {
      byDef.set(item.item_def_id, item)
      continue
    }
    const firstOption = item.options[0]
    if (!firstOption) throw new Error('Invalid catalog item')
    existing.options.push(firstOption)
    if (item.shop_catalog_item_id < existing.shop_catalog_item_id) {
      existing.shop_catalog_item_id = item.shop_catalog_item_id
      existing.public_id = item.public_id
    }
  }
  const items = Array.from(byDef.values())
  for (const item of items) {
    item.options.sort((a, b) => {
      if (a.currency === b.currency) return a.price - b.price
      return a.currency === 'coins' ? -1 : 1
    })
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

export interface PurchaseShopItemBody {
  shop_catalog_item_id?: number
  shop_item_public_id?: string
  currency?: ShopCurrency
}

export async function purchaseShopItem(body: PurchaseShopItemBody): Promise<PurchaseSuccess> {
  const res = await fetch(`${API_BASE}/shop/purchase`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
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
