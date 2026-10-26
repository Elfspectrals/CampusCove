import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { buyHousingUnit } from '../../api/housing'
import { housingActionFor, type HousingUnit } from '../../game/town/housing'
import type { HousingUnitPayload } from '../../types/gameRealtime'

export interface CityHousingDeps {
  myAccountId: Ref<number | null>
  gameRoomRef: ShallowRef<Room | null>
  /** Error banner of the game view. */
  roomMessage: Ref<string | null>
}

/** Town houses: synced unit list, the one at the player's door, and the buy action. */
export function useCityHousing(deps: CityHousingDeps) {
  const units = ref<HousingUnit[]>([])
  const nearbyUnit = ref<HousingUnit | null>(null)
  const claimInFlight = ref(false)

  /** Server snapshot (REST or realtime). Units without a house model have nothing to show in the town. */
  function applyUnits(list: HousingUnitPayload[]): void {
    units.value = list.filter((u) => u.model_key)
    const near = nearbyUnit.value
    if (near) nearbyUnit.value = units.value.find((u) => u.public_id === near.public_id) ?? null
  }

  /** House asset key for an apartment template ('housing_<unit_id>'), via the unit's model_key. */
  function houseKeyForTemplate(templateKey: string | undefined): string | null {
    if (!templateKey) return null
    return units.value.find((u) => u.template_key === templateKey)?.model_key ?? null
  }

  async function runClaim(request: () => Promise<unknown>, errorText: string): Promise<void> {
    claimInFlight.value = true
    deps.roomMessage.value = null
    try {
      await request()
      deps.gameRoomRef.value?.send('housing_refresh')
    } catch (err) {
      deps.roomMessage.value = err instanceof Error ? err.message : errorText
    } finally {
      claimInFlight.value = false
    }
  }

  /** Door interaction: buy a vacant house. Occupied houses are entered on foot. */
  async function interact(): Promise<void> {
    const unit = nearbyUnit.value
    if (!unit || !deps.gameRoomRef.value || claimInFlight.value) return
    const action = housingActionFor(unit)
    if (action === 'buy') await runClaim(() => buyHousingUnit(unit.public_id), 'Housing claim failed.')
  }

  return { units, nearbyUnit, claimInFlight, applyUnits, houseKeyForTemplate, interact }
}
