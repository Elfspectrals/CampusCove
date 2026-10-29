import { apiRequest, isRecord } from './http'

export interface AdminHousingPerson {
  account_id: number
  username: string | null
}

interface AdminHousingKeyHolder extends AdminHousingPerson {
  /** Only the owner can share keys, so this is the owner who handed them over. */
  shared_by: AdminHousingPerson | null
  since: string | null
}

export interface AdminHousingUnit {
  unit_id: number
  public_id: string
  model_key: string | null
  status: 'vacant' | 'occupied'
  price_coins: number
  /** Daily property tax owners pay (the house's "rent"). */
  tax_coins: number
  /** False when the tax is the default share of the price. */
  tax_is_custom: boolean
  tax_due_at: string | null
  door_locked: boolean
  owner: AdminHousingPerson | null
  key_holders: AdminHousingKeyHolder[]
}

export interface AdminHousingAction {
  action: 'pricing' | 'kick_owner' | 'kick_key_holder' | string
  staff: AdminHousingPerson | null
  target: Record<string, unknown>
  created_at: string
}

export interface AdminHousingOverview {
  units: AdminHousingUnit[]
  recent_actions: AdminHousingAction[]
}

/** `tax_coins: null` goes back to the default tax. */
export interface AdminHousingPricing {
  price_coins?: number
  tax_coins?: number | null
}

function parsePerson(value: unknown): AdminHousingPerson | null {
  if (!isRecord(value) || typeof value.account_id !== 'number') return null
  return { account_id: value.account_id, username: typeof value.username === 'string' ? value.username : null }
}

function parseKeyHolder(value: unknown): AdminHousingKeyHolder {
  const person = parsePerson(value)
  if (!person || !isRecord(value)) throw new Error('Invalid key holder')
  return { ...person, shared_by: parsePerson(value.shared_by), since: typeof value.since === 'string' ? value.since : null }
}

function parseUnit(value: unknown): AdminHousingUnit {
  if (
    !isRecord(value)
    || typeof value.unit_id !== 'number'
    || typeof value.public_id !== 'string'
    || (value.status !== 'vacant' && value.status !== 'occupied')
    || typeof value.price_coins !== 'number'
    || typeof value.tax_coins !== 'number'
    || !Array.isArray(value.key_holders)
  ) {
    throw new Error('Invalid housing unit')
  }
  return {
    unit_id: value.unit_id,
    public_id: value.public_id,
    model_key: typeof value.model_key === 'string' ? value.model_key : null,
    status: value.status,
    price_coins: value.price_coins,
    tax_coins: value.tax_coins,
    tax_is_custom: value.tax_is_custom === true,
    tax_due_at: typeof value.tax_due_at === 'string' ? value.tax_due_at : null,
    door_locked: value.door_locked === true,
    owner: parsePerson(value.owner),
    key_holders: value.key_holders.map(parseKeyHolder),
  }
}

function parseAction(value: unknown): AdminHousingAction | null {
  if (!isRecord(value) || typeof value.action !== 'string' || typeof value.created_at !== 'string') return null
  return {
    action: value.action,
    staff: parsePerson(value.staff),
    target: isRecord(value.target) ? value.target : {},
    created_at: value.created_at,
  }
}

function parseOverview(data: unknown): AdminHousingOverview {
  if (!isRecord(data) || !Array.isArray(data.units)) throw new Error('Invalid admin housing response')
  const actions = Array.isArray(data.recent_actions) ? data.recent_actions : []
  return {
    units: data.units.map(parseUnit),
    recent_actions: actions.map(parseAction).filter((a): a is AdminHousingAction => a !== null),
  }
}

export async function fetchAdminHousing(): Promise<AdminHousingOverview> {
  return parseOverview(await apiRequest('/admin/housing/units'))
}

export async function updateAdminHousingPricing(publicId: string, body: AdminHousingPricing): Promise<AdminHousingOverview> {
  return parseOverview(await apiRequest(`/admin/housing/units/${publicId}`, { method: 'PATCH', body }))
}

export async function kickAdminHousingOwner(publicId: string): Promise<AdminHousingOverview> {
  return parseOverview(await apiRequest(`/admin/housing/units/${publicId}/owner`, { method: 'DELETE' }))
}

export async function kickAdminHousingKeyHolder(publicId: string, accountId: number): Promise<AdminHousingOverview> {
  return parseOverview(await apiRequest(`/admin/housing/units/${publicId}/key-holders/${accountId}`, { method: 'DELETE' }))
}
