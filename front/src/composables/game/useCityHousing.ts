import { computed, ref, type Ref } from 'vue'
import {
  findNearestHousingUnit,
  type HousingUnitSnapshot,
} from '../../game/housingCubes'
import type { HousingUnitPayload } from '../../types/gameRealtime'

const LEASE_SOON_MS = 6 * 60 * 60 * 1000

export type HousingClientAction = 'buy' | 'rent' | 'enter' | 'visit' | 'renew'

function toSnapshot(unit: HousingUnitPayload): HousingUnitSnapshot {
  return { ...unit }
}

function leaseRemainingMs(unit: HousingUnitSnapshot): number | null {
  if (!unit.lease_expires_at) return null
  const end = Date.parse(unit.lease_expires_at)
  if (!Number.isFinite(end)) return null
  return end - Date.now()
}

function leaseSoon(unit: HousingUnitSnapshot): boolean {
  const remaining = leaseRemainingMs(unit)
  if (remaining === null) return false
  return remaining > 0 && remaining <= LEASE_SOON_MS
}

export function formatRentDuration(hours: number): string {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24
    return days === 1 ? '1 day' : `${days} days`
  }
  return `${hours}h`
}

export function formatLeaseRemaining(unit: HousingUnitSnapshot): string | null {
  const remaining = leaseRemainingMs(unit)
  if (remaining === null || remaining <= 0) return null
  const totalMin = Math.ceil(remaining / 60_000)
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `Lease: ${d}d ${h}h left`
  if (h > 0) return `Lease: ${h}h ${m}m left`
  return `Lease: ${m}m left`
}

export function housingActionFor(
  unit: HousingUnitSnapshot,
  accountId: number | null,
): HousingClientAction | null {
  const vacant = unit.status === 'vacant'
  if (vacant) {
    if (unit.offer_type === 'buy') return 'buy'
    if (unit.offer_type === 'rent') return 'rent'
    return null
  }
  if (unit.status !== 'occupied' || unit.occupant_account_id === null) return null
  if (accountId !== null && unit.occupant_account_id === accountId) return 'enter'
  return 'visit'
}

export function showRenewForUnit(unit: HousingUnitSnapshot, accountId: number | null): boolean {
  if (accountId === null || unit.occupant_account_id !== accountId) return false
  if (unit.offer_type !== 'rent') return false
  return leaseSoon(unit)
}

export function useCityHousing(myAccountId: Ref<number | null>) {
  const units = ref<HousingUnitSnapshot[]>([])
  const nearbyUnit = ref<HousingUnitSnapshot | null>(null)

  function applyUnits(list: HousingUnitPayload[]): void {
    units.value = list.map(toSnapshot)
    const pos = nearbyUnit.value
    if (pos) {
      const updated = units.value.find((u) => u.public_id === pos.public_id)
      nearbyUnit.value = updated ?? null
    }
  }

  function updateNearest(x: number, z: number): void {
    nearbyUnit.value = findNearestHousingUnit(x, z, units.value)
  }

  const nearbyAction = computed(() => {
    const u = nearbyUnit.value
    if (!u) return null
    return housingActionFor(u, myAccountId.value)
  })

  const nearbyShowRenew = computed(() => {
    const u = nearbyUnit.value
    if (!u) return false
    return showRenewForUnit(u, myAccountId.value)
  })

  return {
    units,
    nearbyUnit,
    nearbyAction,
    nearbyShowRenew,
    applyUnits,
    updateNearest,
  }
}
