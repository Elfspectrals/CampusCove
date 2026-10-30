<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { Room } from '@colyseus/sdk'
import {
  DEFAULT_SLOT_COLORS,
  wearModelsFromLoadout,
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  type CharacterCosmeticsState,
} from '../api/characterCosmetics'
import { fetchHousingUnits } from '../api/housing'
import { applyCachedBalanceAfterPurchase, clearAuth, getStoredAuth } from '../api/session'
import GameHitMarker from '../components/game/GameHitMarker.vue'
import GameHudToolbar from '../components/game/GameHudToolbar.vue'
import GameInteractionPrompt from '../components/game/GameInteractionPrompt.vue'
import GamePlacementHud from '../components/game/GamePlacementHud.vue'
import GamePlayerHotbar from '../components/game/GamePlayerHotbar.vue'
import GameVitals from '../components/game/GameVitals.vue'
import GamePlayerInventoryPanel from '../components/game/GamePlayerInventoryPanel.vue'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameSettingsDialog from '../components/game/GameSettingsDialog.vue'
import GameStoreItemCard from '../components/game/GameStoreItemCard.vue'
import GameCafeMenu from '../components/game/GameCafeMenu.vue'
import GamePubMenu from '../components/game/GamePubMenu.vue'
import GamePubSecretDialog from '../components/game/GamePubSecretDialog.vue'
import GameDrunkEffects from '../components/game/GameDrunkEffects.vue'
import GameDrinkFast from '../components/game/GameDrinkFast.vue'
import GamePubChallenge from '../components/game/GamePubChallenge.vue'
import GamePubRaceBoard from '../components/game/GamePubRaceBoard.vue'
import GameMeterShot from '../components/game/GameMeterShot.vue'
import GameDarts from '../components/game/GameDarts.vue'
import GameBasketCheckout from '../components/game/GameBasketCheckout.vue'
import GameWardrobe from '../components/game/GameWardrobe.vue'
import GameSurvivalEffects from '../components/game/GameSurvivalEffects.vue'
import GameTradeWindow from '../components/game/GameTradeWindow.vue'
import GameWatchMenu from '../components/game/GameWatchMenu.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useCafeCounter } from '../composables/game/useCafeCounter'
import { useClinic } from '../composables/game/useClinic'
import { useFurnitureStore } from '../composables/game/useFurnitureStore'
import { useClothingStore } from '../composables/game/useClothingStore'
import { useHouseFurniture } from '../composables/game/useHouseFurniture'
import { useHouseKeys } from '../composables/game/useHouseKeys'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useCityHousing } from '../composables/game/useCityHousing'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { useInteractionTargets } from '../composables/game/useInteractionTargets'
import { useIntoxication } from '../composables/game/useIntoxication'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import { usePub } from '../composables/game/usePub'
import { usePubChallenge } from '../composables/game/usePubChallenge'
import { usePubGames } from '../composables/game/usePubGames'
import { useRoomEnvironment } from '../composables/game/useRoomEnvironment'
import { useSeats } from '../composables/game/useSeats'
import { useSurvival } from '../composables/game/useSurvival'
import { useTrade } from '../composables/game/useTrade'
import { usePunch } from '../composables/game/usePunch'
import { useShopPurchase } from '../composables/useShopPurchase'
import { toggleCollisionDebug } from '../game/collision/collisionDebug'
import { actionKeyLabels, matches, mouseButtonCode } from '../config/keybindings'
import { getWorldCollisionStats } from '../game/collision/worldCollision'
import { HOUSING_LOBBY_SPAWN } from '../game/gameRoomConstants'
import { createGameScene, disposeGameScene, type GameScene } from '../game/gameScene'
import { createFirstPersonArms } from '../game/firstPersonArms'
import { createHeldItem } from '../game/heldItem'
import {
  CANDY_CLOUD,
  COVE_HOME,
  COVE_THREADS,
  CRISPINS_HARDWARE,
  GREENCART,
  HEARTH_HOLLOW,
  NORTHLINE,
  SUMMIT_SPORTS,
  consumableModelUrl,
  decorModelUrl,
  findHouse,
  findStore,
  findWork,
} from '../game/assets/catalog'
import type { GearSlot } from '../game/wardrobeSlots'
import { createSfx } from '../game/sfx'
import { createAmbientLoop } from '../game/ambientLoop'
import { MAX_STAMINA } from '../game/stamina'
import { createDoorSigns } from '../game/town/doorSigns'
import { frontDoorNode, houseKeyAt, openHouseInterior, rattleFrontDoor, updateFrontDoors } from '../game/town/openHouses'
import { isAlcoholItem, isMedicalItem } from '../utils/itemShopPresentation'

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
const sfx = createSfx(getCamera)
const threadsMusic = createAmbientLoop(COVE_THREADS.musicUrl, 0.18, sfx.listener)
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
  placeInSlot,
  releaseCursor,
  draggingCode,
} = usePlayerInventory({
  gameRoomRef,
  canDecorate,
  selectedPlacedObjectId,
  startPlacementPreview: (itemDef, ownedCountRef) => placement.startPreviewNew(itemDef, ownedCountRef),
  cancelPlacementPreview: () => placement.cancelPreview(),
  onGearDrop: (gear, slotIndex) => void wardrobeRef.value?.takeOff(gear as GearSlot, slotIndex),
  onQuickWear: (slotIndex) => void wardrobeRef.value?.wearFromSlot(slotIndex),
})

// ---------------------------------------------------------------- stores: Cove Home, the mall's Hearth & Hollow and GreenCart (click to buy), Cove Threads and Northline (basket)

const inStore = computed(() => currentHouseKey.value === COVE_HOME.key)
const furnitureStore = useFurnitureStore({ inStore: () => inStore.value, getCamera, myPosition })
const hearthStore = useFurnitureStore({
  inStore: () => currentHouseKey.value === HEARTH_HOLLOW.key,
  getCamera,
  myPosition,
  store: { interiorLayoutUrl: HEARTH_HOLLOW.interiorLayoutUrl, modelUrl: (display) => decorModelUrl(display.key) },
})
const greencartStore = useFurnitureStore({
  inStore: () => currentHouseKey.value === GREENCART.key,
  getCamera,
  myPosition,
  store: { interiorLayoutUrl: GREENCART.interiorLayoutUrl, modelUrl: (display) => consumableModelUrl(display.code) },
})
const crispinsStore = useFurnitureStore({
  inStore: () => currentHouseKey.value === CRISPINS_HARDWARE.key,
  getCamera,
  myPosition,
  store: { interiorLayoutUrl: CRISPINS_HARDWARE.interiorLayoutUrl, modelUrl: (display) => decorModelUrl(display.key) },
})
const candyStore = useFurnitureStore({
  inStore: () => currentHouseKey.value === CANDY_CLOUD.key,
  getCamera,
  myPosition,
  store: { interiorLayoutUrl: CANDY_CLOUD.interiorLayoutUrl, modelUrl: (display) => consumableModelUrl(display.code) },
})
const furnitureStores = [
  { key: COVE_HOME.key, brand: COVE_HOME.name, store: furnitureStore },
  { key: HEARTH_HOLLOW.key, brand: HEARTH_HOLLOW.name, store: hearthStore },
  { key: GREENCART.key, brand: GREENCART.name, store: greencartStore },
  { key: CRISPINS_HARDWARE.key, brand: CRISPINS_HARDWARE.name, store: crispinsStore },
  { key: CANDY_CLOUD.key, brand: CANDY_CLOUD.name, store: candyStore },
]
const activeFurniture = computed(() => furnitureStores.find((s) => s.key === currentHouseKey.value) ?? null)
const storeBrand = computed(() => activeFurniture.value?.brand ?? COVE_HOME.name)
const storeTarget = computed(() => activeFurniture.value?.store.target.value ?? null)
const storeDepartment = computed(() => activeFurniture.value?.store.currentDepartment.value ?? null)
const inThreads = computed(() => currentHouseKey.value === COVE_THREADS.key)
const inNorthline = computed(() => currentHouseKey.value === NORTHLINE.key)
const clothingDeps = {
  getCamera,
  canvasRef,
  myPosition,
  promptsHidden: () => inventoryOpen.value,
  onPurchased: () => refreshOwnedItems(),
  getScene,
  getFpHands: () => game?.fpHands ?? null,
  myOutfit: () => myCosmetics.value,
}
const clothingStore = useClothingStore({ ...clothingDeps, inStore: () => inThreads.value })
const northlineStore = useClothingStore({
  ...clothingDeps,
  inStore: () => inNorthline.value,
  store: { key: NORTHLINE.key, interiorLayoutUrl: NORTHLINE.interiorLayoutUrl, clerkColors: { ...DEFAULT_SLOT_COLORS, top: '#1b1d22', bottom: '#f4f2ee' } },
})
const summitStore = useClothingStore({
  ...clothingDeps,
  inStore: () => currentHouseKey.value === SUMMIT_SPORTS.key,
  store: { key: SUMMIT_SPORTS.key, interiorLayoutUrl: SUMMIT_SPORTS.interiorLayoutUrl, clerkColors: { ...DEFAULT_SLOT_COLORS, top: '#1b1d22', bottom: '#f0b429' } },
})
const clothingEntries = [
  { key: COVE_THREADS.key, name: COVE_THREADS.name, store: clothingStore },
  { key: NORTHLINE.key, name: NORTHLINE.name, store: northlineStore },
  { key: SUMMIT_SPORTS.key, name: SUMMIT_SPORTS.name, store: summitStore },
]
const clothingStores = clothingEntries.map((entry) => entry.store)
const activeClothingEntry = computed(() => clothingEntries.find((entry) => entry.key === currentHouseKey.value) ?? null)
const activeClothing = computed(() => activeClothingEntry.value?.store ?? null)
const clothesTitle = computed(() => activeClothingEntry.value?.name ?? COVE_THREADS.name)
const myCosmetics = shallowRef<CharacterCosmeticsState | null>(null)

function onWardrobeChanged(state: CharacterCosmeticsState): void {
  myCosmetics.value = state
  realtime.sendMyAppearance(state)
}

const wardrobeRef = ref<InstanceType<typeof GameWardrobe> | null>(null)

/** Worn clothes leave the backpack; the piece taken off goes back where the player put it. */
function onOutfit(change: { state: CharacterCosmeticsState; returnedCode: string | null; toSlot: number | null; wornCode: string | null; consumedCursor: boolean }): void {
  onWardrobeChanged(change.state)
  if (change.consumedCursor) releaseCursor()
  if (change.returnedCode && change.toSlot !== null) placeInSlot(change.returnedCode, change.toSlot, change.wornCode)
  refreshOwnedItems()
}
const clothesTarget = computed(() => activeClothing.value?.target.value ?? null)
const clothesBasket = computed(() => activeClothing.value?.basket.value ?? [])
const clothesBasketTotal = computed(() => activeClothing.value?.basketTotal.value ?? 0)
const clothesCheckoutOpen = computed(() => clothingStores.some((s) => s.checkoutOpen.value))
const clothesPaying = computed(() => activeClothing.value?.paying.value ?? false)
const clothesFeedback = computed(() => activeClothing.value?.feedback.value ?? null)
const clothesCounterPrompt = computed(() => activeClothing.value?.counterPrompt.value ?? null)
watch(clothesCheckoutOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
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

// ---------------------------------------------------------------- The Salty Shamrock: seats, bar, games

const canUsePub = () => !survival.knockedOut.value && survival.recovering.value === null

const seats = useSeats({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  canSit: canUsePub,
  teleport: (x, y, z) => {
    Object.assign(myPosition, { x, y, z })
    getCamera()?.position.set(x, y, z)
  },
  setLook: (yaw, pitch) => movement.setLook(yaw, pitch),
})

/** The drink picked up on the bar goes straight in hand. */
function selectHotbarItem(code: string): void {
  pickupToHotbar(code)
  const slot = slots.value.indexOf(code)
  if (slot >= 0 && slot < 9) selectHotbarIndex(slot)
}

const pub = usePub({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  seated: () => seats.seated.value,
  refreshInventory: () => refreshOwnedItems(),
  selectHotbarItem,
  say: (text) => survival.say(text),
  onError: (code) => {
    seats.onPubError()
    return pubChallenge.onError(code)
  },
  nudgeCamera: (dirX, dirZ, strength) => {
    if (!reducedEffects.value) movement.joltCamera(dirX, dirZ, strength)
  },
})
const {
  menuOpen: pubMenuOpen,
  menu: pubMenu,
  loading: pubLoading,
  ordering: pubOrdering,
  feedback: pubFeedback,
  via: pubVia,
  secretOpen: pubSecretOpen,
  secretReply: pubSecretReply,
  secretPending: pubSecretPending,
} = pub

const pubGames = usePubGames({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  mySeat: () => seats.mySeat.value,
  holdingConsumable: () => survival.heldConsumable() !== null,
  pseudoOf: (sessionId) => (sessionId === gameRoomRef.value?.sessionId ? getStoredAuth()?.user.display_name ?? 'You' : realtime.remotePseudo(sessionId) ?? '…'),
  say: (text) => survival.say(text),
  setRacePint: (sessionId, progress) => realtime.setRemoteRacePint(sessionId, progress),
})
const {
  race: pubRace,
  raceOpen: pubRaceOpen,
  racePlayers: pubRacePlayers,
  shots: pubShots,
  darts: pubDarts,
  dartsOpen: pubDartsOpen,
  dartsPlayers: pubDartsPlayers,
  uiOpen: pubGamesOpen,
  board: pubRaceBoard,
} = pubGames

const pubChallenge = usePubChallenge({
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  mySeat: () => seats.mySeat.value,
  seatOf: seats.seatOf,
  busy: () => pubRace.value !== null || pubGamesOpen.value,
  holdingConsumable: () => survival.heldConsumable() !== null,
  pseudoOf: (sessionId) => realtime.remotePseudo(sessionId) ?? '…',
  say: (text) => survival.say(text),
})
const { incoming: pubChallengeIncoming, outgoing: pubChallengeOutgoing } = pubChallenge

function closePubRace(): void {
  pubGames.closeRace()
  pubChallenge.clear()
}
const pubUiOpen = computed(() => pubMenuOpen.value || pubSecretOpen.value || pubGamesOpen.value)
// Back to mouse look once the menu, the bouncer or a game screen closes.
watch(pubUiOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
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
    if (action === 'open' || action === 'close' || action === 'locked') arms?.use('door')
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
    const clothes = clothesTarget.value
    if (clothes) {
      const action = clothes.owned ? 'owned' : clothes.inBasket ? 'in basket' : clothes.coins !== null ? `${clothes.coins} coins` : 'not on sale'
      return { position: clothes.tagPosition, detail: `${clothes.name} · ${action}` }
    }
    const target = storeTarget.value
    if (!target) return null
    const detail = target.coins !== null ? `${target.name} · ${target.coins} coins` : target.name
    return { position: target.tagPosition, detail }
  },
  onStoreTarget: () => (clothesTarget.value ? activeClothing.value?.toggleTarget() : openStorePurchase()),
  sources: [pub.source, pubChallenge.source, pubGames.source, seats.source],
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

// ---------------------------------------------------------------- watch apps: player trades

const trade = useTrade({
  gameRoomRef,
  refreshInventory: () => refreshOwnedItems(),
  onCoins: (balance) => applyCachedBalanceAfterPurchase('coins', balance),
  onClothesChanged: () => {
    for (const store of clothingStores) void store.refreshOwned()
    void fetchCharacterCosmetics().then(onWardrobeChanged).catch(() => {
      /* the look catches up on the next window focus */
    })
  },
  say: (text) => survival.say(text),
})
const {
  menuOpen: watchMenuOpen,
  windowOpen: tradeWindowOpen,
  nearby: tradeNearby,
  incoming: tradeIncoming,
  outgoing: tradeOutgoing,
  state: tradeState,
  offerable: tradeOfferable,
  offerableError: tradeOfferableError,
  draft: tradeDraft,
  error: tradeError,
  syncing: tradeSyncing,
} = trade
const tradeUiOpen = computed(() => watchMenuOpen.value || tradeWindowOpen.value)
// Back to mouse look once the watch and the trade window are closed.
watch(tradeUiOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const watchKey = computed(() => actionKeyLabels('survivalWatch')[0] ?? 'T')

// ---------------------------------------------------------------- survival: hunger, thirst, health

const stamina = ref(MAX_STAMINA)
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
  onBelongingsLost: (clothes) => {
    refreshOwnedItems()
    if (!clothes) return
    for (const store of clothingStores) void store.refreshOwned()
    void fetchCharacterCosmetics().then(onWardrobeChanged).catch(() => {
      /* the look catches up on the next window focus */
    })
  },
  teleport: (x, y, z) => {
    Object.assign(myPosition, { x, y, z })
    getCamera()?.position.set(x, y, z)
  },
  setLook: (yaw, pitch) => movement.setLook(yaw, pitch),
  promptsHidden: () => inventoryOpen.value,
  onStamina: (value) => punch.syncStamina(value),
  onIntoxication: (value) => intoxication.set(value),
  onWatchTap: () => {
    if (pointerLocked.value && !inventoryOpen.value) trade.openMenu()
  },
})
const {
  prompt: survivalPrompt,
  effects: survivalEffects,
  damageFlash,
  knockedOut,
  knockoutCause,
  hospitalBill,
  lostBelongings,
  message: survivalMessage,
  reducedEffects,
  recovering,
} = survival

const intoxication = useIntoxication({ reducedEffects })
const { effects: drunkEffects, canvasFilter: drunkCanvasFilter } = intoxication

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

const clinic = useClinic({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  refreshInventory: () => refreshOwnedItems(),
  health: () => survival.stats.value?.health ?? null,
  say: survival.say,
})
const {
  prompt: clinicPrompt,
  menuOpen: clinicMenuOpen,
  menu: clinicMenu,
  loading: clinicLoading,
  buyingId: clinicBuyingId,
  feedback: clinicFeedback,
} = clinic
watch(clinicMenuOpen, (open) => {
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
  const verb = isMedicalItem(item) ? 'use' : isAlcoholItem(item) ? 'drink' : 'eat'
  return `Click: ${verb} ${item.name}${cook}`
})

const canvasFilter = computed(() => {
  const desaturation = survivalEffects.value?.desaturation ?? 0
  const filters = [desaturation > 0 ? `saturate(${(1 - desaturation).toFixed(2)})` : '', drunkCanvasFilter.value].filter(Boolean)
  return filters.length > 0 ? { filter: filters.join(' ') } : undefined
})

function isBuildingDoorOpen(buildingKey: string): boolean {
  const unit = housing.units.value.find((u) => u.model_key === buildingKey)
  if (unit) return housing.isDoorOpen(unit)
  return findWork(buildingKey) || findStore(buildingKey) ? housing.isWorkDoorOpen(buildingKey) : true
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
    clinic.onTownLoaded(manifest)
    seats.onTownLoaded(manifest)
    pub.onTownLoaded(manifest)
    pubGames.onTownLoaded(manifest)
    houseFurniture.onTownReady()
    for (const { key, store } of furnitureStores) {
      const interior = openHouseInterior(key)
      if (interior) void store.attach(interior)
    }
    for (const { key, store } of clothingEntries) {
      const interior = openHouseInterior(key)
      if (interior) void store.attach(interior)
    }
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

/**
 * The interact action (right click / G by default, like Minecraft's "use"): unlock with the key in hand, doors and
 * shops, the cafe counter, the clinic desk, then what is held in hand (food, fountain sips).
 */
function useAction(): void {
  if (housing.unlock()) arms?.use('key')
  else void (interactions.tryInteract() || clothingStores.some((s) => s.tryOpenCheckout()) || cafe.tryOpen() || clinic.tryInteract() || survival.onPrimaryDown())
}

/** Interact and punch may be bound to keys or mouse buttons; returns true when `code` was one of them. */
function runUseOrPunch(code: string, repeat: boolean): boolean {
  if (matches('punch', code)) {
    if (!repeat) punch.tryPunch()
    return true
  }
  if (matches('interact', code)) {
    if (!repeat) useAction()
    return true
  }
  return false
}

/**
 * Esc frees the mouse and shows the pause menu (the browser does that). A second Esc can't take the
 * pointer back (browsers don't count Escape as a gesture), so it hides the menu and a click resumes.
 */
const pauseDismissed = ref(false)
let unlockedAt = 0
watch(pointerLocked, (locked) => {
  pauseDismissed.value = false
  if (!locked) unlockedAt = performance.now()
})
const pauseMenuOpen = computed(
  () =>
    !pointerLocked.value &&
    !inventoryOpen.value &&
    !switchingRoom.value &&
    !cafeMenuOpen.value &&
    !clinicMenuOpen.value &&
    !clothesCheckoutOpen.value &&
    !tradeUiOpen.value &&
    !pubUiOpen.value &&
    !settingsOpen.value,
)

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  // the watch and the trade window take the keyboard (coins field, Esc): no game key behind them
  if (tradeUiOpen.value) return true
  // the bouncer's text field and the pub games (Space holds the pint) take the keyboard too
  if (pubSecretOpen.value || pubGamesOpen.value) return true
  // Y / N answer a Drink Fast challenge
  if (pubChallenge.onKeyDown(e)) return true
  // seated at the pub: a step or a jump stands the player up instead of moving
  if (seats.onKeyDown(e)) return true
  // some browsers also deliver the Esc that released the lock: ignore it, or the menu would flash away
  // defaultPrevented: the inventory / cafe menu already used this Esc to close themselves
  if (e.code === 'Escape' && !e.repeat && !e.defaultPrevented && pauseMenuOpen.value && !placementPreviewActive.value) {
    if (performance.now() - unlockedAt > 250) pauseDismissed.value = !pauseDismissed.value
    return true
  }
  if (houseKeys.onKeyDown(e)) return true
  if (survival.onKeyDown(e)) return true
  if (runUseOrPunch(e.code, e.repeat)) return true
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
  onToggleInventory: toggleInventory,
  onHotbarDigit: selectHotbarIndex,
  onHotbarScroll: (step) => selectHotbarIndex((selectedHotbarIndex.value + step + 9) % 9),
  handleExtraKeyDown,
  onCanvasMouseDown: (e) => {
    // furniture placement keeps its own clicks (left: pick / place, right: cancel)
    if (placement.onPointerDown(e)) return true
    return pointerLocked.value && runUseOrPunch(mouseButtonCode(e.button), false)
  },
  speedFactor: () => survival.speedFactor() * intoxication.walkFactor(),
  movementLocked: () => seats.seated.value,
  afterCameraPlaced: intoxication.applyToCamera,
  trySpendJump: () => punch.trySpendJump(),
  trySpendSprint: (dt, wasSprinting) => punch.trySpendSprint(dt, wasSprinting),
  onBeforeRender: (dt) => {
    positionLabel.value = formatPosition()
    realtime.tickRemoteAvatars(dt)
    currentHouseKey.value = houseKeyAt(myPosition.x, myPosition.z)
    placement.tick(dt)
    for (const { store } of furnitureStores) store.update()
    for (const store of clothingStores) store.update(dt)
    threadsMusic.update(dt, inThreads.value)
    interactions.updatePrompts()
    houseKeys.updateKeyPrompt()
    updateFrontDoors(dt, isBuildingDoorOpen)
    arms?.update(dt, myPosition)
    const held = heldModel()
    heldItem.update(arms?.rightHand() ?? null, held.url, held.scale)
    survival.tick(dt)
    stamina.value = punch.staminaNow()
    cafe.updatePrompt()
    for (const store of clothingStores) store.updatePrompt()
    clinic.updatePrompt()
    pub.tick(dt)
    pubGames.tick()
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
  knockedOut: computed(() => knockedOut.value || recovering.value !== null),
  reducedEffects,
  shakeCamera: movement.shakeCamera,
  kickCamera: movement.kickCamera,
  freezeCamera: movement.freezeCamera,
  joltCamera: movement.joltCamera,
  knockBack: movement.knockBack,
  playSound: sfx.play,
})
const { hitMarker } = punch

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
  onDoorSound: ({ door, sound }) => {
    const node = frontDoorNode(door)
    if (!node) return
    sfx.playOn(`door_${sound}`, node)
    if (sound === 'rattle') rattleFrontDoor(door)
  },
  onMyOutfit: (models) => arms?.setTop(models.top),
  onPunched: punch.onPunched,
  onPunchTired: punch.onTired,
  playSoundOn: sfx.playOn,
  punchHitTiming: punch.remoteHitTimingFor,
  trade: trade.handlers,
  seats: { seatPose: seats.seatPose, onSeated: seats.onSeated },
  pub: pub.handlers,
  pubGames: pubGames.handlers,
  pubChallenge: pubChallenge.handlers,
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
  myCosmetics.value = cosmetics
  if (unmounted || !canvasRef.value) return
  game = createGameScene(canvasRef.value, movement.containerSize())
  arms = createFirstPersonArms(game.fpHands)
  arms.setTop(wearModelsFromLoadout(cosmetics.slots).top)
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
  threadsMusic.dispose()
  sfx.dispose()
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
  <!-- right click is a game button (use / cancel / clear slot): no browser menu anywhere in the game -->
  <div ref="containerRef" class="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden" @contextmenu.prevent>
    <canvas
      ref="canvasRef"
      class="block min-h-0 w-full flex-1 cursor-crosshair"
      :style="canvasFilter"
      @click="requestPointerLock"
      @mousedown="onCanvasMouseDown"
    />
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-150"
      :class="crosshairClass"
    />
    <GameHitMarker :marker="hitMarker" />
    <GameSurvivalEffects
      :effects="survivalEffects"
      :damage-flash="damageFlash"
      :knocked-out="knockedOut"
      :cause="knockoutCause"
      :hospital-bill="hospitalBill"
      :lost-belongings="lostBelongings"
      :message="survivalMessage"
      :recovering="recovering"
      :reduced-effects="reducedEffects"
    />
    <GameDrunkEffects :effects="drunkEffects" />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameHudToolbar
      :position-label="positionLabel"
      :show-graphics-toggle="!pointerLocked"
      :place-label="activeFurniture?.brand"
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
      v-if="clothesCounterPrompt && !doorPrompt"
      :screen-x="clothesCounterPrompt.x"
      :screen-y="clothesCounterPrompt.y"
      :action-label="clothesCounterPrompt.action"
      :detail-label="clothesCounterPrompt.detail"
    />
    <GameInteractionPrompt
      v-if="cafePrompt && !doorPrompt"
      :screen-x="cafePrompt.x"
      :screen-y="cafePrompt.y"
      :action-label="cafePrompt.action"
      :detail-label="cafePrompt.detail"
    />
    <GameInteractionPrompt
      v-if="clinicPrompt && !doorPrompt"
      :screen-x="clinicPrompt.x"
      :screen-y="clinicPrompt.y"
      :action-label="clinicPrompt.action"
      :detail-label="clinicPrompt.detail"
    />
    <p
      v-if="heldFoodHint && !inventoryOpen"
      class="cc-hud pointer-events-none absolute bottom-[88px] left-1/2 z-20 -translate-x-1/2 px-3 py-1 text-[11px] font-bold text-fog"
    >
      {{ heldFoodHint }}
    </p>
    <GamePlacementHud :visible="placementPreviewActive" :hints="placementHudHints" />
    <div
      v-if="activeFurniture && storeDepartment && !inventoryOpen"
      class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 px-4 py-1.5 font-display text-xs uppercase tracking-[0.2em] text-fog"
    >
      <span class="text-sun">{{ storeBrand }}</span> · {{ storeDepartment }}
    </div>
    <GameStoreItemCard v-if="storeTarget && !inventoryOpen" :target="storeTarget" :feedback="storeFeedback" :brand="storeBrand" />
    <p
      v-else-if="activeFurniture && storeFeedback && !inventoryOpen"
      class="cc-hud pointer-events-none absolute bottom-24 right-3 z-20 max-w-xs px-3 py-2 text-xs font-bold"
      :class="storeFeedback.kind === 'success' ? 'text-mint' : 'text-coral'"
    >
      {{ storeFeedback.text }}
    </p>
    <GameVitals
      v-if="!inventoryOpen"
      :health="survival.stats.value?.health ?? null"
      :heal-until="survival.healUntil.value"
      :stamina="stamina"
      :reduced-effects="reducedEffects"
    />
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
    >
      <GameWardrobe
        ref="wardrobeRef"
        :slots="slots"
        :item-by-code="itemByCode"
        :held-code="cursorItem?.code ?? draggingCode"
        :cursor-from-slot="cursorItem?.fromSlot ?? null"
        @outfit="onOutfit"
      />
    </GamePlayerInventoryPanel>
    <GamePointerLockOverlay
      v-show="pauseMenuOpen && !pauseDismissed"
      @request-pointer-lock="requestPointerLock"
      @open-settings="settingsOpen = true"
      @logout="logout"
    />
    <p
      v-if="pauseMenuOpen && pauseDismissed"
      class="cc-hud pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 px-4 py-2 font-display text-sm uppercase tracking-[0.18em] text-fog"
    >
      Click to play · <span class="text-mist">Esc menu</span>
    </p>
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
    <div
      v-if="activeClothing && !inventoryOpen"
      class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 px-4 py-1.5 font-display text-xs uppercase tracking-[0.2em] text-fog"
    >
      <span class="text-sun">{{ clothesTitle }}</span> · Basket {{ clothesBasket.length }} · {{ clothesBasketTotal }} coins
    </div>
    <p
      v-if="activeClothing && clothesFeedback && !inventoryOpen && !clothesCheckoutOpen"
      class="cc-hud pointer-events-none absolute bottom-24 right-3 z-20 max-w-xs px-3 py-2 text-xs font-bold"
      :class="clothesFeedback.kind === 'success' ? 'text-mint' : 'text-coral'"
    >
      {{ clothesFeedback.text }}
    </p>
    <GameBasketCheckout
      v-if="clothesCheckoutOpen"
      :title="clothesTitle"
      :items="clothesBasket"
      :total="clothesBasketTotal"
      :paying="clothesPaying"
      :feedback="clothesFeedback"
      @pay="activeClothing?.pay()"
      @remove="(item) => activeClothing?.removeFromBasket(item)"
      @close="activeClothing?.closeCheckout()"
    />
    <p
      v-if="tradeIncoming && !watchMenuOpen"
      class="cc-hud pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 animate-cc-pop px-4 py-2 text-sm font-bold text-fog"
      role="status"
    >
      <span class="text-sun">{{ tradeIncoming.fromPseudo }}</span> wants to trade · tap
      <span class="text-sun">{{ watchKey }}</span> to answer
    </p>
    <GameWatchMenu
      v-if="watchMenuOpen"
      :nearby="tradeNearby"
      :incoming="tradeIncoming"
      :outgoing="tradeOutgoing"
      :error="tradeError"
      @request="trade.request"
      @respond="trade.respond"
      @cancel="trade.cancel"
      @close="trade.closeMenu"
    />
    <GameTradeWindow
      v-if="tradeWindowOpen && tradeState"
      :state="tradeState"
      :offerable="tradeOfferable"
      :offerable-error="tradeOfferableError"
      :draft="tradeDraft"
      :syncing="tradeSyncing"
      :error="tradeError"
      @coins="trade.setCoins"
      @item="trade.setItem"
      @confirm="trade.confirm"
      @cancel="trade.cancel"
    />
    <GameCafeMenu
      v-if="cafeMenuOpen"
      title="Campus Cafe"
      :items="cafeMenu"
      :loading="cafeLoading"
      :buying-id="cafeBuyingId"
      :feedback="cafeFeedback"
      @buy="cafe.buy"
      @close="cafe.close"
    />
    <GameCafeMenu
      v-if="clinicMenuOpen"
      title="Cove Clinic"
      :items="clinicMenu"
      :loading="clinicLoading"
      :buying-id="clinicBuyingId"
      :feedback="clinicFeedback"
      @buy="clinic.buy"
      @close="clinic.close"
    />
    <GamePubMenu
      v-if="pubMenuOpen"
      :items="pubMenu"
      :loading="pubLoading"
      :ordering="pubOrdering"
      :feedback="pubFeedback"
      :via="pubVia"
      @order="pub.order"
      @close="pub.close"
    />
    <GamePubSecretDialog
      v-if="pubSecretOpen"
      :greeting="pub.bouncerGreeting"
      :reply="pubSecretReply"
      :pending="pubSecretPending"
      @whisper="pub.whisper"
      @close="pub.closeSecret"
    />
    <GameDrinkFast
      v-if="pubRaceOpen && pubRace"
      :seed="pubRace.seed"
      :players="pubRacePlayers"
      :starts-at="pubRace.startsAt"
      :finished="pubRace.finished"
      :results="pubRace.results"
      :reduced-effects="reducedEffects"
      @progress="pubGames.sendRaceProgress"
      @close="closePubRace"
    />
    <GamePubRaceBoard v-if="pubRaceBoard" :board="pubRaceBoard" />
    <GamePubChallenge
      v-if="!pubGamesOpen"
      :incoming="pubChallengeIncoming"
      :outgoing="pubChallengeOutgoing"
      @accept="pubChallenge.accept"
      @decline="pubChallenge.decline"
    />
    <GameMeterShot
      v-if="pubShots"
      :seed="pubShots.seed"
      :started-at="pubShots.startedAt"
      :result="pubShots.result"
      @done="pubGames.sendShotsDone"
      @close="pubGames.closeShots"
    />
    <GameDarts
      v-if="pubDartsOpen && pubDarts"
      :players="pubDartsPlayers"
      :turn="pubDarts.turn"
      :my-session-id="gameRoomRef?.sessionId ?? ''"
      :throws-left="pubDarts.throwsLeft"
      :turn-ends-at="pubDarts.turnEndsAt"
      :intoxication="intoxication.value.value"
      :ranking="pubDarts.ranking"
      @throw="pubGames.sendThrow"
      @close="pubGames.closeDarts"
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
