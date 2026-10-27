import {
  computed,
  onScopeDispose,
  ref,
  watch,
  type Ref,
  type ShallowRef,
  type WatchStopHandle,
} from 'vue'
import type { Room } from '@colyseus/sdk'
import {
  fetchInventoryLayout,
  saveInventoryLayout,
  defaultPlayerInventoryLayout,
} from '../../api/playerInventoryLayout'
import { fetchApartmentAssets } from '../../api/apartments'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'
import type { ApartmentPlacementItemDef } from './useApartmentPlacement'

const SLOT_COUNT = 36
const HOTBAR_SLOTS = 9
const DEBOUNCE_MS = 500

export interface UsePlayerInventoryDeps {
  gameRoomRef: ShallowRef<Room | null>
  canDecorate: Ref<boolean>
  selectedPlacedObjectId: Ref<string>
  startPlacementPreview: (itemDef: ApartmentPlacementItemDef, ownedCountRef: Ref<number>) => void
  cancelPlacementPreview: () => void
}

/**
 * Player inventory: 36 slots (the first 9 are the hotbar) persisted per account, owned decoration items,
 * click / drag rearranging, and selecting a hotbar item to start placing it in the player's house.
 */
export function usePlayerInventory(deps: UsePlayerInventoryDeps) {
  const ownedItems = ref<ApartmentInventoryItem[]>([])
  const ownedItemsHydrated = ref(false)
  const slots = ref<string[]>([...defaultPlayerInventoryLayout().slots])
  const selectedHotbarIndex = ref(0)
  const inventoryOpen = ref(false)
  const inventoryLoading = ref(false)
  const inventoryError = ref<string | null>(null)
  const cursorItem = ref<{ code: string; fromSlot: number } | null>(null)

  let layoutHydrated = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let interactionDragged = false
  let pointerPressSlot: number | null = null
  let hotbarPlacementQtyWatchStop: WatchStopHandle | null = null

  function stopHotbarPlacementQtyWatch(): void {
    hotbarPlacementQtyWatchStop?.()
    hotbarPlacementQtyWatchStop = null
  }

  onScopeDispose(() => {
    stopHotbarPlacementQtyWatch()
  })

  function cancelPlacementPreviewInternal(): void {
    stopHotbarPlacementQtyWatch()
    deps.cancelPlacementPreview()
  }

  const itemByCode = computed<Record<string, ApartmentInventoryItem>>(() => {
    const m: Record<string, ApartmentInventoryItem> = {}
    for (const it of ownedItems.value) {
      m[it.code] = it
    }
    return m
  })

  const selectedItem = computed<ApartmentInventoryItem | null>(() => {
    const item = itemByCode.value[slots.value[selectedHotbarIndex.value] ?? '']
    return item && item.quantity > 0 ? item : null
  })

  function quantityForCode(code: string): number {
    if (!code) return 0
    const row = ownedItems.value.find((i) => i.code === code)
    return row?.quantity ?? 0
  }

  function scheduleDebouncedSave(): void {
    if (!layoutHydrated) return
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveInventoryLayout({
        slots: [...slots.value],
        selectedHotbarIndex: selectedHotbarIndex.value,
      }).catch((err) => {
        console.error('[playerInventory] layout save failed', err)
      })
    }, DEBOUNCE_MS)
  }

  function normalizeSlotsAgainstOwnedItems(): void {
    if (!ownedItemsHydrated.value) return
    const next = [...slots.value]
    let changed = false
    for (let i = 0; i < SLOT_COUNT; i++) {
      const code = next[i] ?? ''
      if (!code) continue
      const q = quantityForCode(code)
      if (q <= 0) {
        next[i] = ''
        changed = true
      }
    }
    if (changed) {
      slots.value = next
      scheduleDebouncedSave()
    }
    if (!layoutHydrated) return
    for (const item of ownedItems.value) {
      if (item.quantity > 0) pickupToHotbar(item.code)
    }
  }

  function swapSlots(from: number, to: number): void {
    if (from === to) return
    if (from < 0 || from >= SLOT_COUNT || to < 0 || to >= SLOT_COUNT) return
    const next = [...slots.value]
    const a = next[from] ?? ''
    const b = next[to] ?? ''
    next[from] = b
    next[to] = a
    slots.value = next
    scheduleDebouncedSave()
  }

  function applyServerInventoryPayload(items: ApartmentInventoryItem[]): void {
    ownedItems.value = Array.isArray(items) ? items : []
    ownedItemsHydrated.value = true
    normalizeSlotsAgainstOwnedItems()
    inventoryLoading.value = false
    inventoryError.value = null
    scheduleDebouncedSave()
  }

  function refreshOwnedItems(): void {
    inventoryError.value = null
    inventoryLoading.value = true
    void fetchApartmentAssets()
      .then((items) => {
        applyServerInventoryPayload(items)
      })
      .catch((err: unknown) => {
        inventoryLoading.value = false
        inventoryError.value = err instanceof Error ? err.message : 'Could not load owned items.'
      })
  }

  async function loadLayoutFromServer(): Promise<void> {
    const layout = await fetchInventoryLayout()
    slots.value = [...layout.slots]
    selectedHotbarIndex.value = layout.selectedHotbarIndex
    layoutHydrated = true
    if (ownedItemsHydrated.value) normalizeSlotsAgainstOwnedItems()
  }

  function resetClientStateForCityWorld(): void {
    ownedItems.value = []
    ownedItemsHydrated.value = false
    inventoryOpen.value = false
    cursorItem.value = null
    inventoryError.value = null
    inventoryLoading.value = false
    refreshOwnedItems()
  }

  function closeInventory(): void {
    cancelCursorPick()
    inventoryOpen.value = false
  }

  function toggleInventory(): void {
    if (inventoryOpen.value) {
      closeInventory()
      return
    }
    inventoryOpen.value = true
    refreshOwnedItems()
  }

  function inventoryItemToDef(item: ApartmentInventoryItem): ApartmentPlacementItemDef {
    return {
      objectKey: item.code,
      modelGlb:
        typeof item.model_glb === 'string' && item.model_glb.trim().length > 0 ? item.model_glb.trim() : undefined,
      defaultColor: '#8B7AA8',
      variant: 'default',
    }
  }

  function selectHotbarIndex(i: number): void {
    if (i < 0 || i > 8) return
    stopHotbarPlacementQtyWatch()
    selectedHotbarIndex.value = i
    scheduleDebouncedSave()
    const code = slots.value[i] ?? ''

    if (!deps.canDecorate.value || itemByCode.value[code]?.kind === 'tool') {
      cancelPlacementPreviewInternal()
      return
    }

    if (!code) {
      cancelPlacementPreviewInternal()
      closeInventory()
      return
    }

    const item = ownedItems.value.find((row) => row.code === code && row.quantity > 0)
    if (!item) {
      cancelPlacementPreviewInternal()
      closeInventory()
      return
    }

    const ownedCountRef = ref(item.quantity)
    hotbarPlacementQtyWatchStop = watch(
      ownedItems,
      () => {
        const row = ownedItems.value.find((r) => r.code === code)
        ownedCountRef.value = row?.quantity ?? 0
      },
      { deep: true },
    )

    deps.startPlacementPreview(inventoryItemToDef(item), ownedCountRef)
    closeInventory()
  }

  function pickupToHotbar(code: string): void {
    const clean = typeof code === 'string' ? code.trim() : ''
    if (!clean || quantityForCode(clean) <= 0) return
    if (slots.value.includes(clean)) return

    const next = [...slots.value]
    const emptyHb = next.findIndex((c, idx) => idx < HOTBAR_SLOTS && c === '')
    const target = emptyHb >= 0 ? emptyHb : next.findIndex((c, idx) => idx >= HOTBAR_SLOTS && c === '')
    if (target < 0) return
    next[target] = clean
    slots.value = next
    scheduleDebouncedSave()
  }

  function onSlotPointerDown(slotIndex: number, e: PointerEvent): void {
    if (e.button !== 0) return
    pointerPressSlot = slotIndex
  }

  function slotVisualCode(slotIndex: number): string {
    const c = slots.value[slotIndex] ?? ''
    if (!c) return ''
    return quantityForCode(c) > 0 ? c : ''
  }

  function cancelCursorPick(): void {
    const cur = cursorItem.value
    if (!cur) return
    const next = [...slots.value]
    next[cur.fromSlot] = cur.code
    cursorItem.value = null
    slots.value = next
    scheduleDebouncedSave()
  }

  function onSlotPointerUp(slotIndex: number, e: PointerEvent): void {
    if (e.button !== 0) return
    const startedOnSlot = pointerPressSlot
    pointerPressSlot = null
    const sameCell = startedOnSlot === slotIndex

    const cur = cursorItem.value

    if (cur) {
      const targetDisplayed = slotVisualCode(slotIndex)
      if (!targetDisplayed) {
        const next = [...slots.value]
        next[slotIndex] = cur.code
        slots.value = next
        cursorItem.value = null
        scheduleDebouncedSave()
        return
      }
      if (targetDisplayed === cur.code) {
        const next = [...slots.value]
        next[cur.fromSlot] = cur.code
        slots.value = next
        cursorItem.value = null
        scheduleDebouncedSave()
        return
      }
      const next = [...slots.value]
      const displaced = next[slotIndex] ?? ''
      next[cur.fromSlot] = displaced
      next[slotIndex] = cur.code
      slots.value = next
      cursorItem.value = null
      scheduleDebouncedSave()
      return
    }

    if (interactionDragged) return

    if (!inventoryOpen.value && slotIndex < HOTBAR_SLOTS) return

    const code = slotVisualCode(slotIndex)
    if (!code || !sameCell) return

    cursorItem.value = { code, fromSlot: slotIndex }
    const next = [...slots.value]
    next[slotIndex] = ''
    slots.value = next
    scheduleDebouncedSave()
  }

  function onSlotDragStart(slotIndex: number, e: DragEvent): void {
    const code = slotVisualCode(slotIndex)
    if (!code) {
      e.preventDefault()
      return
    }
    interactionDragged = true
    e.dataTransfer?.setData('text/plain', String(slotIndex))
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
    }
  }

  function onSlotDragOver(_slotIndex: number, e: DragEvent): void {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move'
    }
  }

  function onSlotDrop(slotIndex: number, e: DragEvent): void {
    e.preventDefault()
    const raw = e.dataTransfer?.getData('text/plain') ?? ''
    const from = Number.parseInt(raw, 10)
    if (!Number.isFinite(from)) return
    swapSlots(from, slotIndex)
  }

  function onSlotDragEnd(): void {
    queueMicrotask(() => {
      interactionDragged = false
    })
  }

  function clearSlot(slotIndex: number): void {
    if (slotIndex < 0 || slotIndex >= SLOT_COUNT) return
    const code = slotVisualCode(slotIndex)
    if (!code) return
    if (slotIndex >= HOTBAR_SLOTS) return

    const next = [...slots.value]
    next[slotIndex] = ''
    const emptyInv = next.findIndex((c, idx) => idx >= HOTBAR_SLOTS && c === '')
    if (emptyInv < 0) return
    next[emptyInv] = code
    slots.value = next
    scheduleDebouncedSave()
  }

  function pickupSelectedPlacedObject(): void {
    if (!deps.gameRoomRef.value || !deps.canDecorate.value) return
    const objectId = deps.selectedPlacedObjectId.value
    if (!objectId) return
    deps.gameRoomRef.value.send('apartment_pickup_request', { objectId })
  }

  function onPlacedObjectSelected(objectId: string): void {
    deps.selectedPlacedObjectId.value = objectId
  }

  return {
    slots,
    selectedHotbarIndex,
    inventoryOpen,
    inventoryLoading,
    inventoryError,
    cursorItem,
    itemByCode,
    selectedItem,
    toggleInventory,
    closeInventory,
    selectHotbarIndex,
    pickupToHotbar,
    onSlotPointerDown,
    onSlotPointerUp,
    onSlotDragStart,
    onSlotDragOver,
    onSlotDrop,
    onSlotDragEnd,
    cancelCursorPick,
    clearSlot,
    refreshOwnedItems,
    applyServerInventoryPayload,
    loadLayoutFromServer,
    resetClientStateForCityWorld,
    pickupSelectedPlacedObject,
    onPlacedObjectSelected,
  }
}
