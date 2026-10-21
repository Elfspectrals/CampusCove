import { apiRequest, isRecord } from './http'

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

export async function fetchAdminInventoryPlayers(params: AdminInventoryListParams = {}): Promise<{ players: AdminInventoryPlayer[] }> {
  const data = await apiRequest('/admin/inventories/players', { query: { q: params.q?.trim() } })
  return { players: parseList(data, 'players', parsePlayer, 'Invalid admin players response') }
}

export async function fetchAdminPlayerInventory(accountId: number): Promise<{ items: AdminInventoryRow[] }> {
  const data = await apiRequest(`/admin/inventories/${accountId}`)
  return { items: parseList(data, 'items', parseInventoryRow, 'Invalid admin inventory response') }
}

export async function grantAdminInventoryItem(accountId: number, body: AdminInventoryGrantBody): Promise<void> {
  await apiRequest(`/admin/inventories/${accountId}/grant`, { method: 'POST', body })
}

export async function setAdminInventoryQuantity(accountId: number, body: AdminInventorySetQuantityBody): Promise<void> {
  await apiRequest(`/admin/inventories/${accountId}/set-quantity`, { method: 'POST', body })
}

export async function removeAdminInventoryItem(accountId: number, itemDefId: number, quantity: number): Promise<void> {
  await apiRequest(`/admin/inventories/${accountId}/revoke`, { method: 'POST', body: { item_def_id: itemDefId, quantity } })
}

export async function equipAdminBodySkin(accountId: number, itemDefId: number): Promise<void> {
  await apiRequest(`/admin/inventories/${accountId}/equip`, { method: 'POST', body: { item_def_id: itemDefId } })
}

export async function resetAdminInventory(accountId: number): Promise<void> {
  await apiRequest(`/admin/inventories/${accountId}/reset`, { method: 'POST' })
}
