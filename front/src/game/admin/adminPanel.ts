import type { AdminBoost, AdminGrantedPayload, AdminItem, AdminMenuPayload, AdminPower, AdminResultPayload, AdminToggle, HousingUnitPayload } from '../../types/gameRealtime.ts'
import type { UiIconName } from '../../components/ui/icons.ts'
import { findHouse } from '../assets/catalog.ts'
import { worldToMap } from '../world/minimap.ts'
import type { WorldBounds } from '../world/worldManifest.ts'

export const ADMIN_MAX_MONEY = 100_000
export const ADMIN_MAX_QUANTITY = 999
export const ADMIN_MAX_MARKET_MINUTES = 240

/** Lasting powers, on until turned off or the player leaves, shown in these groups. */
export const TOGGLE_GROUPS: ReadonlyArray<{ group: 'survival' | 'movement' | 'presence' | 'combat'; toggles: readonly AdminToggle[] }> = [
  { group: 'survival', toggles: ['god', 'endless_food', 'endless_water', 'endless_stamina'] },
  { group: 'movement', toggles: ['fly', 'speed', 'freeze'] },
  { group: 'presence', toggles: ['invisible', 'mute'] },
  { group: 'combat', toggles: ['one_punch'] },
]
const ADMIN_TOGGLES: readonly AdminToggle[] = TOGGLE_GROUPS.flatMap((g) => g.toggles)
/** One-shot powers. */
export const ADMIN_BOOSTS: readonly AdminBoost[] = ['heal', 'feed', 'drink', 'sober', 'clear_wanted']

export const POWER_ICON: Record<AdminPower, UiIconName> = {
  god: 'shield',
  endless_food: 'apple',
  endless_water: 'droplet',
  endless_stamina: 'bolt',
  fly: 'sparkles',
  speed: 'walk',
  freeze: 'pause',
  invisible: 'eye',
  mute: 'message',
  one_punch: 'hand',
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

/** A house on the admin map: free to give, owned by the chosen player (take back) or by someone else. */
export interface HousePin {
  unit: string
  name: string
  preview: string | null
  price: number
  owner: string | null
  state: 'vacant' | 'theirs' | 'taken'
  /** Position on the town picture, 0 to 1 from its top-left corner. */
  u: number
  v: number
}

export function housePins(units: readonly HousingUnitPayload[], area: WorldBounds, targetAccountId: number | null): HousePin[] {
  return units.map((u) => {
    const state = u.status === 'vacant' ? 'vacant' : u.occupant_account_id === targetAccountId && targetAccountId !== null ? 'theirs' : 'taken'
    return {
      unit: u.public_id,
      name: houseName(u.model_key),
      preview: findHouse(u.model_key)?.previewUrl ?? null,
      price: u.price_coins,
      owner: u.occupant_name,
      state,
      ...worldToMap(u.pos_x, u.pos_z, area),
    }
  })
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
    case 'moderate':
      return { key: `adminPanel.result.moderate.${result.moderation}`, params: { name: result.pseudo, minutes: result.minutes ?? 0, stars: result.stars ?? 0, place: result.place ?? '' } }
    case 'take_money':
      return { key: `adminPanel.result.takeMoney.${result.wallet}`, params: { amount: result.amount, name: result.pseudo } }
    case 'take_item':
      return { key: 'adminPanel.result.takeItem', params: { quantity: result.quantity, item: itemName(result.code), name: result.pseudo } }
    case 'take_house':
      return { key: 'adminPanel.result.takeHouse', params: { name: result.pseudo, house: houseName(result.modelKey) } }
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
    case 'moderate':
      return { key: 'adminPanel.granted.jail', params: { name: granted.byPseudo, minutes: granted.minutes } }
    case 'take_money':
      return { key: `adminPanel.granted.takeMoney.${granted.wallet}`, params: { amount: granted.amount, name: granted.byPseudo } }
    case 'take_item':
      return { key: 'adminPanel.granted.takeItem', params: { quantity: granted.quantity, name: granted.byPseudo } }
    case 'take_house':
      return { key: 'adminPanel.granted.takeHouse', params: { name: granted.byPseudo, house: houseName(granted.modelKey) } }
  }
}
