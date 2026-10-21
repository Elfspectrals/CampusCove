/**
 * Town housing units (the 10 houses of town.layout.json, rows of `housing_units`): proximity, what the
 * player can do at a door, and the prompt texts. A unit's position is the interaction point in front of
 * its house door.
 */
import type { HousingUnitPayload } from '../types/gameRealtime'

export type HousingUnit = HousingUnitPayload

export type HousingAction = 'buy' | 'rent' | 'enter' | 'visit'

/** Extra XZ reach beyond half the unit size for the door prompt. */
const INTERACT_RADIUS_PAD = 1.4
/** A rented house shows "Renew" when the lease ends within this delay. */
const LEASE_SOON_MS = 6 * 60 * 60 * 1000

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

export function housingActionFor(unit: HousingUnit, accountId: number | null): HousingAction | null {
  if (unit.status === 'vacant') {
    if (unit.offer_type === 'buy') return 'buy'
    if (unit.offer_type === 'rent') return 'rent'
    return null
  }
  if (unit.status !== 'occupied' || unit.occupant_account_id === null) return null
  return accountId !== null && unit.occupant_account_id === accountId ? 'enter' : 'visit'
}

function leaseRemainingMs(unit: HousingUnit): number | null {
  if (!unit.lease_expires_at) return null
  const end = Date.parse(unit.lease_expires_at)
  return Number.isFinite(end) ? end - Date.now() : null
}

/** The player rents this house and the lease ends soon. */
export function canRenewUnit(unit: HousingUnit, accountId: number | null): boolean {
  if (accountId === null || unit.occupant_account_id !== accountId || unit.offer_type !== 'rent') return false
  const remaining = leaseRemainingMs(unit)
  return remaining !== null && remaining > 0 && remaining <= LEASE_SOON_MS
}

function formatRentDuration(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24
    return days === 1 ? '1 day' : `${days} days`
  }
  return `${hours}h`
}

function formatLeaseRemaining(unit: HousingUnit): string | undefined {
  const remaining = leaseRemainingMs(unit)
  if (remaining === null || remaining <= 0) return undefined
  const totalMin = Math.ceil(remaining / 60_000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `Lease: ${d}d ${h}h left`
  if (h > 0) return `Lease: ${h}h ${m}m left`
  return `Lease: ${m}m left`
}

/** Door prompt texts, e.g. { action: 'Rent', detail: '500 coins · 7 days' }. */
export function housingPromptLabel(unit: HousingUnit, action: HousingAction): { action: string; detail?: string } {
  const price = `${unit.price_coins.toLocaleString()} coins`
  switch (action) {
    case 'buy':
      return { action: 'Buy', detail: price }
    case 'rent':
      return { action: 'Rent', detail: `${price} · ${formatRentDuration(unit.rent_duration_hours)}` }
    case 'visit':
      return { action: 'Visit' }
    case 'enter':
      return { action: 'Enter', detail: formatLeaseRemaining(unit) }
  }
}
