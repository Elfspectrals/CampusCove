import { ref } from 'vue'
import type * as THREE from 'three'
import { openHouseInterior } from '../../game/town/openHouses'
import type { HouseFurniturePayload } from '../../types/gameRealtime'
import { useApartmentObjects } from './useApartmentObjects'

type HouseObjects = ReturnType<typeof useApartmentObjects>

export function useHouseFurniture(deps: { getScene: () => THREE.Scene | undefined }) {
  const objectsByHouse = new Map<string, HouseObjects>()
  let latestHouses: HouseFurniturePayload[] = []
  let townReady = false

  function objectsFor(houseKey: string): HouseObjects {
    const existing = objectsByHouse.get(houseKey)
    if (existing) return existing
    const created = useApartmentObjects({
      getScene: deps.getScene,
      getParent: () => openHouseInterior(houseKey),
      getGameRoom: () => null,
      currentRoomLabel: ref('city'),
      onMeshUpserted: () => undefined,
      onMeshRemoved: () => undefined,
    })
    objectsByHouse.set(houseKey, created)
    return created
  }

  function render(): void {
    const furnished = new Set<string>()
    for (const house of latestHouses) {
      if (!house.model_key) continue
      furnished.add(house.model_key)
      objectsFor(house.model_key).ensureApartmentObjectsFromServer(house.objects)
    }
    for (const [houseKey, objects] of objectsByHouse) {
      if (!furnished.has(houseKey)) objects.clearApartmentObjects()
    }
  }

  function applyHouses(houses: HouseFurniturePayload[]): void {
    latestHouses = houses
    if (townReady) render()
  }

  function onTownReady(): void {
    townReady = true
    render()
  }

  function dispose(): void {
    for (const objects of objectsByHouse.values()) objects.clearApartmentObjects()
    objectsByHouse.clear()
    latestHouses = []
    townReady = false
  }

  return { applyHouses, onTownReady, dispose }
}
