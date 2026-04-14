/**
 * Admin shop API (expects Laravel routes under /api, e.g. auth:sanctum + admin middleware).
 * Endpoints are conventional REST; adjust paths here if your backend uses a different prefix.
 */
import { formatApiError, getStoredAuth } from './auth'
import { normalizeApiAssetUrl } from './url'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type ShopCurrency = 'coins' | 'premium'

export interface AdminShopItemNested {
  item_def_id: number
  code: string
  name: string
  description?: string | null
  kind: string
  rarity: number
  tradable: boolean
  premium_only: boolean
  bind: string
  max_stack: number
  preview_image?: string | null
  model_glb?: string | null
}

export interface AdminShopCatalogRow {
  shop_catalog_item_id: number
  public_id: string
  currency: ShopCurrency
  price: number
  allow_coins: boolean
  coins_price: number | null
  allow_premium: boolean
  premium_price: number | null
  is_active: boolean
  is_published: boolean
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
  previewImageFile: File | null
  modelGlbFile: File | null
  is_active: boolean
  is_published: boolean
  stock_remaining: number | null
  is_unique_per_account: boolean
}

export interface AdminShopItemUpdateBody {
  name?: string
  prices?: Partial<Record<ShopCurrency, number>>
  is_active?: boolean
  is_published?: boolean
  stock_remaining?: number | null
  is_unique_per_account?: boolean
}

export interface AdminShopListParams {
  search?: string
  currency?: ShopCurrency | 'all'
  is_active?: boolean | 'all'
  is_published?: boolean | 'all'
}

function authHeaders(): HeadersInit {
  const auth = getStoredAuth()
  return {
    Accept: 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

function authJsonHeaders(): HeadersInit {
  return {
    ...authHeaders(),
    'Content-Type': 'application/json',
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
  if (!(row.description === undefined || row.description === null || typeof row.description === 'string')) return null
  if (!(row.preview_image === undefined || row.preview_image === null || typeof row.preview_image === 'string')) return null
  if (!(row.model_glb === undefined || row.model_glb === null || typeof row.model_glb === 'string')) return null
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
    description: row.description === undefined ? null : row.description,
    preview_image: normalizeApiAssetUrl(row.preview_image),
    model_glb: normalizeApiAssetUrl(row.model_glb),
  }
}

function parseCatalogRow(row: unknown): AdminShopCatalogRow | null {
  if (!isRecord(row)) return null
  if (typeof row.shop_catalog_item_id !== 'number') return null
  if (typeof row.public_id !== 'string') return null
  if (!isShopCurrency(row.currency)) return null
  if (typeof row.price !== 'number') return null
  if (typeof row.allow_coins !== 'boolean') return null
  if (!(row.coins_price === null || typeof row.coins_price === 'number')) return null
  if (typeof row.allow_premium !== 'boolean') return null
  if (!(row.premium_price === null || typeof row.premium_price === 'number')) return null
  if (typeof row.is_active !== 'boolean') return null
  if (typeof row.is_published !== 'boolean') return null
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
    allow_coins: row.allow_coins,
    coins_price: row.coins_price,
    allow_premium: row.allow_premium,
    premium_price: row.premium_price,
    is_active: row.is_active,
    is_published: row.is_published,
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
  if (params.is_published !== undefined && params.is_published !== 'all') {
    q.set('is_published', params.is_published ? '1' : '0')
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
  const formData = new FormData()
  formData.set('code', body.code)
  formData.set('name', body.name)
  formData.set('kind', body.kind)
  formData.set('is_active', body.is_active ? '1' : '0')
  formData.set('is_published', body.is_published ? '1' : '0')
  formData.set('is_unique_per_account', body.is_unique_per_account ? '1' : '0')
  if (body.stock_remaining !== null) {
    formData.set('stock_remaining', String(body.stock_remaining))
  }
  if (body.prices.coins !== undefined) {
    formData.set('prices[coins]', String(body.prices.coins))
  }
  if (body.prices.premium !== undefined) {
    formData.set('prices[premium]', String(body.prices.premium))
  }
  if (body.previewImageFile) {
    formData.set('preview_image_file', body.previewImageFile)
  }
  if (body.modelGlbFile) {
    formData.set('model_glb_file', body.modelGlbFile)
  }

  const res = await fetch(`${API_BASE}/admin/shop/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
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
