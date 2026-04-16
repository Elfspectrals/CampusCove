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
  cosmetic_slot?: string | null
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
  deleted_at?: string | null
  item: AdminShopItemNested
}

export interface AdminShopItemCreateBody {
  code: string
  name: string
  kind: 'furniture' | 'cosmetic' | 'consumable' | 'misc'
  rarity?: number
  tradable?: boolean
  premium_only?: boolean
  bind?: 'none' | 'bind_on_equip' | 'bind_on_place' | 'bound'
  max_stack?: number
  cosmetic_slot?: 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory' | null
  preview_image?: string | null
  model_glb?: string | null
  prices: Partial<Record<ShopCurrency, number>>
  previewImageFile: File | null
  modelGlbFile: File | null
  is_active: boolean
  is_published: boolean
  stock_remaining: number | null
  is_unique_per_account: boolean
  sort_order?: number
}

export interface AdminShopItemUpdateBody {
  code?: string
  name?: string
  kind?: 'furniture' | 'cosmetic' | 'consumable' | 'misc'
  rarity?: number
  tradable?: boolean
  premium_only?: boolean
  bind?: 'none' | 'bind_on_equip' | 'bind_on_place' | 'bound'
  max_stack?: number
  cosmetic_slot?: 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory' | null
  preview_image?: string | null
  model_glb?: string | null
  previewImageFile?: File | null
  modelGlbFile?: File | null
  sort_order?: number
  currency?: ShopCurrency
  price?: number
  prices?: Partial<Record<ShopCurrency, number>>
  is_active?: boolean
  is_published?: boolean
  stock_remaining?: number | null
  is_unique_per_account?: boolean
}

export interface AdminShopListParams {
  search?: string
  currency?: ShopCurrency | 'all'
  kind?: 'furniture' | 'cosmetic' | 'consumable' | 'misc' | 'all'
  with_deleted?: boolean
  only_deleted?: boolean
  is_active?: boolean | 'all'
  is_published?: boolean | 'all'
  sort_by?: 'name' | 'code' | 'kind' | 'price' | 'is_active' | 'is_published' | 'updated_at' | 'sort_order'
  sort_dir?: 'asc' | 'desc'
  page?: number
  per_page?: number
}

export interface AdminShopListMeta {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface AdminShopBulkActionBody {
  action: 'publish' | 'unpublish' | 'activate' | 'deactivate' | 'soft_delete' | 'restore'
  ids: number[]
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
  if (!(row.cosmetic_slot === undefined || row.cosmetic_slot === null || typeof row.cosmetic_slot === 'string')) return null
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
    cosmetic_slot: row.cosmetic_slot === undefined ? null : row.cosmetic_slot,
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
  if (!(row.deleted_at === undefined || row.deleted_at === null || typeof row.deleted_at === 'string')) return null
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
    deleted_at: row.deleted_at === undefined ? null : row.deleted_at,
    item,
  }
}

function parseListPayload(data: unknown): { items: AdminShopCatalogRow[]; meta: AdminShopListMeta } {
  if (!isRecord(data)) throw new Error('Invalid admin shop list response')
  if (!Array.isArray(data.data)) throw new Error('Invalid admin shop list response')
  if (!isRecord(data.meta)) throw new Error('Invalid admin shop list response')
  if (typeof data.meta.current_page !== 'number') throw new Error('Invalid admin shop list response')
  if (typeof data.meta.last_page !== 'number') throw new Error('Invalid admin shop list response')
  if (typeof data.meta.per_page !== 'number') throw new Error('Invalid admin shop list response')
  if (typeof data.meta.total !== 'number') throw new Error('Invalid admin shop list response')
  const items: AdminShopCatalogRow[] = []
  for (const row of data.data) {
    const item = parseCatalogRow(row)
    if (!item) throw new Error('Invalid admin shop row')
    items.push(item)
  }
  return {
    items,
    meta: {
      current_page: data.meta.current_page,
      last_page: data.meta.last_page,
      per_page: data.meta.per_page,
      total: data.meta.total,
    },
  }
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
  if (params.kind !== undefined && params.kind !== 'all') q.set('kind', params.kind)
  if (params.with_deleted) q.set('with_deleted', '1')
  if (params.only_deleted) q.set('only_deleted', '1')
  if (params.is_active !== undefined && params.is_active !== 'all') {
    q.set('is_active', params.is_active ? '1' : '0')
  }
  if (params.is_published !== undefined && params.is_published !== 'all') {
    q.set('is_published', params.is_published ? '1' : '0')
  }
  if (params.sort_by) q.set('sort_by', params.sort_by)
  if (params.sort_dir) q.set('sort_dir', params.sort_dir)
  if (params.page !== undefined) q.set('page', String(params.page))
  if (params.per_page !== undefined) q.set('per_page', String(params.per_page))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export async function fetchAdminShopItems(
  params: AdminShopListParams = {}
): Promise<{ items: AdminShopCatalogRow[]; meta: AdminShopListMeta }> {
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
  if (body.rarity !== undefined) formData.set('rarity', String(body.rarity))
  if (body.tradable !== undefined) formData.set('tradable', body.tradable ? '1' : '0')
  if (body.premium_only !== undefined) formData.set('premium_only', body.premium_only ? '1' : '0')
  if (body.bind !== undefined) formData.set('bind', body.bind)
  if (body.max_stack !== undefined) formData.set('max_stack', String(body.max_stack))
  if (body.cosmetic_slot !== undefined && body.cosmetic_slot !== null) formData.set('cosmetic_slot', body.cosmetic_slot)
  if (body.preview_image !== undefined && body.preview_image !== null) formData.set('preview_image', body.preview_image)
  if (body.model_glb !== undefined && body.model_glb !== null) formData.set('model_glb', body.model_glb)
  formData.set('is_active', body.is_active ? '1' : '0')
  formData.set('is_published', body.is_published ? '1' : '0')
  formData.set('is_unique_per_account', body.is_unique_per_account ? '1' : '0')
  if (body.stock_remaining !== null) {
    formData.set('stock_remaining', String(body.stock_remaining))
  }
  if (body.sort_order !== undefined) {
    formData.set('sort_order', String(body.sort_order))
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
  const usesMultipart = body.previewImageFile !== undefined || body.modelGlbFile !== undefined
  let res: Response
  if (usesMultipart) {
    const formData = new FormData()
    if (body.code !== undefined) formData.set('code', body.code)
    if (body.name !== undefined) formData.set('name', body.name)
    if (body.kind !== undefined) formData.set('kind', body.kind)
    if (body.rarity !== undefined) formData.set('rarity', String(body.rarity))
    if (body.tradable !== undefined) formData.set('tradable', body.tradable ? '1' : '0')
    if (body.premium_only !== undefined) formData.set('premium_only', body.premium_only ? '1' : '0')
    if (body.bind !== undefined) formData.set('bind', body.bind)
    if (body.max_stack !== undefined) formData.set('max_stack', String(body.max_stack))
    if (body.cosmetic_slot !== undefined) formData.set('cosmetic_slot', body.cosmetic_slot ?? '')
    if (body.preview_image !== undefined) formData.set('preview_image', body.preview_image ?? '')
    if (body.model_glb !== undefined) formData.set('model_glb', body.model_glb ?? '')
    if (body.currency !== undefined) formData.set('currency', body.currency)
    if (body.price !== undefined) formData.set('price', String(body.price))
    if (body.prices?.coins !== undefined) formData.set('prices[coins]', String(body.prices.coins))
    if (body.prices?.premium !== undefined) formData.set('prices[premium]', String(body.prices.premium))
    if (body.is_active !== undefined) formData.set('is_active', body.is_active ? '1' : '0')
    if (body.is_published !== undefined) formData.set('is_published', body.is_published ? '1' : '0')
    if (body.is_unique_per_account !== undefined) {
      formData.set('is_unique_per_account', body.is_unique_per_account ? '1' : '0')
    }
    if (body.stock_remaining !== undefined) formData.set('stock_remaining', body.stock_remaining === null ? '' : String(body.stock_remaining))
    if (body.sort_order !== undefined) formData.set('sort_order', String(body.sort_order))
    if (body.previewImageFile) formData.set('preview_image_file', body.previewImageFile)
    if (body.modelGlbFile) formData.set('model_glb_file', body.modelGlbFile)
    res = await fetch(`${API_BASE}/admin/shop/items/${shopCatalogItemId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: formData,
    })
  } else {
    const jsonBody: Record<string, unknown> = {}
    if (body.code !== undefined) jsonBody.code = body.code
    if (body.name !== undefined) jsonBody.name = body.name
    if (body.kind !== undefined) jsonBody.kind = body.kind
    if (body.rarity !== undefined) jsonBody.rarity = body.rarity
    if (body.tradable !== undefined) jsonBody.tradable = body.tradable
    if (body.premium_only !== undefined) jsonBody.premium_only = body.premium_only
    if (body.bind !== undefined) jsonBody.bind = body.bind
    if (body.max_stack !== undefined) jsonBody.max_stack = body.max_stack
    if (body.cosmetic_slot !== undefined) jsonBody.cosmetic_slot = body.cosmetic_slot
    if (body.preview_image !== undefined) jsonBody.preview_image = body.preview_image
    if (body.model_glb !== undefined) jsonBody.model_glb = body.model_glb
    if (body.currency !== undefined) jsonBody.currency = body.currency
    if (body.price !== undefined) jsonBody.price = body.price
    if (body.prices !== undefined) jsonBody.prices = body.prices
    if (body.is_active !== undefined) jsonBody.is_active = body.is_active
    if (body.is_published !== undefined) jsonBody.is_published = body.is_published
    if (body.is_unique_per_account !== undefined) jsonBody.is_unique_per_account = body.is_unique_per_account
    if (body.stock_remaining !== undefined) jsonBody.stock_remaining = body.stock_remaining
    if (body.sort_order !== undefined) jsonBody.sort_order = body.sort_order
    res = await fetch(`${API_BASE}/admin/shop/items/${shopCatalogItemId}`, {
      method: 'PATCH',
      headers: authJsonHeaders(),
      body: JSON.stringify(jsonBody),
    })
  }
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

export async function restoreAdminShopItem(shopCatalogItemId: number): Promise<AdminShopCatalogRow> {
  const res = await fetch(`${API_BASE}/admin/shop/items/${shopCatalogItemId}/restore`, {
    method: 'POST',
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseSinglePayload(data)
}

export async function bulkAdminShopAction(body: AdminShopBulkActionBody): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/shop/items/bulk`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({
      action: body.action,
      ids: body.ids,
      shop_catalog_item_ids: body.ids,
    }),
  })
  if (res.status === 204 || res.status === 200) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}
