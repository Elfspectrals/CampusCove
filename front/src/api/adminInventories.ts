import { formatApiError, getStoredAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export interface AdminInventoryPlayer {
  account_id: number
  username: string
  email: string
}

export interface AdminInventoryRow {
  item_def_id: number
  code: string
  name: string
  quantity: number
  kind: string
  cosmetic_slot: string | null
}

export interface AdminInventoryListParams {
  q?: string
}

export interface AdminInventoryGrantBody {
  item_def_id: number
  quantity: number
}

export interface AdminInventorySetQuantityBody {
  item_def_id: number
  quantity: number
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

function parsePlayer(row: unknown): AdminInventoryPlayer | null {
  if (!isRecord(row)) return null
  if (typeof row.account_id !== 'number') return null
  if (typeof row.username !== 'string') return null
  if (typeof row.email !== 'string') return null
  return {
    account_id: row.account_id,
    username: row.username,
    email: row.email,
  }
}

function parseInventoryRow(row: unknown): AdminInventoryRow | null {
  if (!isRecord(row)) return null
  if (typeof row.item_def_id !== 'number') return null
  if (typeof row.code !== 'string') return null
  if (typeof row.name !== 'string') return null
  if (typeof row.quantity !== 'number') return null
  if (typeof row.kind !== 'string') return null
  if (!(row.cosmetic_slot === null || typeof row.cosmetic_slot === 'string')) return null
  return {
    item_def_id: row.item_def_id,
    code: row.code,
    name: row.name,
    quantity: row.quantity,
    kind: row.kind,
    cosmetic_slot: row.cosmetic_slot,
  }
}

function parseList<T>(data: unknown, key: string, parser: (row: unknown) => T | null, errorText: string): T[] {
  if (!isRecord(data)) throw new Error(errorText)
  const rows = Array.isArray(data[key]) ? data[key] : Array.isArray(data.data) ? data.data : null
  if (!rows) throw new Error(errorText)
  const parsedRows: T[] = []
  for (const row of rows) {
    const parsed = parser(row)
    if (!parsed) throw new Error(errorText)
    parsedRows.push(parsed)
  }
  return parsedRows
}

function buildQuery(params: AdminInventoryListParams): string {
  const query = new URLSearchParams()
  if (params.q && params.q.trim() !== '') query.set('q', params.q.trim())
  const stringified = query.toString()
  return stringified === '' ? '' : `?${stringified}`
}

export async function fetchAdminInventoryPlayers(params: AdminInventoryListParams = {}): Promise<{ players: AdminInventoryPlayer[] }> {
  const res = await fetch(`${API_BASE}/admin/inventories/players${buildQuery(params)}`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return { players: parseList(data, 'players', parsePlayer, 'Invalid admin players response') }
}

export async function fetchAdminPlayerInventory(accountId: number): Promise<{ items: AdminInventoryRow[] }> {
  const res = await fetch(`${API_BASE}/admin/inventories/${accountId}`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return { items: parseList(data, 'items', parseInventoryRow, 'Invalid admin inventory response') }
}

export async function grantAdminInventoryItem(accountId: number, body: AdminInventoryGrantBody): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/inventories/${accountId}/grant`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  if (res.ok) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}

export async function setAdminInventoryQuantity(accountId: number, body: AdminInventorySetQuantityBody): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/inventories/${accountId}/set-quantity`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  if (res.ok) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}

export async function removeAdminInventoryItem(accountId: number, itemDefId: number, quantity: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/inventories/${accountId}/revoke`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ item_def_id: itemDefId, quantity }),
  })
  if (res.ok) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}

export async function equipAdminBodySkin(accountId: number, itemDefId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/inventories/${accountId}/equip`, {
    method: 'POST',
    headers: authJsonHeaders(),
    body: JSON.stringify({ item_def_id: itemDefId }),
  })
  if (res.ok) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}

export async function resetAdminInventory(accountId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/admin/inventories/${accountId}/reset`, {
    method: 'POST',
    headers: authJsonHeaders(),
  })
  if (res.ok) return
  const data: unknown = await res.json().catch(() => ({}))
  throw new Error(formatApiError(data))
}
