import { ref } from 'vue'
import type * as THREE from 'three'
import { openHouseInterior } from '../../game/town/openHouses'
import type { HouseFurniturePayload } from '../../types/gameRealtime'
import { useApartmentObjects } from './useApartmentObjects'

type HouseObjects = Pick<ReturnType<typeof useApartmentObjects>, 'ensureApartmentObjectsFromServer' | 'clearApartmentObjects'>

export interface HouseFurnitureDeps {
  getScene: () => THREE.Scene | undefined
  editableHouseKey: () => string | null
  editableHouseObjects: HouseObjects
}

export function useHouseFurniture(deps: HouseFurnitureDeps) {
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
      canDecorate: ref(false),
      onMeshUpserted: () => undefined,
      onMeshRemoved: () => undefined,
    })
    objectsByHouse.set(houseKey, created)
    return created
  }

  function render(): void {
    if (!townReady) return
    const editableKey = deps.editableHouseKey()
    const furnished = new Set<string>()
    let editableObjects: HouseFurniturePayload['objects'] = []
    for (const house of latestHouses) {
      if (!house.model_key) continue
      if (house.model_key === editableKey) {
        editableObjects = house.objects
        continue
      }
      furnished.add(house.model_key)
      objectsFor(house.model_key).ensureApartmentObjectsFromServer(house.objects)
    }
    for (const [houseKey, objects] of objectsByHouse) {
      if (!furnished.has(houseKey)) objects.clearApartmentObjects()
    }
    if (editableKey) deps.editableHouseObjects.ensureApartmentObjectsFromServer(editableObjects)
  }

  function applyHouses(houses: HouseFurniturePayload[]): void {
    latestHouses = houses
    render()
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

  return { applyHouses, onTownReady, refresh: render, dispose }
}
