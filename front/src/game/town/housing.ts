/**
 * Town housing units (the 10 houses of town.layout.json, rows of `housing_units`): proximity, what the
 * player can do at a door, and the prompt texts. A unit's position is the interaction point in front of
 * its house door.
 */
import type { HousingUnitPayload } from '../../types/gameRealtime'

export type HousingUnit = HousingUnitPayload

export type HousingAction = 'buy' | 'open' | 'close' | 'lock' | 'unlock' | 'locked'

export interface DoorContext {
  myAccountId: number | null
  doorOpen: boolean
  holdingHouseKey: boolean
}

/** Extra XZ reach beyond half the unit size for the door prompt. */
const INTERACT_RADIUS_PAD = 1.4

function unitSize(unit: HousingUnit): number {
  return unit.size > 0 ? unit.size : 2.5
}

export function findNearestHousingUnit(x: number, z: number, units: readonly HousingUnit[]): HousingUnit | null {
  let best: HousingUnit | null = null
  let bestDistSq = Infinity
  for (const unit of units) {
    const reach = unitSize(unit) / 2 + INTERACT_RADIUS_PAD
    const dx = x - unit.pos_x
    const dz = z - unit.pos_z
    const distSq = dx * dx + dz * dz
    if (distSq <= reach * reach && distSq < bestDistSq) {
      bestDistSq = distSq
      best = unit
    }
  }
  return best
}

/** World point the door prompt is anchored to. */
export function housingInteractPosition(unit: HousingUnit): { x: number; y: number; z: number } {
  return { x: unit.pos_x, y: unit.pos_y + unitSize(unit) / 2 + 0.35, z: unit.pos_z }
}

function hasHouseKeys(unit: HousingUnit, accountId: number | null): boolean {
  if (accountId === null || unit.status !== 'occupied') return false
  return unit.occupant_account_id === accountId || unit.key_holder_account_ids.includes(accountId)
}

export function housingActionFor(unit: HousingUnit, door: DoorContext): HousingAction | null {
  if (unit.status === 'vacant') return unit.offer_type === 'buy' ? 'buy' : null
  const keys = hasHouseKeys(unit, door.myAccountId)
  if (door.holdingHouseKey && keys) return unit.door_locked ? 'unlock' : 'lock'
  if (unit.door_locked) return 'locked'
  return door.doorOpen ? 'close' : 'open'
}

/** Door prompt texts, e.g. { key: 'F2', action: 'Buy', detail: '1,800 coins · tax 90/day' }; no key means the interact binding. */
export function housingPromptLabel(unit: HousingUnit, action: HousingAction): { key?: string; action: string; detail?: string } {
  switch (action) {
    case 'buy':
      return { key: 'F2', action: 'Buy', detail: `${unit.price_coins.toLocaleString()} coins · tax ${unit.tax_coins.toLocaleString()}/day` }
    case 'open':
      return { action: 'Open' }
    case 'close':
      return { action: 'Close' }
    case 'lock':
      return { action: 'Lock' }
    case 'unlock':
      return { action: 'Unlock' }
    case 'locked':
      return { action: 'Locked' }
  }
}
