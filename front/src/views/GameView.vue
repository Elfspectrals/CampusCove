<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Room } from '@colyseus/sdk'
import {
  bodyModelGlbFromLoadout,
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
import GameSettingsDialog from '../components/game/GameSettingsDialog.vue'
import GameStoreItemCard from '../components/game/GameStoreItemCard.vue'
import GameCafeMenu from '../components/game/GameCafeMenu.vue'
import GameSurvivalEffects from '../components/game/GameSurvivalEffects.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useCafeCounter } from '../composables/game/useCafeCounter'
import { useFurnitureStore } from '../composables/game/useFurnitureStore'
import { useHouseFurniture } from '../composables/game/useHouseFurniture'
import { useHouseKeys } from '../composables/game/useHouseKeys'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useCityHousing } from '../composables/game/useCityHousing'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { useInteractionTargets } from '../composables/game/useInteractionTargets'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import { useRoomEnvironment } from '../composables/game/useRoomEnvironment'
import { useSurvival } from '../composables/game/useSurvival'
import { usePunch } from '../composables/game/usePunch'
import { useShopPurchase } from '../composables/useShopPurchase'
import { toggleCollisionDebug } from '../game/collision/collisionDebug'
import { actionKeyLabels, matches } from '../config/keybindings'
import { getWorldCollisionStats } from '../game/collision/worldCollision'
import { HOUSING_LOBBY_SPAWN } from '../game/gameRoomConstants'
import { createGameScene, disposeGameScene, type GameScene } from '../game/gameScene'
import { createFirstPersonArms } from '../game/firstPersonArms'
import { createHeldItem } from '../game/heldItem'
import { COVE_HOME, findHouse, findWork } from '../game/assets/catalog'
import { createDoorSigns } from '../game/town/doorSigns'
import { houseKeyAt, openHouseInterior, updateFrontDoors } from '../game/town/openHouses'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ---------------------------------------------------------------- shared game state

const gameRoomRef = shallowRef<Room | null>(null)
const roomMessage = ref<string | null>(null)
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
  apartmentObjectIds,
  apartmentObjectKeys,
  selectedPlacedObjectId,
  detachForRoomSwitch,
  clearApartmentObjects,
  ensureApartmentObjectsFromServer,
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
  selectedItem,
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
  canDecorate,
  selectedPlacedObjectId,
  startPlacementPreview: (itemDef, ownedCountRef) => placement.startPreviewNew(itemDef, ownedCountRef),
  cancelPlacementPreview: () => placement.cancelPreview(),
})

// ---------------------------------------------------------------- Cove Home furniture store

const inStore = computed(() => currentHouseKey.value === COVE_HOME.key)
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

const holdingHouseKey = () => selectedItem.value?.code === 'house_key'

const housing = useCityHousing({
  myAccountId,
  gameRoomRef,
  roomMessage,
  holdingHouseKey,
})

const interactions = useInteractionTargets({
  myPosition,
  getCamera,
  canvasRef,
  promptsHidden: () => inventoryOpen.value || housing.claimInFlight.value,
  housingUnits: housing.units,
  nearbyHousingUnit: housing.nearbyUnit,
  housingActionFor: housing.actionFor,
  isWorkDoorOpen: (lot) => housing.isWorkDoorOpen(lot.key),
  onHousingDoor: () => {
    const unit = housing.nearbyUnit.value
    const action = unit ? housing.actionFor(unit) : null
    if (action === 'open' || action === 'close') arms?.use('door')
    else if (action === 'lock') arms?.use('key')
    void housing.interact()
  },
  onWorkDoor: (lot) => {
    arms?.use('door')
    gameRoomRef.value?.send('door_toggle', { workKey: lot.key })
  },
  // Fishing gameplay is not built yet: the spots only show their prompt.
  onFishingSpot: () => window.alert('implement pechee'),
  storeTarget: () => {
    const target = storeTarget.value
    if (!target) return null
    const detail = target.coins !== null ? `${target.name} · ${target.coins} coins` : target.name
    return { position: target.tagPosition, detail }
  },
  onStoreTarget: openStorePurchase,
})
const { doorPrompt } = interactions

const houseKeys = useHouseKeys({
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  roomMessage,
  myHouse: () => housing.units.value.find((u) => u.occupant_account_id === myAccountId.value) ?? null,
  holdingHouseKey,
  promptsHidden: () => inventoryOpen.value,
})
const { keyPrompt } = houseKeys

const heldItem = createHeldItem()
let arms: ReturnType<typeof createFirstPersonArms> | null = null
watch(() => selectedItem.value?.code ?? null, () => arms?.equip())

/** Model shown in the right hand: tools and food (a half-eaten item is drawn smaller). */
function heldModel(): { url: string | null; scale: number } {
  const item = selectedItem.value
  if (!item || (item.kind !== 'tool' && item.kind !== 'consumable')) return { url: null, scale: 1 }
  const eaten = item.portions && item.portions_left ? item.portions_left / item.portions : 1
  return { url: item.model_glb, scale: 0.55 + 0.45 * eaten }
}

// ---------------------------------------------------------------- survival: hunger, thirst, health

const survival = useSurvival({
  gameRoomRef,
  getScene,
  getCamera,
  canvasRef,
  getFpHands: () => game?.fpHands ?? null,
  getArms: () => arms,
  myPosition,
  pointerLocked,
  selectedItem,
  refreshInventory: () => refreshOwnedItems(),
  teleport: (x, y, z) => {
    Object.assign(myPosition, { x, y, z })
    getCamera()?.position.set(x, y, z)
  },
  promptsHidden: () => inventoryOpen.value,
})
const {
  prompt: survivalPrompt,
  effects: survivalEffects,
  damageFlash,
  knockedOut,
  hospitalBill,
  message: survivalMessage,
  reducedEffects,
} = survival

const cafe = useCafeCounter({
  myPosition,
  getCamera,
  canvasRef,
  promptsHidden: () => inventoryOpen.value,
  refreshInventory: () => refreshOwnedItems(),
})
const {
  prompt: cafePrompt,
  menuOpen: cafeMenuOpen,
  menu: cafeMenu,
  loading: cafeLoading,
  buyingId: cafeBuyingId,
  feedback: cafeFeedback,
} = cafe
// Back to mouse look once the menu closes.
watch(cafeMenuOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})

/** Key settings opened from the pause screen. */
const settingsOpen = ref(false)

/** Placement controls with the player's own keys. */
const placementHelp = computed(() => {
  const rotate = actionKeyLabels('rotate')[0] ?? '?'
  const inv = actionKeyLabels('inventory')[0]
  return `${rotate} = rotate · Shift+${rotate} = reverse · LMB = place / pick · RMB = cancel · Esc${inv ? ` / ${inv}` : ''} = cancel`
})

/** One-line hint above the hotbar for the food in hand. */
const heldFoodHint = computed(() => {
  const item = survival.heldConsumable()
  if (!item || !pointerLocked.value) return null
  const cookKey = actionKeyLabels('cook')[0]
  const cook = item.code === 'food_fish_raw' && cookKey ? ` · ${cookKey} at a stove / BBQ: cook` : ''
  return `Click: eat ${item.name}${cook}`
})

const canvasFilter = computed(() => {
  const desaturation = survivalEffects.value?.desaturation ?? 0
  return desaturation > 0 ? { filter: `saturate(${(1 - desaturation).toFixed(2)})` } : undefined
})

function isBuildingDoorOpen(buildingKey: string): boolean {
  const unit = housing.units.value.find((u) => u.model_key === buildingKey)
  if (unit) return housing.isDoorOpen(unit)
  return findWork(buildingKey) || buildingKey === COVE_HOME.key ? housing.isWorkDoorOpen(buildingKey) : true
}

const DOOR_SIGN_REFRESH_MS = 30_000
const doorSigns = createDoorSigns()
const refreshDoorSigns = () => doorSigns.update(housing.units.value, myAccountId.value)
watch(housing.units, refreshDoorSigns)
const doorSignTimer = window.setInterval(refreshDoorSigns, DOOR_SIGN_REFRESH_MS)
void document.fonts.ready.then(() => {
  doorSigns.invalidate()
  refreshDoorSigns()
})

const environment = useRoomEnvironment({
  getScene,
  getRenderer,
  onTownLoaded: (manifest) => {
    interactions.setWorldManifest(manifest)
    survival.onTownLoaded(manifest)
    houseFurniture.onTownReady()
    const store = openHouseInterior(COVE_HOME.key)
    if (store) void furnitureStore.attach(store)
  },
  onError: (message) => {
    roomMessage.value = message
  },
})

/** (Re)joining the town resets the decoration and inventory state. */
function loadTown(): void {
  placement.setPlayerInsideApartment(false)
  Object.assign(myPosition, HOUSING_LOBBY_SPAWN)
  resetClientStateForCityWorld()
  clearApartmentObjects()
  houseFurniture.refresh()
  environment.loadTown()
}

// ---------------------------------------------------------------- input, loop, realtime

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (houseKeys.onKeyDown(e)) return true
  if (survival.onKeyDown(e)) return true
  if (matches('buyHouse', e.code) && !e.repeat) {
    e.preventDefault()
    return housing.buy()
  }
  // collision overlay: a developer tool, kept off in production so it never steals a player's key
  if (import.meta.env.DEV && e.code === 'KeyC' && !e.repeat) {
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
  onCanvasMouseDown: (e) => {
    if (e.button === 2 && pointerLocked.value && housing.unlock()) {
      arms?.use('key')
      return true
    }
    if (placement.onPointerDown(e)) return true
    // doors and shops first, then the cafe counter, then what is held in hand (food, fountain sips), then a punch
    if (e.button === 0 && pointerLocked.value) {
      return interactions.tryInteract() || cafe.tryOpen() || survival.onPrimaryDown() || punch.tryPunch()
    }
    return false
  },
  speedFactor: () => survival.speedFactor(),
  onBeforeRender: (dt) => {
    positionLabel.value = formatPosition()
    realtime.tickRemoteAvatars(dt)
    currentHouseKey.value = houseKeyAt(myPosition.x, myPosition.z)
    placement.tick(dt)
    furnitureStore.update()
    interactions.updatePrompts()
    houseKeys.updateKeyPrompt()
    updateFrontDoors(dt, isBuildingDoorOpen)
    arms?.update(dt, myPosition)
    const held = heldModel()
    heldItem.update(arms?.rightHand() ?? null, held.url, held.scale)
    survival.tick(dt)
    cafe.updatePrompt()
    if (!doorSigns.group.parent) getScene()?.add(doorSigns.group)
  },
})
const { requestPointerLock, onCanvasMouseDown } = movement

const punch = usePunch({
  gameRoomRef,
  getScene,
  getCamera,
  getArms: () => arms,
  myPosition,
  pointerLocked,
  knockedOut,
  reducedEffects,
  shakeCamera: movement.shakeCamera,
  knockBack: movement.knockBack,
})

const realtime = useGameRealtime({
  router,
  gameRoomRef,
  getScene,
  getCamera,
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
    detachForRoomSwitch,
    clearApartmentObjects,
    onActionError: () => placement.cancelPreview(),
  },
  loadTown,
  onHousingUnitsSync: housing.applyUnits,
  onHouseFurnitureSync: houseFurniture.applyHouses,
  onDoorsSync: housing.applyOpenDoors,
  onMyBodyModel: (bodyModelGlb) => arms?.setSkin(bodyModelGlb),
  onPunched: punch.onPunched,
})
const { switchingRoom } = realtime

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
  game = createGameScene(canvasRef.value, movement.containerSize())
  arms = createFirstPersonArms(game.fpHands)
  arms.setSkin(bodyModelGlbFromLoadout(cosmetics.slots))
  loadTown()
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
let unbindSurvivalInput: (() => void) | null = null

onMounted(() => {
  void bootGame()
  unbindInput = movement.bindInputListeners()
  unbindSurvivalInput = survival.bindInputListeners()
  window.addEventListener('beforeunload', leaveRoom)
  window.addEventListener('pagehide', leaveRoom)
})

onUnmounted(() => {
  unmounted = true
  movement.stopRenderLoop()
  unbindInput?.()
  unbindSurvivalInput?.()
  survival.dispose()
  window.removeEventListener('beforeunload', leaveRoom)
  window.removeEventListener('pagehide', leaveRoom)
  refreshMyAppearance.value = null
  leaveRoom()
  realtime.clearRemoteUsers()
  placement.dispose()
  clearApartmentObjects()
  houseFurniture.dispose()
  window.clearInterval(doorSignTimer)
  doorSigns.dispose()
  arms?.dispose()
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
      :style="canvasFilter"
      @click="requestPointerLock"
      @mousedown="onCanvasMouseDown"
      @contextmenu.prevent
    />
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-150"
      :class="crosshairClass"
    />
    <GameSurvivalEffects
      :effects="survivalEffects"
      :damage-flash="damageFlash"
      :knocked-out="knockedOut"
      :hospital-bill="hospitalBill"
      :message="survivalMessage"
    />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameHudToolbar
      :position-label="positionLabel"
      :show-graphics-toggle="!pointerLocked"
      :place-label="inStore ? COVE_HOME.name : undefined"
      :reduced-effects="reducedEffects"
      @toggle-reduced-effects="survival.toggleReducedEffects"
    />
    <GameInteractionPrompt
      v-if="doorPrompt"
      :screen-x="doorPrompt.x"
      :screen-y="doorPrompt.y"
      :key-label="doorPrompt.key"
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
    <GameInteractionPrompt
      v-if="survivalPrompt && !doorPrompt"
      :screen-x="survivalPrompt.x"
      :screen-y="survivalPrompt.y"
      :key-label="survivalPrompt.key"
      :action-label="survivalPrompt.action"
      :detail-label="survivalPrompt.detail"
    />
    <GameInteractionPrompt
      v-if="cafePrompt && !doorPrompt"
      :screen-x="cafePrompt.x"
      :screen-y="cafePrompt.y"
      :action-label="cafePrompt.action"
      :detail-label="cafePrompt.detail"
    />
    <p
      v-if="heldFoodHint && !inventoryOpen"
      class="cc-hud pointer-events-none absolute bottom-[88px] left-1/2 z-20 -translate-x-1/2 px-3 py-1 text-[11px] font-bold text-fog"
    >
      {{ heldFoodHint }}
    </p>
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
      :can-edit-apartment="canDecorate"
      :apartment-object-ids="apartmentObjectIds"
      :apartment-object-keys="apartmentObjectKeys"
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
      @pickup-placed-object="(id: string) => { onPlacedObjectSelected(id); pickupSelectedPlacedObject() }"
    />
    <GamePointerLockOverlay
      v-show="!pointerLocked && !inventoryOpen && !switchingRoom && !cafeMenuOpen && !settingsOpen"
      @request-pointer-lock="requestPointerLock"
      @open-settings="settingsOpen = true"
      @logout="logout"
    />
    <GameSettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
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
      {{ placementHelp }}
    </p>
    <GameCafeMenu
      v-if="cafeMenuOpen"
      :items="cafeMenu"
      :loading="cafeLoading"
      :buying-id="cafeBuyingId"
      :feedback="cafeFeedback"
      @buy="cafe.buy"
      @close="cafe.close"
    />
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
