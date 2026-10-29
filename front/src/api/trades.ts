/**
 * Trades API: GET /trades/offerable lists what the player can put in a trade. The trade itself is negotiated and
 * executed through the realtime server (socket/src/trade.ts), never called from here.
 */
import { apiRequest, isRecord } from './http'

export interface OfferableItem {
  item_def_id: number
  code: string
  name: string
  kind: string
  quantity: number
  preview_image: string | null
  cosmetic_slot: string | null
}

function parseOfferableItem(raw: unknown): OfferableItem | null {
  if (!isRecord(raw)) return null
  if (typeof raw.item_def_id !== 'number' || typeof raw.code !== 'string' || typeof raw.name !== 'string') return null
  if (typeof raw.kind !== 'string' || typeof raw.quantity !== 'number') return null
  return {
    item_def_id: raw.item_def_id,
    code: raw.code,
    name: raw.name,
    kind: raw.kind,
    quantity: raw.quantity,
    preview_image: typeof raw.preview_image === 'string' ? raw.preview_image : null,
    cosmetic_slot: typeof raw.cosmetic_slot === 'string' ? raw.cosmetic_slot : null,
  }
}

export async function fetchOfferable(): Promise<{ coins: number; items: OfferableItem[] }> {
  const data = await apiRequest('/trades/offerable')
  if (!isRecord(data) || typeof data.coins !== 'number' || !Array.isArray(data.items)) throw new Error('Invalid offerable response')
  return {
    coins: data.coins,
    items: data.items.map(parseOfferableItem).filter((it): it is OfferableItem => it !== null),
  }
}
