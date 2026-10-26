/**
 * Housing API (Laravel routes under /api):
 * - GET  /housing/units
 * - POST /housing/units/{publicId}/buy
 * - POST /housing/keys, DELETE /housing/keys/{accountId}
 * - PUT  /housing/units/{publicId}/door
 */
import { fetchCurrentUser } from './auth'
import { apiRequest, isRecord } from './http'
import type { HousingUnitPayload } from '../types/gameRealtime'

function parseHousingUnit(raw: unknown): HousingUnitPayload | null {
  if (!isRecord(raw)) return null
  if (typeof raw.unit_id !== 'number') return null
  if (typeof raw.public_id !== 'string') return null
  if (typeof raw.offer_type !== 'string') return null
  if (typeof raw.price_coins !== 'number') return null
  if (typeof raw.tax_coins !== 'number') return null
  if (typeof raw.pos_x !== 'number') return null
  if (typeof raw.pos_y !== 'number') return null
  if (typeof raw.pos_z !== 'number') return null
  if (typeof raw.size !== 'number') return null
  if (typeof raw.base_color_hex !== 'string') return null
  if (!(raw.model_key === undefined || raw.model_key === null || typeof raw.model_key === 'string')) return null
  if (typeof raw.status !== 'string') return null
  if (!(raw.occupant_account_id === null || typeof raw.occupant_account_id === 'number')) return null
  if (!(raw.occupant_name === null || typeof raw.occupant_name === 'string')) return null
  if (!(raw.tax_due_at === null || typeof raw.tax_due_at === 'string')) return null
  if (typeof raw.door_locked !== 'boolean') return null
  if (!(raw.room_public_id === null || typeof raw.room_public_id === 'string')) return null
  if (typeof raw.template_key !== 'string') return null
  if (!Array.isArray(raw.key_holder_account_ids) || !raw.key_holder_account_ids.every((id) => typeof id === 'number')) return null

  return {
    unit_id: raw.unit_id,
    public_id: raw.public_id,
    offer_type: raw.offer_type,
    price_coins: raw.price_coins,
    tax_coins: raw.tax_coins,
    pos_x: raw.pos_x,
    pos_y: raw.pos_y,
    pos_z: raw.pos_z,
    size: raw.size,
    base_color_hex: raw.base_color_hex,
    model_key: typeof raw.model_key === 'string' ? raw.model_key : null,
    status: raw.status,
    occupant_account_id: raw.occupant_account_id,
    occupant_name: raw.occupant_name,
    tax_due_at: raw.tax_due_at,
    door_locked: raw.door_locked,
    room_public_id: raw.room_public_id,
    template_key: raw.template_key,
    key_holder_account_ids: raw.key_holder_account_ids,
  }
}

/** Valid rows of a housing units list (API or realtime `housing_units_sync`); malformed rows are dropped. */
export function parseHousingUnitList(raw: unknown): HousingUnitPayload[] {
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
  const data = await apiRequest('/housing/units')
  if (!isRecord(data)) throw new Error('Invalid housing units response')
  const units = parseHousingUnitList(data.units)
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

export async function giveHouseKeys(accountId: number): Promise<void> {
  await apiRequest('/housing/keys', { method: 'POST', body: { account_id: accountId } })
}

export async function takeHouseKeys(accountId: number): Promise<void> {
  await apiRequest(`/housing/keys/${accountId}`, { method: 'DELETE' })
}

export async function setHouseDoorLocked(publicId: string, locked: boolean): Promise<void> {
  await apiRequest(`/housing/units/${encodeURIComponent(publicId)}/door`, { method: 'PUT', body: { locked } })
}

export async function buyHousingUnit(publicId: string): Promise<HousingUnitPayload> {
  const data = await apiRequest(`/housing/units/${encodeURIComponent(publicId)}/buy`, { method: 'POST' })
  if (!isRecord(data)) throw new Error('Invalid housing response')
  const unit = parseHousingUnit(data.unit)
  if (!unit) throw new Error('Invalid housing response')
  await refreshWalletAfterClaim()
  return unit
}

