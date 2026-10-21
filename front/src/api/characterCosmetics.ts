/**
 * Character cosmetic loadout (Laravel `GET/PUT /api/character/cosmetics`, `auth:sanctum`).
 */
import { apiRequest, isRecord } from './http'

export type CosmeticSlot = 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory'

export const SLOTS: CosmeticSlot[] = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']

/** Same order as API; used for blending / UI lists. */
export const SLOT_ORDER: CosmeticSlot[] = [...SLOTS]

interface EquippedCosmetic {
  item_def_id: number
  code: string
  name: string
  cosmetic_slot: string | null
  preview_image: string | null
  model_glb: string | null
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
    preview_image: typeof raw.preview_image === 'string' ? raw.preview_image : null,
    model_glb: typeof raw.model_glb === 'string' ? raw.model_glb : null,
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

export function bodyModelGlbFromLoadout(slots: CosmeticLoadout): string | null {
  const value = slots.body?.model_glb
  return typeof value === 'string' && value.length > 0 ? value : null
}

export async function fetchCharacterCosmetics(): Promise<CharacterCosmeticsState> {
  const data = await apiRequest('/character/cosmetics')
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
  const data = await apiRequest('/character/cosmetics', { method: 'PUT', body })
  return parseCharacterCosmeticsPayload(data)
}
