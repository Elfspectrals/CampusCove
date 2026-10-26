<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Room } from '@colyseus/sdk'
import {
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  type CharacterCosmeticsState,
} from '../api/characterCosmetics'
import { fetchHousingUnits } from '../api/housing'
import { clearAuth, getStoredAuth } from '../api/session'
import GameHudToolbar from '../components/game/GameHudToolbar.vue'
import GameInteractionPrompt from '../components/game/GameInteractionPrompt.vue'
import GamePlacementHud from '../components/game/GamePlacementHud.vue'
import GamePlayerHotbar from '../components/game/GamePlayerHotbar.vue'
import GamePlayerInventoryPanel from '../components/game/GamePlayerInventoryPanel.vue'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import GameStoreItemCard from '../components/game/GameStoreItemCard.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useCityHousing } from '../composables/game/useCityHousing'
import { useFurnitureStore } from '../composables/game/useFurnitureStore'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { useInteractionTargets } from '../composables/game/useInteractionTargets'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import { useRoomEnvironment } from '../composables/game/useRoomEnvironment'
import { useShopPurchase } from '../composables/useShopPurchase'
import { COVE_HOME } from '../game/assets/catalog'
import { toggleCollisionDebug } from '../game/collision/collisionDebug'
import { getWorldCollisionStats } from '../game/collision/worldCollision'
import { HOUSING_LOBBY_SPAWN } from '../game/gameRoomConstants'
import { createGameScene, disposeGameScene, type GameScene } from '../game/gameScene'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ---------------------------------------------------------------- shared game state

const gameRoomRef = shallowRef<Room | null>(null)
const roomMessage = ref<string | null>(null)
const currentRoomLabel = ref<'city' | 'apartment'>('city')
const canEditApartment = ref(false)
const visitedApartmentOwnerId = ref<number | null>(null)
const visitedWorkKey = ref<string | null>(null)
const pointerLocked = ref(false)
const refreshMyAppearance = ref<(() => void) | null>(null)
const myAccountId = computed(() => getStoredAuth()?.user.account_id ?? null)

/** Eye position of the local player (plain object: written every frame). */
const myPosition = { ...HOUSING_LOBBY_SPAWN }
const formatPosition = () => `${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)}`
const positionLabel = ref(formatPosition())

let game: GameScene | null = null
const getScene = () => game?.scene
const getCamera = () => game?.camera
const getRenderer = () => game?.renderer

// ---------------------------------------------------------------- house decoration

const {
  apartmentObjectCount,
  apartmentObjectIds,
  selectedPlacedObjectId,
  detachForRoomSwitch,
  clearApartmentObjects,
  ensureApartmentObjectsFromServer,
  upsertApartmentObjectFromRemote,
  removeApartmentObjectMesh,
  persistApartmentTransformForMesh,
  getApartmentObjectMesh,
} = useApartmentObjects({
  getScene,
  getGameRoom: () => gameRoomRef.value,
  currentRoomLabel,
  onMeshUpserted: (mesh) => placement.registerApartmentProp(mesh),
  onMeshRemoved: (objectId) => {
    placement.unregisterApartmentProp(objectId)
    placement.notifyPropRemovedFromWorld(objectId)
  },
})

const placement = useApartmentPlacement({
  getScene,
  getCamera,
  getColyseusRoom: () => gameRoomRef.value,
  getApartmentObjectMesh,
  getApartmentInventoryOpen: () => inventoryOpen.value,
  currentRoomLabel,
  pointerLocked,
  canEditApartment,
  persistApartmentTransformForMesh,
  refreshApartmentInventory: () => refreshOwnedItems(),
})
const { crosshairTint, hudHints: placementHudHints, isPreviewing: placementPreviewActive } = placement

const {
  slots,
  selectedHotbarIndex,
  inventoryOpen,
  inventoryLoading,
  inventoryError,
  cursorItem,
  itemByCode,
  resetClientStateForCityWorld,
  selectHotbarIndex,
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
  pickupSelectedPlacedObject,
  onPlacedObjectSelected,
  toggleInventory,
  closeInventory,
  pickupToHotbar,
} = usePlayerInventory({
  gameRoomRef,
  currentRoomLabel,
  canEditApartment,
  selectedPlacedObjectId,
  startPlacementPreview: (itemDef, ownedCountRef) => placement.startPreviewNew(itemDef, ownedCountRef),
  cancelPlacementPreview: () => placement.cancelPreview(),
})

// ---------------------------------------------------------------- Cove Home furniture store

const inStore = computed(() => currentRoomLabel.value === 'apartment' && visitedWorkKey.value === COVE_HOME.key)
const furnitureStore = useFurnitureStore({ inStore: () => inStore.value, getCamera, myPosition })
const { target: storeTarget, currentDepartment: storeDepartment } = furnitureStore
const storeShop = useShopPurchase()
const {
  confirmItem: storeConfirmItem,
  confirmCurrency: storeConfirmCurrency,
  confirmOption: storeConfirmOption,
  confirmCurrent: storeConfirmCurrent,
  confirmAfter: storeConfirmAfter,
  purchasingId: storePurchasingId,
} = storeShop
const storeFeedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
let storeFeedbackTimer: ReturnType<typeof setTimeout> | undefined

function showStoreFeedback(feedback: { kind: 'success' | 'error'; text: string }): void {
  storeFeedback.value = feedback
  clearTimeout(storeFeedbackTimer)
  storeFeedbackTimer = setTimeout(() => {
    storeFeedback.value = null
  }, 4500)
}

/** Click on a furniture item in the store: the purchase dialog needs the mouse, so pointer lock is released. */
function openStorePurchase(): void {
  const target = storeTarget.value
  if (!target || storeConfirmItem.value) return
  if (!target.item) {
    showStoreFeedback({ kind: 'error', text: `${target.name} is not on sale yet.` })
    return
  }
  if (document.pointerLockElement) document.exitPointerLock()
  storeShop.openPurchaseConfirm(target.item)
}

async function confirmStorePurchase(): Promise<void> {
  const item = storeConfirmItem.value
  if (!item) return
  await storeShop.confirmPurchase()
  const feedback = storeShop.feedbackByItem.value[item.item_def_id]
  if (!feedback) return
  if (feedback.kind === 'success') {
    showStoreFeedback({ kind: 'success', text: `${item.name} is in your inventory. Place it at home (E).` })
    refreshOwnedItems()
  } else {
    showStoreFeedback(feedback)
  }
}

// Back to mouse look once the purchase dialog closes.
watch(storeConfirmItem, (item, previous) => {
  if (!item && previous && !document.pointerLockElement) requestPointerLock()
})

// ---------------------------------------------------------------- town: houses, doors, environment

const housing = useCityHousing({
  myAccountId,
  gameRoomRef,
  roomMessage,
  enterHouse: (ownerAccountId, templateKey) => {
    closeInventory()
    realtime.enterHouse(ownerAccountId, templateKey)
  },
})

const interactions = useInteractionTargets({
  currentRoomLabel,
  myPosition,
  myAccountId,
  getCamera,
  canvasRef,
  promptsHidden: () => inventoryOpen.value || housing.claimInFlight.value,
  housingUnits: housing.units,
  nearbyHousingUnit: housing.nearbyUnit,
  onExitDoor: () => {
    placement.cancelPreview()
    realtime.exitBuilding()
  },
  onHousingDoor: () => void housing.interact(),
  onWorkDoor: (lot) => {
    closeInventory()
    realtime.enterWork(lot.key)
  },
  // Fishing gameplay is not built yet: the spots only show their prompt.
  onFishingSpot: () => window.alert('implement pechee'),
  storeTarget: () => {
    const target = storeTarget.value
    if (!target) return null
    const detail = target.coins !== null ? `${target.name} · ${target.coins} coins` : target.name
    return { position: target.display.tag.position, detail }
  },
  onStoreTarget: openStorePurchase,
})
const { doorPrompt, renewPrompt } = interactions

const environment = useRoomEnvironment({
  getScene,
  getRenderer,
  houseKeyForTemplate: housing.houseKeyForTemplate,
  onTownLoaded: interactions.setTownLayout,
  onInteriorLoaded: (built) => {
    placement.registerApartmentEnvironment(built)
    if (built.house.key === COVE_HOME.key) void furnitureStore.attach(built.group)
  },
  onError: (message) => {
    roomMessage.value = message
  },
})

/** Back to the town resets everything tied to the building we were in. */
function setRoomEnvironment(kind: 'city' | 'apartment', templateKey?: string, workKey?: string | null): void {
  if (kind === 'city') {
    placement.setPlayerInsideApartment(false)
    canEditApartment.value = false
    visitedApartmentOwnerId.value = null
    visitedWorkKey.value = null
    Object.assign(myPosition, HOUSING_LOBBY_SPAWN)
    resetClientStateForCityWorld()
    clearApartmentObjects()
  }
  environment.setRoomEnvironment(kind, templateKey, workKey)
}

// ---------------------------------------------------------------- input, loop, realtime

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (e.code === 'KeyU' && !e.repeat && currentRoomLabel.value === 'city') {
    void housing.renewNearby()
    return true
  }
  if (e.code === 'KeyC' && !e.repeat) {
    const scene = getScene()
    if (!scene) return true
    const on = toggleCollisionDebug(scene)
    const stats = getWorldCollisionStats()
    console.info(`[collision] debug ${on ? 'ON' : 'OFF'} — ${stats.cuboids} cuboids, mode=${stats.mode ?? 'n/a'}`)
    return true
  }
  return placement.onKeyDown(e)
}

const movement = useGameMovement({
  pointerLocked,
  myPosition,
  canvasRef,
  containerRef,
  gameRoomRef,
  currentRoomLabel,
  inventoryOpen,
  getScene,
  getCamera,
  getRenderer,
  getFpHands: () => game?.fpHands ?? null,
  refreshMyAppearance,
  updateProximity: interactions.updateProximity,
  tryInteract: interactions.tryInteract,
  onToggleInventory: toggleInventory,
  onHotbarDigit: selectHotbarIndex,
  handleExtraKeyDown,
  onCanvasMouseDown: (e) => placement.onPointerDown(e),
  onBeforeRender: (dt) => {
    positionLabel.value = formatPosition()
    realtime.tickRemoteAvatars(dt)
    if (currentRoomLabel.value === 'apartment') placement.tick(dt)
    furnitureStore.update()
    interactions.updatePrompts()
  },
  isLargeInterior: () => inStore.value,
})
const { requestPointerLock, onCanvasMouseDown } = movement

const realtime = useGameRealtime({
  router,
  gameRoomRef,
  getScene,
  getCamera,
  getCanvas: () => canvasRef.value,
  pointerLocked,
  requestPointerLock,
  currentRoomLabel,
  canEditApartment,
  visitedApartmentOwnerId,
  visitedWorkKey,
  myPosition,
  roomMessage,
  refreshMyAppearance,
  inventory: {
    loading: inventoryLoading,
    error: inventoryError,
    applyServerPayload: applyServerInventoryPayload,
    pickupCodeToHotbar: pickupToHotbar,
  },
  apartment: {
    selectedPlacedObjectId,
    detachForRoomSwitch,
    ensureApartmentObjectsFromServer,
    clearApartmentObjects,
    upsertApartmentObjectFromRemote,
    removeApartmentObjectMesh,
    onActionError: () => placement.cancelPreview(),
  },
  setRoomEnvironment,
  onHousingUnitsSync: housing.applyUnits,
})
const { transitioning, switchingRoom } = realtime

// The inventory panel needs the mouse; closing it goes back to mouse look.
watch(inventoryOpen, (open) => {
  if (open) {
    if (document.pointerLockElement) document.exitPointerLock()
  } else if (!document.pointerLockElement) {
    requestPointerLock()
  }
})

// ---------------------------------------------------------------- lifecycle

async function loadCosmeticsState(): Promise<CharacterCosmeticsState> {
  try {
    return await fetchCharacterCosmetics()
  } catch {
    return { slots: emptyCosmeticLoadout(), colors: defaultCosmeticColors() }
  }
}

let unmounted = false

async function bootGame() {
  if (!getStoredAuth()) {
    void router.push({ name: 'landing' })
    return
  }
  const cosmetics = await loadCosmeticsState()
  if (unmounted || !canvasRef.value) return
  const handsColor = parseInt(cosmetics.colors.body.replace('#', ''), 16)
  game = createGameScene(canvasRef.value, movement.containerSize(), handsColor)
  setRoomEnvironment('city')
  await realtime.connectRealtime(cosmetics)
  try {
    housing.applyUnits((await fetchHousingUnits()).units)
  } catch {
    /* the realtime init / housing_units_sync also deliver the units */
  }
  await loadLayoutFromServer()
  refreshOwnedItems()
  if (!unmounted) movement.startRenderLoop()
}

function leaveRoom() {
  void gameRoomRef.value?.leave()
}

function logout() {
  clearAuth()
  leaveRoom()
  void router.push({ name: 'landing' })
}

let unbindInput: (() => void) | null = null

onMounted(() => {
  void bootGame()
  unbindInput = movement.bindInputListeners()
  window.addEventListener('beforeunload', leaveRoom)
  window.addEventListener('pagehide', leaveRoom)
})

onUnmounted(() => {
  unmounted = true
  clearTimeout(storeFeedbackTimer)
  movement.stopRenderLoop()
  unbindInput?.()
  window.removeEventListener('beforeunload', leaveRoom)
  window.removeEventListener('pagehide', leaveRoom)
  refreshMyAppearance.value = null
  leaveRoom()
  realtime.clearRemoteUsers()
  placement.dispose()
  clearApartmentObjects()
  environment.disposeRoomEnvironment()
  if (game) disposeGameScene(game)
  game = null
})

const crosshairClass = computed(() => {
  if (placementPreviewActive.value && crosshairTint.value === 'invalid') {
    return 'border-coral bg-coral/40 shadow-[0_0_10px_rgb(var(--cc-coral))]'
  }
  if (placementPreviewActive.value && crosshairTint.value === 'valid') {
    return 'border-mint bg-mint/40 shadow-[0_0_10px_rgb(var(--cc-mint))]'
  }
  return 'border-white/90 bg-white/30 shadow-[0_0_0_2px_rgb(0_0_0/0.35)]'
})
</script>

<template>
  <div ref="containerRef" class="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
    <canvas
      ref="canvasRef"
      class="block min-h-0 w-full flex-1 cursor-crosshair"
      @click="requestPointerLock"
      @mousedown="onCanvasMouseDown"
      @contextmenu.prevent
    />
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-150"
      :class="crosshairClass"
    />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameHudToolbar
      :current-room-label="currentRoomLabel"
      :apartment-object-count="apartmentObjectCount"
      :position-label="positionLabel"
      :show-graphics-toggle="!pointerLocked"
      :place-label="inStore ? COVE_HOME.name : undefined"
    />
    <GameInteractionPrompt
      v-if="doorPrompt"
      :screen-x="doorPrompt.x"
      :screen-y="doorPrompt.y"
      :action-label="doorPrompt.action"
      :detail-label="doorPrompt.detail"
    />
    <GameInteractionPrompt
      v-if="renewPrompt"
      :screen-x="renewPrompt.x"
      :screen-y="renewPrompt.y"
      key-label="U"
      action-label="Renew"
    />
    <GamePlacementHud :visible="placementPreviewActive" :hints="placementHudHints" />
    <div
      v-if="inStore && storeDepartment && !inventoryOpen"
      class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 px-4 py-1.5 font-display text-xs uppercase tracking-[0.2em] text-fog"
    >
      <span class="text-sun">Cove Home</span> · {{ storeDepartment }}
    </div>
    <GameStoreItemCard v-if="storeTarget && !inventoryOpen" :target="storeTarget" :feedback="storeFeedback" />
    <p
      v-else-if="inStore && storeFeedback && !inventoryOpen"
      class="cc-hud pointer-events-none absolute bottom-24 right-3 z-20 max-w-xs px-3 py-2 text-xs font-bold"
      :class="storeFeedback.kind === 'success' ? 'text-mint' : 'text-coral'"
    >
      {{ storeFeedback.text }}
    </p>
    <GamePlayerHotbar
      :slots="slots"
      :selected-hotbar-index="selectedHotbarIndex"
      :item-by-code="itemByCode"
      @select-slot="selectHotbarIndex"
      @pointer-down="onSlotPointerDown"
      @pointer-up="onSlotPointerUp"
      @drag-start="onSlotDragStart"
      @drag-over="onSlotDragOver"
      @drop="onSlotDrop"
      @drag-end="onSlotDragEnd"
      @clear-slot="clearSlot"
    />
    <GamePlayerInventoryPanel
      v-if="inventoryOpen"
      :slots="slots"
      :selected-hotbar-index="selectedHotbarIndex"
      :item-by-code="itemByCode"
      :cursor-item="cursorItem"
      :loading="inventoryLoading"
      :error="inventoryError"
      :current-room-label="currentRoomLabel"
      :can-edit-apartment="canEditApartment"
      :apartment-object-ids="apartmentObjectIds"
      :selected-placed-object-id="selectedPlacedObjectId"
      @close="closeInventory"
      @refresh="refreshOwnedItems"
      @cancel-cursor="cancelCursorPick"
      @slot-pointer-down="onSlotPointerDown"
      @slot-pointer-up="onSlotPointerUp"
      @slot-drag-start="onSlotDragStart"
      @slot-drag-over="onSlotDragOver"
      @slot-drop="onSlotDrop"
      @slot-drag-end="onSlotDragEnd"
      @clear-slot="clearSlot"
      @pickup-selected-placed-object="pickupSelectedPlacedObject"
      @placed-object-selected="onPlacedObjectSelected"
    />
    <GamePointerLockOverlay
      v-show="!pointerLocked && !inventoryOpen && !transitioning && !switchingRoom && !storeConfirmItem"
      @request-pointer-lock="requestPointerLock"
      @logout="logout"
    />
    <div v-show="pointerLocked" class="absolute right-3 top-3 z-10">
      <button
        type="button"
        class="cc-hud inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-fog transition hover:border-coral/70 hover:text-coral"
        @click="logout"
      >
        <UiIcon name="logout" :size="14" /> Log out
      </button>
    </div>
    <p
      v-if="currentRoomLabel === 'apartment' && inventoryOpen && placementPreviewActive"
      class="cc-hud pointer-events-none absolute bottom-24 left-3 z-[31] max-w-md px-3 py-1.5 text-[11px] font-bold leading-snug text-mist"
    >
      R = rotate · Shift+R = reverse · LMB = place / pick · RMB = cancel · Esc / E = cancel
    </p>
    <ItemShopPurchaseConfirmModal
      v-if="storeConfirmItem"
      v-model:confirm-currency="storeConfirmCurrency"
      class="z-[60]"
      :item="storeConfirmItem"
      :confirm-current="storeConfirmCurrent"
      :confirm-after="storeConfirmAfter"
      :confirm-option="storeConfirmOption"
      :purchasing-id="storePurchasingId"
      @close="storeShop.closePurchaseConfirm"
      @confirm="confirmStorePurchase"
    />
  </div>
</template>
