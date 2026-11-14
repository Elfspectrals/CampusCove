import type { AdminBoost, AdminGrantedPayload, AdminItem, AdminMenuPayload, AdminPower, AdminResultPayload, AdminToggle, HousingUnitPayload } from '../../types/gameRealtime.ts'
import type { UiIconName } from '../../components/ui/icons.ts'
import { findHouse } from '../assets/catalog.ts'

export const ADMIN_MAX_MONEY = 100_000
export const ADMIN_MAX_QUANTITY = 999
export const ADMIN_MAX_MARKET_MINUTES = 240

/** Lasting powers, on until turned off or the player leaves. */
export const ADMIN_TOGGLES: readonly AdminToggle[] = ['god', 'endless_food', 'endless_water']
/** One-shot powers. */
export const ADMIN_BOOSTS: readonly AdminBoost[] = ['heal', 'feed', 'drink', 'sober', 'clear_wanted']

export const POWER_ICON: Record<AdminPower, UiIconName> = {
  god: 'shield',
  endless_food: 'apple',
  endless_water: 'droplet',
  heal: 'heart',
  feed: 'apple',
  drink: 'droplet',
  sober: 'sparkles',
  clear_wanted: 'ban',
}

export function isToggle(power: AdminPower): power is AdminToggle {
  return (ADMIN_TOGGLES as readonly string[]).includes(power)
}

/** The name of a house model, or its key when the catalog does not know it. */
function houseName(modelKey: string | null): string {
  return findHouse(modelKey)?.name ?? modelKey ?? '?'
}

export interface VacantHouse {
  unit: string
  name: string
  preview: string | null
  price: number
}

/** Houses nobody owns, cheapest first: what an admin can give. */
export function vacantHouses(units: readonly HousingUnitPayload[]): VacantHouse[] {
  return units
    .filter((u) => u.status === 'vacant')
    .map((u) => ({ unit: u.public_id, name: houseName(u.model_key), preview: findHouse(u.model_key)?.previewUrl ?? null, price: u.price_coins }))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))
}

function powerKey(prefix: string, power: AdminPower, on: boolean | null): string {
  if (!isToggle(power)) return `${prefix}.boost.${power}`
  return `${prefix}.${on ? 'on' : 'off'}.${power}`
}

export interface AdminTarget {
  sessionId: string
  pseudo: string | null
}

export interface AdminMessage {
  key: string
  params: Record<string, string | number>
}

export function adminTargets(ownSessionId: string, players: AdminMenuPayload['players']): AdminTarget[] {
  return [{ sessionId: ownSessionId, pseudo: null }, ...players.filter((p) => p.sessionId !== ownSessionId).map((p) => ({ sessionId: p.sessionId, pseudo: p.pseudo }))]
}

export function filterAdminItems(items: AdminItem[], query: string): AdminItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return items
  return items.filter((item) => item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle))
}

export function wholeIn(raw: unknown, min: number, max: number): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export function adminResultMessage(result: AdminResultPayload, itemName: (code: string) => string, clockTime: (iso: string) => string): AdminMessage {
  if (!result.ok) return { key: 'adminPanel.result.failed', params: { message: result.message } }
  switch (result.action) {
    case 'money':
      return { key: `adminPanel.result.money.${result.wallet}`, params: { amount: result.amount, name: result.pseudo } }
    case 'item':
      return { key: 'adminPanel.result.item', params: { quantity: result.quantity, item: itemName(result.code), name: result.pseudo } }
    case 'market_open':
      return { key: 'adminPanel.result.marketOpen', params: { time: clockTime(result.closesAt) } }
    case 'market_close':
      return { key: 'adminPanel.result.marketClose', params: { n: result.returned } }
    case 'taxes':
      return { key: 'adminPanel.result.taxes', params: { charged: result.charged, seized: result.seized } }
    case 'power':
      return { key: powerKey('adminPanel.result', result.power, result.on), params: { name: result.pseudo } }
    case 'house':
      return { key: 'adminPanel.result.house', params: { name: result.pseudo, house: houseName(result.modelKey) } }
  }
}

export function adminGrantedMessage(granted: AdminGrantedPayload): AdminMessage {
  switch (granted.kind) {
    case 'money':
      return { key: `adminPanel.granted.${granted.wallet}`, params: { amount: granted.amount, name: granted.byPseudo } }
    case 'item':
      return { key: 'adminPanel.granted.item', params: { quantity: granted.quantity, name: granted.byPseudo } }
    case 'power':
      return { key: powerKey('adminPanel.granted', granted.power, granted.on), params: { name: granted.byPseudo } }
    case 'house':
      return { key: 'adminPanel.granted.house', params: { name: granted.byPseudo, house: houseName(granted.modelKey) } }
  }
}
