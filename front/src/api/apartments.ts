/** Apartment decoration endpoints (placement itself goes through the realtime server). */
import { apiRequest, isRecord } from './http'
import { normalizeApiAssetUrl } from './url'
import type { ApartmentInventoryItem } from '../types/gameRealtime'

function parseOwnedItem(raw: unknown): ApartmentInventoryItem | null {
  if (!isRecord(raw)) return null
  if (typeof raw.item_def_id !== 'number') return null
  if (typeof raw.code !== 'string') return null
  if (typeof raw.name !== 'string') return null
  if (typeof raw.kind !== 'string') return null
  if (typeof raw.quantity !== 'number') return null
  return {
    item_def_id: raw.item_def_id,
    code: raw.code,
    name: raw.name,
    kind: raw.kind,
    quantity: raw.quantity,
    preview_image: normalizeApiAssetUrl(typeof raw.preview_image === 'string' ? raw.preview_image : null),
    model_glb: normalizeApiAssetUrl(typeof raw.model_glb === 'string' ? raw.model_glb : null),
    portions: typeof raw.portions === 'number' ? raw.portions : null,
    portions_left: typeof raw.portions_left === 'number' ? raw.portions_left : null,
    cosmetic_slot: typeof raw.cosmetic_slot === 'string' ? raw.cosmetic_slot : null,
  }
}

/** GET /apartments/assets — the placeable items the player owns. */
export async function fetchApartmentAssets(): Promise<ApartmentInventoryItem[]> {
  const data = await apiRequest('/apartments/assets', { errorMessage: 'Could not load owned items.' })
  if (!isRecord(data) || !Array.isArray(data.items)) return []
  return data.items.map(parseOwnedItem).filter((item): item is ApartmentInventoryItem => item !== null)
}
