import { computed, ref, watch, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { getStoredAuth } from '../../api/auth'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'
import type { ApartmentPlacementItemDef } from './useApartmentPlacement'

export interface UseApartmentInventoryDeps {
  gameRoomRef: ShallowRef<Room | null>
  currentRoomLabel: Ref<'city' | 'apartment'>
  myPosition: { x: number; y: number; z: number }
  direction: THREE.Vector3
  selectedPlacedObjectId: Ref<string>
  attachSelectedPlacedObject: () => void
  startPlacementPreview?: (itemDef: ApartmentPlacementItemDef, ownedCountRef: Ref<number>) => void
}

export interface UseApartmentInventoryResult {
  apartmentInventory: Ref<ApartmentInventoryItem[]>
  selectedInventoryObjectKey: Ref<string>
  hotbarSlots: Ref<string[]>
  selectedHotbarIndex: Ref<number>
  apartmentInventoryLoading: Ref<boolean>
  apartmentInventoryError: Ref<string | null>
  apartmentInventoryOpen: Ref<boolean>
  normalizeInventoryAndHotbarSelection: () => void
  resetClientStateForCityWorld: () => void
  selectedInventoryItem: ComputedRef<ApartmentInventoryItem | null>
  canSpawnSelectedInventoryItem: ComputedRef<boolean>
  selectInventoryItem: (code: string) => void
  selectHotbarSlot: (index: number) => void
  assignSelectedItemToHotbar: (index: number) => void
  clearHotbarSlot: (index: number) => void
  onHotbarSlotClick: (index: number) => void
  pickupSelectedPlacedObject: () => void
  onPlacedObjectSelected: (objectId: string) => void
  enterMyApartment: () => Promise<void>
  backToCity: () => Promise<void>
  tryExitApartmentAtDoor: (isNearDoor: boolean) => Promise<void>
  tryEnterApartmentAtDoor: (isNearDoor: boolean) => void
  refreshApartmentInventory: () => void
  toggleApartmentInventory: () => void
}

export function useApartmentInventory(deps: UseApartmentInventoryDeps): UseApartmentInventoryResult {
  const selectedInventoryObjectKey = ref('')
  const hotbarSlots = ref<string[]>(Array.from({ length: 9 }, () => ''))
  const selectedHotbarIndex = ref<number>(0)
  const apartmentInventoryLoading = ref<boolean>(false)
  const apartmentInventoryError = ref<string | null>(null)
  const apartmentInventoryOpen = ref<boolean>(false)
  const apartmentInventory = ref<ApartmentInventoryItem[]>([])

  function normalizeInventoryAndHotbarSelection() {
    const knownCodes = new Set(apartmentInventory.value.map((item) => item.code))
    if (!knownCodes.has(selectedInventoryObjectKey.value)) {
      const firstAvailable = apartmentInventory.value.find((item) => item.quantity > 0)
      selectedInventoryObjectKey.value = firstAvailable?.code ?? ''
    }
    hotbarSlots.value = hotbarSlots.value.map((code) => (knownCodes.has(code) ? code : ''))
  }

  function resetClientStateForCityWorld() {
    apartmentInventory.value = []
    selectedInventoryObjectKey.value = ''
    hotbarSlots.value = Array.from({ length: 9 }, () => '')
    selectedHotbarIndex.value = 0
    apartmentInventoryError.value = null
    apartmentInventoryLoading.value = false
    apartmentInventoryOpen.value = false
  }

  const selectedInventoryItem = computed<ApartmentInventoryItem | null>(() => {
    if (!selectedInventoryObjectKey.value) return null
    return apartmentInventory.value.find((item) => item.code === selectedInventoryObjectKey.value) ?? null
  })

  const canSpawnSelectedInventoryItem = computed<boolean>(() => {
    const item = selectedInventoryItem.value
    return item !== null && item.quantity > 0
  })

  function inventoryItemToDef(item: ApartmentInventoryItem): ApartmentPlacementItemDef {
    return {
      objectKey: item.code,
      modelGlb:
        typeof item.model_glb === 'string' && item.model_glb.trim().length > 0 ? item.model_glb.trim() : undefined,
      defaultColor: '#8B7AA8',
      variant: 'default',
    }
  }

  function beginPlacementPreviewForInventoryItem(item: ApartmentInventoryItem): void {
    if (!deps.startPlacementPreview || deps.currentRoomLabel.value !== 'apartment') return
    const ownedCountRef = ref(item.quantity)
    watch(
      apartmentInventory,
      () => {
        const row = apartmentInventory.value.find((r) => r.code === item.code)
        ownedCountRef.value = row?.quantity ?? 0
      },
      { deep: true },
    )
    deps.startPlacementPreview(inventoryItemToDef(item), ownedCountRef)
    apartmentInventoryOpen.value = false
  }

  function tryBeginPreviewForCode(code: string): void {
    if (deps.currentRoomLabel.value !== 'apartment') return
    const item = apartmentInventory.value.find((i) => i.code === code)
    if (item && item.quantity > 0) {
      beginPlacementPreviewForInventoryItem(item)
    }
  }

  function selectInventoryItem(code: string) {
    selectedInventoryObjectKey.value = code
    tryBeginPreviewForCode(code)
  }

  function selectHotbarSlot(index: number) {
    if (index < 0 || index > 8) return
    selectedHotbarIndex.value = index
    const code = hotbarSlots.value[index]
    if (code) {
      selectedInventoryObjectKey.value = code
      tryBeginPreviewForCode(code)
    }
  }

  function assignSelectedItemToHotbar(index: number) {
    if (index < 0 || index > 8) return
    if (!selectedInventoryObjectKey.value) return
    hotbarSlots.value[index] = selectedInventoryObjectKey.value
    selectedHotbarIndex.value = index
  }

  function clearHotbarSlot(index: number) {
    if (index < 0 || index > 8) return
    hotbarSlots.value[index] = ''
  }

  function onHotbarSlotClick(index: number) {
    if (selectedInventoryObjectKey.value) {
      assignSelectedItemToHotbar(index)
      return
    }
    selectHotbarSlot(index)
  }

  function pickupSelectedPlacedObject() {
    if (!deps.gameRoomRef.value || deps.currentRoomLabel.value !== 'apartment') return
    const objectId = deps.selectedPlacedObjectId.value
    if (!objectId) return
    deps.gameRoomRef.value.send('apartment_pickup_request', { objectId })
  }

  function onPlacedObjectSelected(objectId: string) {
    deps.selectedPlacedObjectId.value = objectId
    deps.attachSelectedPlacedObject()
  }

  async function enterMyApartment() {
    const auth = getStoredAuth()
    if (!auth || !deps.gameRoomRef.value) return
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    apartmentInventoryLoading.value = true
    apartmentInventoryError.value = null
    apartmentInventoryOpen.value = false
    deps.gameRoomRef.value.send('enter_apartment', {
      ownerAccountId: auth.user.account_id,
      templateKey: 'starter_loft',
    })
  }

  async function backToCity() {
    if (!deps.gameRoomRef.value) return
    if (document.pointerLockElement) document.exitPointerLock()
    deps.gameRoomRef.value.send('exit_apartment')
  }

  async function tryExitApartmentAtDoor(isNearDoor: boolean) {
    if (!isNearDoor) return
    await backToCity()
  }

  function tryEnterApartmentAtDoor(isNearDoor: boolean) {
    if (!isNearDoor) return
    void enterMyApartment()
  }

  function refreshApartmentInventory() {
    if (!deps.gameRoomRef.value) return
    apartmentInventoryLoading.value = true
    apartmentInventoryError.value = null
    deps.gameRoomRef.value.send('apartment_inventory_request')
  }

  function toggleApartmentInventory() {
    if (deps.currentRoomLabel.value !== 'apartment') return
    apartmentInventoryOpen.value = !apartmentInventoryOpen.value
    if (apartmentInventoryOpen.value) {
      refreshApartmentInventory()
    }
  }

  return {
    apartmentInventory,
    selectedInventoryObjectKey,
    hotbarSlots,
    selectedHotbarIndex,
    apartmentInventoryLoading,
    apartmentInventoryError,
    apartmentInventoryOpen,
    normalizeInventoryAndHotbarSelection,
    resetClientStateForCityWorld,
    selectedInventoryItem,
    canSpawnSelectedInventoryItem,
    selectInventoryItem,
    selectHotbarSlot,
    assignSelectedItemToHotbar,
    clearHotbarSlot,
    onHotbarSlotClick,
    pickupSelectedPlacedObject,
    onPlacedObjectSelected,
    enterMyApartment,
    backToCity,
    tryExitApartmentAtDoor,
    tryEnterApartmentAtDoor,
    refreshApartmentInventory,
    toggleApartmentInventory,
  }
}
