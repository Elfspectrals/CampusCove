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
import UiIcon from '../components/ui/UiIcon.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useHouseFurniture } from '../composables/game/useHouseFurniture'
import { useHouseKeys } from '../composables/game/useHouseKeys'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useCityHousing } from '../composables/game/useCityHousing'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { useInteractionTargets } from '../composables/game/useInteractionTargets'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import { useRoomEnvironment } from '../composables/game/useRoomEnvironment'
import { toggleCollisionDebug } from '../game/collision/collisionDebug'
import { getWorldCollisionStats } from '../game/collision/worldCollision'
import { HOUSING_LOBBY_SPAWN } from '../game/gameRoomConstants'
import { createGameScene, disposeGameScene, type GameScene } from '../game/gameScene'
import { findHouse } from '../game/assets/catalog'
import { houseKeyAt, openHouseInterior } from '../game/town/openHouses'

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
const currentHouseKey = ref<string | null>(null)
const editableHouseKey = computed(() => {
  const houseKey = currentHouseKey.value
  const me = myAccountId.value
  if (!houseKey || me === null) return null
  const unit = housing.units.value.find((u) => u.model_key === houseKey)
  return unit && (unit.occupant_account_id === me || unit.key_holder_account_ids.includes(me)) ? houseKey : null
})
const canDecorate = computed(() => editableHouseKey.value !== null)

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
  getParent: () => (editableHouseKey.value ? openHouseInterior(editableHouseKey.value) : undefined),
  getGameRoom: () => gameRoomRef.value,
  canDecorate,
  onMeshUpserted: (mesh) => placement.registerApartmentProp(mesh),
  onMeshRemoved: (objectId) => {
    placement.unregisterApartmentProp(objectId)
    placement.notifyPropRemovedFromWorld(objectId)
  },
})
const houseFurniture = useHouseFurniture({
  getScene,
  editableHouseKey: () => editableHouseKey.value,
  editableHouseObjects: { ensureApartmentObjectsFromServer, clearApartmentObjects },
})

const placement = useApartmentPlacement({
  getScene,
  getCamera,
  getColyseusRoom: () => gameRoomRef.value,
  getApartmentObjectMesh,
  getApartmentInventoryOpen: () => inventoryOpen.value,
  canDecorate,
  pointerLocked,
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
  canDecorate,
  selectedPlacedObjectId,
  startPlacementPreview: (itemDef, ownedCountRef) => placement.startPreviewNew(itemDef, ownedCountRef),
  cancelPlacementPreview: () => placement.cancelPreview(),
})

// ---------------------------------------------------------------- town: houses, doors, environment

const housing = useCityHousing({
  myAccountId,
  gameRoomRef,
  roomMessage,
})

const interactions = useInteractionTargets({
  currentRoomLabel,
  myPosition,
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
})
const { doorPrompt } = interactions

const houseKeys = useHouseKeys({
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  roomMessage,
  myHouse: () => housing.units.value.find((u) => u.occupant_account_id === myAccountId.value) ?? null,
  promptsHidden: () => inventoryOpen.value || currentRoomLabel.value !== 'city',
})
const { keyPrompt } = houseKeys

const environment = useRoomEnvironment({
  getScene,
  getRenderer,
  houseKeyForTemplate: housing.houseKeyForTemplate,
  onTownLoaded: (manifest) => {
    interactions.setWorldManifest(manifest)
    houseFurniture.onTownReady()
  },
  onInteriorLoaded: (built) => placement.registerApartmentEnvironment(built),
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
    houseFurniture.refresh()
  }
  environment.setRoomEnvironment(kind, templateKey, workKey)
}

// ---------------------------------------------------------------- input, loop, realtime

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (houseKeys.onKeyDown(e)) return true
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
    currentHouseKey.value = currentRoomLabel.value === 'city' ? houseKeyAt(myPosition.x, myPosition.z) : null
    if (canDecorate.value) placement.tick(dt)
    interactions.updatePrompts()
    houseKeys.updateKeyPrompt()
  },
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
  onHouseFurnitureSync: houseFurniture.applyHouses,
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

watch(editableHouseKey, (houseKey) => {
  houseFurniture.refresh()
  const unit = houseKey ? housing.units.value.find((u) => u.model_key === houseKey) : undefined
  gameRoomRef.value?.send('decorate_house', { templateKey: unit?.template_key ?? null })
  placement.setPlayerInsideApartment(false)
  const interior = houseKey ? openHouseInterior(houseKey) : undefined
  const house = houseKey ? findHouse(houseKey) : null
  if (!interior || !house) return
  placement.registerApartmentEnvironment({
    group: interior,
    house: { key: house.key, interiorCollisionUrl: house.interiorCollisionUrl },
  })
  for (const objectId of apartmentObjectIds.value) {
    const mesh = getApartmentObjectMesh(objectId)
    if (mesh) placement.registerApartmentProp(mesh)
  }
  refreshOwnedItems()
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
  movement.stopRenderLoop()
  unbindInput?.()
  window.removeEventListener('beforeunload', leaveRoom)
  window.removeEventListener('pagehide', leaveRoom)
  refreshMyAppearance.value = null
  leaveRoom()
  realtime.clearRemoteUsers()
  placement.dispose()
  clearApartmentObjects()
  houseFurniture.dispose()
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
    />
    <GameInteractionPrompt
      v-if="doorPrompt"
      :screen-x="doorPrompt.x"
      :screen-y="doorPrompt.y"
      :action-label="doorPrompt.action"
      :detail-label="doorPrompt.detail"
    />
    <GameInteractionPrompt
      v-if="keyPrompt"
      :screen-x="keyPrompt.x"
      :screen-y="keyPrompt.y"
      key-label="K"
      :action-label="keyPrompt.action"
      :detail-label="keyPrompt.detail"
    />
    <GamePlacementHud :visible="placementPreviewActive" :hints="placementHudHints" />
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
      :can-edit-apartment="canDecorate"
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
      v-show="!pointerLocked && !inventoryOpen && !transitioning && !switchingRoom"
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
      v-if="canDecorate && inventoryOpen && placementPreviewActive"
      class="cc-hud pointer-events-none absolute bottom-24 left-3 z-[31] max-w-md px-3 py-1.5 text-[11px] font-bold leading-snug text-mist"
    >
      R = rotate · Shift+R = reverse · LMB = place / pick · RMB = cancel · Esc / E = cancel
    </p>
  </div>
</template>
