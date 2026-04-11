/**
 * Admin shop API (expects Laravel routes under /api, e.g. auth:sanctum + admin middleware).
 * Endpoints are conventional REST; adjust paths here if your backend uses a different prefix.
 */
import { formatApiError, getStoredAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type ShopCurrency = 'coins' | 'premium'

export interface AdminShopItemNested {
  item_def_id: number
  code: string
  name: string
  kind: string
  rarity: number
  tradable: boolean
  premium_only: boolean
  bind: string
  max_stack: number
}

export interface AdminShopCatalogRow {
  shop_catalog_item_id: number
  public_id: string
  currency: ShopCurrency
  price: number
  is_active: boolean
  is_unique_per_account: boolean
  stock_remaining: number | null
  sort_order: number
  item: AdminShopItemNested
}

export interface AdminShopItemCreateBody {
  code: string
  name: string
  kind: 'furniture' | 'cosmetic' | 'consumable' | 'misc'
  prices: Partial<Record<ShopCurrency, number>>
  is_active: boolean
  stock_remaining: number | null
  is_unique_per_account: boolean
}

export interface AdminShopItemUpdateBody {
  name: string
  currency: ShopCurrency
  price: number
  is_active: boolean
  stock_remaining: number | null
  is_unique_per_account: boolean
}

export interface AdminShopListParams {
  search?: string
  currency?: ShopCurrency | 'all'
  is_active?: boolean | 'all'
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

function isShopCurrency(value: unknown): value is ShopCurrency {
  return value === 'coins' || value === 'premium'
}

function parseNestedItem(row: unknown): AdminShopItemNested | null {
  if (!isRecord(row)) return null
  if (typeof row.item_def_id !== 'number') return null
  if (typeof row.code !== 'string') return null
  if (typeof row.name !== 'string') return null
  if (typeof row.kind !== 'string') return null
  if (typeof row.rarity !== 'number') return null
  if (typeof row.tradable !== 'boolean') return null
  if (typeof row.premium_only !== 'boolean') return null
  if (typeof row.bind !== 'string') return null
  if (typeof row.max_stack !== 'number') return null
  return {
    item_def_id: row.item_def_id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    rarity: row.rarity,
    tradable: row.tradable,
    premium_only: row.premium_only,
    bind: row.bind,
    max_stack: row.max_stack,
  }
}

function parseCatalogRow(row: unknown): AdminShopCatalogRow | null {
  if (!isRecord(row)) return null
  if (typeof row.shop_catalog_item_id !== 'number') return null
  if (typeof row.public_id !== 'string') return null
  if (!isShopCurrency(row.currency)) return null
  if (typeof row.price !== 'number') return null
  if (typeof row.is_active !== 'boolean') return null
  if (typeof row.is_unique_per_account !== 'boolean') return null
  if (!(row.stock_remaining === null || typeof row.stock_remaining === 'number')) return null
  if (typeof row.sort_order !== 'number') return null
  const item = parseNestedItem(row.item)
  if (!item) return null
  return {
    shop_catalog_item_id: row.shop_catalog_item_id,
    public_id: row.public_id,
    currency: row.currency,
    price: row.price,
    is_active: row.is_active,
    is_unique_per_account: row.is_unique_per_account,
    stock_remaining: row.stock_remaining,
    sort_order: row.sort_order,
    item,
  }
}

function parseListPayload(data: unknown): { items: AdminShopCatalogRow[] } {
  if (!isRecord(data)) throw new Error('Invalid admin shop list response')
  if (!Array.isArray(data.data)) throw new Error('Invalid admin shop list response')
  const items: AdminShopCatalogRow[] = []
  for (const row of data.data) {
    const item = parseCatalogRow(row)
    if (!item) throw new Error('Invalid admin shop row')
    items.push(item)
  }
  return { items }
}

function parseSinglePayload(data: unknown): AdminShopCatalogRow {
  if (!isRecord(data)) throw new Error('Invalid admin shop response')
  const row = data.item ?? data.data ?? (Array.isArray(data.items) ? data.items[0] : data)
  const parsed = parseCatalogRow(row)
  if (!parsed) throw new Error('Invalid admin shop row')
  return parsed
}

function buildListQuery(params: AdminShopListParams): string {
  const q = new URLSearchParams()
  if (params.search !== undefined && params.search.trim() !== '') q.set('q', params.search.trim())
  if (params.currency !== undefined && params.currency !== 'all') q.set('currency', params.currency)
  if (params.is_active !== undefined && params.is_active !== 'all') {
    q.set('is_active', params.is_active ? '1' : '0')
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export async function fetchAdminShopItems(params: AdminShopListParams = {}): Promise<{ items: AdminShopCatalogRow[] }> {
  const res = await fetch(`${API_BASE}/admin/shop/items${buildListQuery(params)}`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseListPayload(data)
}

export async function createAdminShopItem(body: AdminShopItemCreateBody): Promise<AdminShopCatalogRow> {
  const res = await fetch(`${API_BASE}/admin/shop/items`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseSinglePayload(data)
}

export async function updateAdminShopItem(
  shopCatalogItemId: number,
  body: AdminShopItemUpdateBody
): Promise<AdminShopCatalogRow> {
  const res = await fetch(`${API_BASE}/admin/shop/items/${shopCatalogItemId}`, {
    method: 'PATCH',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseSinglePayload(data)
}

export async function deleteAdminShopItem(shopCatalogItemId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/shop/items/${shopCatalogItemId}`, {
    method: 'DELETE',
    headers: authJsonHeaders(),
  })
  if (res.status === 204 || res.status === 200) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}
