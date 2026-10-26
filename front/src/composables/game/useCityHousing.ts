import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { buyHousingUnit, setHouseDoorLocked } from '../../api/housing'
import { housingActionFor, type HousingAction, type HousingUnit } from '../../game/town/housing'
import type { HousingUnitPayload } from '../../types/gameRealtime'

export interface CityHousingDeps {
  myAccountId: Ref<number | null>
  gameRoomRef: ShallowRef<Room | null>
  /** Error banner of the game view. */
  roomMessage: Ref<string | null>
  holdingHouseKey: () => boolean
}

/** Town houses: synced unit list, the one at the player's door, open doors, and the door actions. */
export function useCityHousing(deps: CityHousingDeps) {
  const units = ref<HousingUnit[]>([])
  const nearbyUnit = ref<HousingUnit | null>(null)
  const claimInFlight = ref(false)
  const openDoorIds = ref(new Set<string>())

  /** Server snapshot (REST or realtime). Units without a house model have nothing to show in the town. */
  function applyUnits(list: HousingUnitPayload[]): void {
    units.value = list.filter((u) => u.model_key)
    const near = nearbyUnit.value
    if (near) nearbyUnit.value = units.value.find((u) => u.public_id === near.public_id) ?? null
  }

  function applyOpenDoors(ids: readonly string[]): void {
    openDoorIds.value = new Set(ids)
  }

  function isDoorOpen(unit: HousingUnit): boolean {
    return unit.status === 'vacant' || openDoorIds.value.has(unit.public_id)
  }

  function isWorkDoorOpen(workKey: string): boolean {
    return openDoorIds.value.has(`work:${workKey}`)
  }

  function actionFor(unit: HousingUnit): HousingAction | null {
    return housingActionFor(unit, {
      myAccountId: deps.myAccountId.value,
      doorOpen: isDoorOpen(unit),
      holdingHouseKey: deps.holdingHouseKey(),
    })
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

  /** Left click at a door: open or close it, or lock it with the key in hand. */
  async function interact(): Promise<void> {
    const unit = nearbyUnit.value
    if (!unit || !deps.gameRoomRef.value || claimInFlight.value) return
    const action = actionFor(unit)
    if (action === 'open' || action === 'close') deps.gameRoomRef.value.send('door_toggle', { unitId: unit.public_id })
    else if (action === 'lock') await runClaim(() => setHouseDoorLocked(unit.public_id, true), 'Could not change the lock.')
  }

  /** Right click at a door with the key in hand: unlock it. Returns true when there was a door to unlock. */
  function unlock(): boolean {
    const unit = nearbyUnit.value
    if (!unit || claimInFlight.value || actionFor(unit) !== 'unlock') return false
    void runClaim(() => setHouseDoorLocked(unit.public_id, false), 'Could not change the lock.')
    return true
  }

  /** F2 at the door of a house for sale: buy it. */
  function buy(): boolean {
    const unit = nearbyUnit.value
    if (!unit || claimInFlight.value || actionFor(unit) !== 'buy') return false
    void runClaim(() => buyHousingUnit(unit.public_id), 'Housing claim failed.')
    return true
  }

  return { units, nearbyUnit, claimInFlight, applyUnits, applyOpenDoors, isDoorOpen, isWorkDoorOpen, actionFor, houseKeyForTemplate, interact, unlock, buy }
}
