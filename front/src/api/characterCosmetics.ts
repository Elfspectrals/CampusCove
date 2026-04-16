/**
 * Character cosmetic loadout (Laravel `GET/PUT /api/character/cosmetics`, `auth:sanctum`).
 */
import { formatApiError, getStoredAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export type CosmeticSlot = 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory'

export const SLOTS: CosmeticSlot[] = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']

/** Same order as API; used for blending / UI lists. */
export const SLOT_ORDER: CosmeticSlot[] = [...SLOTS]

export interface EquippedCosmetic {
  item_def_id: number
  code: string
  name: string
  cosmetic_slot: string | null
}

export type CosmeticLoadout = Record<CosmeticSlot, EquippedCosmetic | null>

/** `#RRGGBB` per slot (matches Laravel). */
export type CosmeticColors = Record<CosmeticSlot, string>

export interface CharacterCosmeticsState {
  slots: CosmeticLoadout
  colors: CosmeticColors
}

export const DEFAULT_SLOT_COLORS: CosmeticColors = {
  body: '#8B7AA8',
  hair: '#6B5B95',
  top: '#9B8ABF',
  bottom: '#5A4E72',
  shoes: '#4A3F62',
  head_accessory: '#7A6B94',
}

export function emptyCosmeticLoadout(): CosmeticLoadout {
  return {
    body: null,
    hair: null,
    top: null,
    bottom: null,
    shoes: null,
    head_accessory: null,
  }
}

export function defaultCosmeticColors(): CosmeticColors {
  return { ...DEFAULT_SLOT_COLORS }
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

function parseEquipped(raw: unknown): EquippedCosmetic | null {
  if (raw === null) return null
  if (!isRecord(raw)) return null
  if (typeof raw.item_def_id !== 'number') return null
  if (typeof raw.code !== 'string') return null
  if (typeof raw.name !== 'string') return null
  const cs = normalizeCosmeticSlot(raw.cosmetic_slot)
  return {
    item_def_id: raw.item_def_id,
    code: raw.code,
    name: raw.name,
    cosmetic_slot: cs,
  }
}

function parseColors(raw: unknown): CosmeticColors {
  if (!isRecord(raw)) return defaultCosmeticColors()
  const out: Partial<CosmeticColors> = {}
  for (const slot of SLOTS) {
    const v = raw[slot]
    if (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) {
      out[slot] = v
    } else {
      out[slot] = DEFAULT_SLOT_COLORS[slot]
    }
  }
  return out as CosmeticColors
}

function parseCharacterCosmeticsPayload(data: unknown): CharacterCosmeticsState {
  if (!isRecord(data)) throw new Error('Invalid cosmetics response')
  const rawSlots = data.slots
  if (!isRecord(rawSlots)) throw new Error('Invalid cosmetics response')
  const slots: Partial<CosmeticLoadout> = {}
  for (const slot of SLOTS) {
    slots[slot] = parseEquipped(rawSlots[slot])
  }
  return {
    slots: slots as CosmeticLoadout,
    colors: parseColors(data.colors),
  }
}

export function appearanceIdsFromLoadout(slots: CosmeticLoadout): Record<CosmeticSlot, number | null> {
  const out = {} as Record<CosmeticSlot, number | null>
  for (const slot of SLOTS) {
    const e = slots[slot]
    out[slot] = e ? e.item_def_id : null
  }
  return out
}

export function appearanceCodesFromLoadout(slots: CosmeticLoadout): Record<CosmeticSlot, string | null> {
  const out = {} as Record<CosmeticSlot, string | null>
  for (const slot of SLOTS) {
    const e = slots[slot]
    out[slot] = e ? e.code : null
  }
  return out
}

export async function fetchCharacterCosmetics(): Promise<CharacterCosmeticsState> {
  const res = await fetch(`${API_BASE}/character/cosmetics`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseCharacterCosmeticsPayload(data)
}

export interface PutCharacterCosmeticsPayload {
  slots?: Partial<Record<CosmeticSlot, number | null>>
  colors?: Partial<Record<CosmeticSlot, string | null>>
}

export async function putCharacterCosmetics(payload: PutCharacterCosmeticsPayload): Promise<CharacterCosmeticsState> {
  const body: Record<string, unknown> = {}
  if (payload.slots !== undefined) body.slots = payload.slots
  if (payload.colors !== undefined) body.colors = payload.colors
  const res = await fetch(`${API_BASE}/character/cosmetics`, {
    method: 'PUT',
    headers: authJsonHeaders(),
    body: JSON.stringify(body),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  return parseCharacterCosmeticsPayload(data)
}
