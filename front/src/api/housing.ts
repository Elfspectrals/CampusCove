/**
 * Housing API (Laravel routes under /api):
 * - GET  /housing/units
 * - POST /housing/units/{publicId}/buy|rent|renew
 */
import { fetchCurrentUser, formatApiError, getStoredAuth } from './auth'
import type { HousingUnitPayload } from '../types/gameRealtime'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function authJsonHeaders(): HeadersInit {
  const auth = getStoredAuth()
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

export function parseHousingUnit(raw: unknown): HousingUnitPayload | null {
  if (!isRecord(raw)) return null
  if (typeof raw.unit_id !== 'number') return null
  if (typeof raw.public_id !== 'string') return null
  if (typeof raw.offer_type !== 'string') return null
  if (typeof raw.price_coins !== 'number') return null
  if (typeof raw.rent_duration_hours !== 'number') return null
  if (typeof raw.pos_x !== 'number') return null
  if (typeof raw.pos_y !== 'number') return null
  if (typeof raw.pos_z !== 'number') return null
  if (typeof raw.size !== 'number') return null
  if (typeof raw.base_color_hex !== 'string') return null
  if (typeof raw.status !== 'string') return null
  if (!(raw.occupant_account_id === null || typeof raw.occupant_account_id === 'number')) return null
  if (!(raw.lease_expires_at === null || typeof raw.lease_expires_at === 'string')) return null
  if (!(raw.room_public_id === null || typeof raw.room_public_id === 'string')) return null
  if (typeof raw.template_key !== 'string') return null

  return {
    unit_id: raw.unit_id,
    public_id: raw.public_id,
    offer_type: raw.offer_type,
    price_coins: raw.price_coins,
    rent_duration_hours: raw.rent_duration_hours,
    pos_x: raw.pos_x,
    pos_y: raw.pos_y,
    pos_z: raw.pos_z,
    size: raw.size,
    base_color_hex: raw.base_color_hex,
    status: raw.status,
    occupant_account_id: raw.occupant_account_id,
    lease_expires_at: raw.lease_expires_at,
    room_public_id: raw.room_public_id,
    template_key: raw.template_key,
  }
}

function parseUnitsList(raw: unknown): HousingUnitPayload[] {
  if (!Array.isArray(raw)) return []
  const out: HousingUnitPayload[] = []
  for (const row of raw) {
    const unit = parseHousingUnit(row)
    if (unit) out.push(unit)
  }
  return out
}

export interface HousingUnitsResponse {
  units: HousingUnitPayload[]
  my_unit: HousingUnitPayload | null
}

export async function fetchHousingUnits(): Promise<HousingUnitsResponse> {
  const res = await fetch(`${API_BASE}/housing/units`, {
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  if (!isRecord(data)) throw new Error('Invalid housing units response')
  const units = parseUnitsList(data.units)
  const myUnitRaw = data.my_unit
  const my_unit = myUnitRaw === null || myUnitRaw === undefined ? null : parseHousingUnit(myUnitRaw)
  if (myUnitRaw !== null && myUnitRaw !== undefined && my_unit === null) {
    throw new Error('Invalid housing units response')
  }
  return { units, my_unit }
}

async function refreshWalletAfterClaim(): Promise<void> {
  await fetchCurrentUser()
}

async function postHousingAction(publicId: string, action: 'buy' | 'rent' | 'renew'): Promise<HousingUnitPayload> {
  const res = await fetch(`${API_BASE}/housing/units/${encodeURIComponent(publicId)}/${action}`, {
    method: 'POST',
    headers: authJsonHeaders(),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  if (!isRecord(data)) throw new Error('Invalid housing response')
  const unit = parseHousingUnit(data.unit)
  if (!unit) throw new Error('Invalid housing response')
  await refreshWalletAfterClaim()
  return unit
}

export async function buyHousingUnit(publicId: string): Promise<HousingUnitPayload> {
  return postHousingAction(publicId, 'buy')
}

export async function rentHousingUnit(publicId: string): Promise<HousingUnitPayload> {
  return postHousingAction(publicId, 'rent')
}

export async function renewHousingUnit(publicId: string): Promise<HousingUnitPayload> {
  return postHousingAction(publicId, 'renew')
}
