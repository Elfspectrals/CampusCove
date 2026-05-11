import { computed, ref, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { getStoredAuth } from '../../api/auth'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'

export interface UseApartmentInventoryDeps {
  gameRoomRef: ShallowRef<Room | null>
  currentRoomLabel: Ref<'city' | 'apartment'>
  myPosition: { x: number; y: number; z: number }
  direction: THREE.Vector3
  selectedPlacedObjectId: Ref<string>
  attachSelectedPlacedObject: () => void
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
  spawnSelectedInventoryAsset: () => void
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

  function selectInventoryItem(code: string) {
    selectedInventoryObjectKey.value = code
  }

  function selectHotbarSlot(index: number) {
    if (index < 0 || index > 8) return
    selectedHotbarIndex.value = index
    const code = hotbarSlots.value[index]
    if (code) {
      selectedInventoryObjectKey.value = code
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

  function spawnSelectedInventoryAsset() {
    if (!deps.gameRoomRef.value || deps.currentRoomLabel.value !== 'apartment') return
    const objectKey = selectedInventoryObjectKey.value
    if (!objectKey) return
    const selectedItem = apartmentInventory.value.find((item) => item.code === objectKey)
    if (!selectedItem || selectedItem.quantity <= 0) return
    const objectId = crypto.randomUUID()
    const spawnDistance = 2
    const spawnX = deps.myPosition.x + deps.direction.x * spawnDistance
    const spawnZ = deps.myPosition.z + deps.direction.z * spawnDistance
    deps.gameRoomRef.value.send('apartment_spawn_request', {
      objectId,
      objectKey,
      variant: 'default',
      color: '#8B7AA8',
      x: spawnX,
      y: 0,
      z: spawnZ,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
    })
    setTimeout(() => {
      refreshApartmentInventory()
    }, 250)
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
    spawnSelectedInventoryAsset,
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
