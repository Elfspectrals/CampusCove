/**
 * Player inventory hotbar + grid layout persistence (Laravel `/api/inventory/layout`).
 */
import { formatApiError, getStoredAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

const SLOT_COUNT = 36

export interface PlayerInventoryLayout {
  slots: string[]
  selectedHotbarIndex: number
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

export function defaultPlayerInventoryLayout(): PlayerInventoryLayout {
  return {
    slots: Array<string>(SLOT_COUNT).fill(''),
    selectedHotbarIndex: 0,
  }
}

/**
 * Laravel's ConvertEmptyStringsToNull turns "" into null before validation.
 * A single space survives middleware and is trimmed back to "" on the server.
 */
function slotsForApiWrite(slots: string[]): string[] {
  return slots.map((slot) => (slot.trim() === '' ? ' ' : slot))
}

function parseSlots(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') return null
    out.push(entry.trim())
  }
  if (out.length !== SLOT_COUNT) return null
  return out
}

function normalizeLayout(layout: PlayerInventoryLayout): PlayerInventoryLayout {
  const slots = layout.slots.slice(0, SLOT_COUNT)
  while (slots.length < SLOT_COUNT) slots.push('')
  let selectedHotbarIndex = layout.selectedHotbarIndex
  if (typeof selectedHotbarIndex !== 'number' || Number.isNaN(selectedHotbarIndex)) selectedHotbarIndex = 0
  selectedHotbarIndex = Math.max(0, Math.min(8, Math.floor(selectedHotbarIndex)))
  return { slots, selectedHotbarIndex }
}

/** GET /api/inventory/layout — throws rather than treating a failed request as an empty layout. */
export async function fetchInventoryLayout(): Promise<PlayerInventoryLayout> {
  const auth = getStoredAuth()
  if (!auth?.token) throw new Error('Not authenticated')

  const res = await fetch(`${API_BASE}/inventory/layout`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  if (!isRecord(data) || !isRecord(data.layout)) {
    throw new Error('Invalid inventory layout response')
  }

  const slots = parseSlots(data.layout.slots)
  const selectedHotbarIndex = data.layout.selected_hotbar_index
  if (
    !slots ||
    typeof selectedHotbarIndex !== 'number' ||
    !Number.isFinite(selectedHotbarIndex) ||
    !Number.isInteger(selectedHotbarIndex) ||
    selectedHotbarIndex < 0 ||
    selectedHotbarIndex > 8
  ) {
    throw new Error('Invalid inventory layout response')
  }

  return normalizeLayout({ slots, selectedHotbarIndex })
}

/** PUT /api/inventory/layout — validates client-side before send; throws on HTTP/validation errors. */
export async function saveInventoryLayout(layout: PlayerInventoryLayout): Promise<void> {
  const normalized = normalizeLayout(layout)
  const auth = getStoredAuth()
  if (!auth?.token) throw new Error('Not authenticated')

  const res = await fetch(`${API_BASE}/inventory/layout`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify({
      slots: slotsForApiWrite(normalized.slots),
      selected_hotbar_index: normalized.selectedHotbarIndex,
    }),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
}
