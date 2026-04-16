/**
 * Account inventory API (Laravel `/api` + `auth:sanctum`).
 * GET /inventory — optional query: `kind`, `q`
 */
import { formatApiError, getStoredAuth } from './auth'
import { normalizeApiAssetUrl } from './url'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** Matches `item_kind` / admin shop kinds; empty means no filter. */
export type InventoryKindFilter = '' | 'furniture' | 'cosmetic' | 'consumable' | 'misc'

export interface InventoryItemDef {
  item_def_id: number
  code: string
  name: string
  kind: string
  rarity: number
  tradable: boolean
  premium_only: boolean
  bind: string
  max_stack: number
  /** Set for `kind === 'cosmetic'` wearables. */
  cosmetic_slot?: string | null
  preview_image?: string | null
  model_glb?: string | null
}

export interface AccountInventoryRow {
  /** Stable row id for keys (stack id or synthetic fallback). */
  id: number
  quantity: number
  item: InventoryItemDef
}

export interface InventoryListParams {
  kind?: InventoryKindFilter
  q?: string
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

function normalizeCosmeticSlot(slot: unknown): string | null {
  if (typeof slot !== 'string') return null
  const normalized = slot.trim().toLowerCase()
  return normalized === '' ? null : normalized
}

function parseInventoryItemDef(row: unknown): InventoryItemDef | null {
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
  const def: InventoryItemDef = {
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
  const normalizedSlot = normalizeCosmeticSlot(row.cosmetic_slot)
  if (normalizedSlot !== null) def.cosmetic_slot = normalizedSlot
  def.preview_image = normalizeApiAssetUrl(typeof row.preview_image === 'string' ? row.preview_image : null)
  def.model_glb = normalizeApiAssetUrl(typeof row.model_glb === 'string' ? row.model_glb : null)
  return def
}

function parseRowId(row: Record<string, unknown>, itemDefId: number): number {
  if (typeof row.stack_id === 'number') return row.stack_id
  if (typeof row.inventory_stack_id === 'number') return row.inventory_stack_id
  if (typeof row.account_inventory_id === 'number') return row.account_inventory_id
  if (typeof row.id === 'number') return row.id
  return itemDefId
}

function parseInventoryRow(row: unknown): AccountInventoryRow | null {
  if (!isRecord(row)) return null
  if (typeof row.quantity !== 'number') return null
  const candidate = isRecord(row.item) ? row.item : row
  const item = parseInventoryItemDef(candidate)
  if (!item) return null
  return {
    id: parseRowId(row, item.item_def_id),
    quantity: row.quantity,
    item,
  }
}

function parseListPayload(data: unknown): { items: AccountInventoryRow[] } {
  if (!isRecord(data)) throw new Error('Invalid inventory response')
  const rawList = Array.isArray(data.data) ? data.data : Array.isArray(data.items) ? data.items : null
  if (rawList === null) throw new Error('Invalid inventory response')
  const items: AccountInventoryRow[] = []
  for (const row of rawList) {
    const parsed = parseInventoryRow(row)
    if (!parsed) throw new Error('Invalid inventory row')
    items.push(parsed)
  }
  return { items }
}

function buildListQuery(params: InventoryListParams): string {
  const q = new URLSearchParams()
  if (params.kind !== undefined && params.kind !== '') q.set('kind', params.kind)
  const search = params.q?.trim()
  if (search !== undefined && search !== '') q.set('q', search)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export async function fetchAccountInventory(params: InventoryListParams = {}): Promise<{ items: AccountInventoryRow[] }> {
  const res = await fetch(`${API_BASE}/inventory${buildListQuery(params)}`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseListPayload(data)
}
