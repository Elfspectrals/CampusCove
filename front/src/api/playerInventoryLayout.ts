/**
 * Player inventory hotbar + grid layout persistence (Laravel `/api/inventory/layout`).
 */
import { apiFetch, apiRequest, isRecord } from './http'
import { getStoredAuth } from './session'

const SLOT_COUNT = 36

export interface PlayerInventoryLayout {
  slots: string[]
  selectedHotbarIndex: number
}

export function defaultPlayerInventoryLayout(): PlayerInventoryLayout {
  return {
    slots: Array<string>(SLOT_COUNT).fill(''),
    selectedHotbarIndex: 0,
  }
}

function slotFromApi(entry: unknown): string {
  if (typeof entry !== 'string') return ''
  return entry.trim()
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
    out.push(slotFromApi(entry))
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

/** GET /api/inventory/layout — returns defaults on any failure (does not throw). */
export async function fetchInventoryLayout(): Promise<PlayerInventoryLayout> {
  const defaults = defaultPlayerInventoryLayout()
  try {
    const res = await apiFetch('/inventory/layout')
    const data: unknown = await res.json().catch(() => ({}))
    if (!res.ok) return defaults
    if (!isRecord(data)) return defaults
    const inner = data.layout
    if (!isRecord(inner)) return defaults
    const slots = parseSlots(inner.slots)
    const idxRaw = inner.selected_hotbar_index
    const selectedHotbarIndex =
      typeof idxRaw === 'number' && !Number.isNaN(idxRaw) ? Math.floor(idxRaw) : 0
    if (!slots) return defaults
    return normalizeLayout({ slots, selectedHotbarIndex })
  } catch {
    return defaults
  }
}

/** PUT /api/inventory/layout — validates client-side before send; throws on HTTP/validation errors. */
export async function saveInventoryLayout(layout: PlayerInventoryLayout): Promise<void> {
  const normalized = normalizeLayout(layout)
  const auth = getStoredAuth()
  if (!auth?.token) throw new Error('Not authenticated')

  await apiRequest('/inventory/layout', {
    method: 'PUT',
    body: {
      slots: slotsForApiWrite(normalized.slots),
      selected_hotbar_index: normalized.selectedHotbarIndex,
    },
  })
}
