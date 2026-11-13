<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowReactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type { Room } from '@colyseus/sdk'
import {
  wearModelsFromLoadout,
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  type CharacterCosmeticsState,
} from '../api/characterCosmetics'
import { fetchHousingUnits } from '../api/housing'
import { applyCachedBalanceAfterPurchase, clearAuth, getStoredAuth } from '../api/session'
import { refreshCashAndBank } from '../api/bank'
import { useWalletBalances } from '../composables/useWalletBalances'
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
import GameZoneBuyerMenu from '../components/game/GameZoneBuyerMenu.vue'
import GameAtmScreen from '../components/game/GameAtmScreen.vue'
import GamePubMenu from '../components/game/GamePubMenu.vue'
import GamePubSecretDialog from '../components/game/GamePubSecretDialog.vue'
import GameChat from '../components/game/GameChat.vue'
import GameDrunkEffects from '../components/game/GameDrunkEffects.vue'
import GameDrinkFast from '../components/game/GameDrinkFast.vue'
import GamePubChallenge from '../components/game/GamePubChallenge.vue'
import GamePubRaceBoard from '../components/game/GamePubRaceBoard.vue'
import GameMeterShot from '../components/game/GameMeterShot.vue'
import GameMinimap from '../components/game/GameMinimap.vue'
import GameDarts from '../components/game/GameDarts.vue'
import GameBasketCheckout from '../components/game/GameBasketCheckout.vue'
import GameCharacterCreator from '../components/game/GameCharacterCreator.vue'
import GameWardrobe from '../components/game/GameWardrobe.vue'
import GameSurvivalEffects from '../components/game/GameSurvivalEffects.vue'
import GameTradeWindow from '../components/game/GameTradeWindow.vue'
import GameWatchMenu from '../components/game/GameWatchMenu.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useClinic } from '../composables/game/useClinic'
import { useHouseFurniture } from '../composables/game/useHouseFurniture'
import { useHouseKeys } from '../composables/game/useHouseKeys'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useCityHousing } from '../composables/game/useCityHousing'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { useInteractionTargets } from '../composables/game/useInteractionTargets'
import { useIntoxication } from '../composables/game/useIntoxication'
import { useMinimap } from '../composables/game/useMinimap'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import { useOrchard } from '../composables/game/useOrchard'
import { useZoneBuyers } from '../composables/game/useZoneBuyers'
import { useAtm } from '../composables/game/useAtm'
import { useCashBags } from '../composables/game/useCashBags'
import { useProximityVoice } from '../composables/game/useProximityVoice'
import { mutedAccounts, playerVolumes, setPlayerVolume, toggleMuteAccount } from '../composables/game/useVoiceSettings'
import GamePlayerList from '../components/game/GamePlayerList.vue'
import { useFarm } from '../composables/game/useFarm'
import { useMallCellTemplates, type CellStoreEntry } from '../composables/game/useMallCellTemplates'
import { useZoneDecor } from '../composables/game/useZoneDecor'
import { usePub } from '../composables/game/usePub'
import { usePubChallenge } from '../composables/game/usePubChallenge'
import { usePubGames } from '../composables/game/usePubGames'
import { useRenderStats } from '../composables/game/useRenderStats'
import { useRoomEnvironment } from '../composables/game/useRoomEnvironment'
import { useSeats } from '../composables/game/useSeats'
import { useSurvival } from '../composables/game/useSurvival'
import { useTrade } from '../composables/game/useTrade'
import { useAdminWatch } from '../composables/game/useAdminWatch'
import { useWatchBank } from '../composables/game/useWatchBank'
import { useGps } from '../composables/game/useGps'
import { useWatchContacts } from '../composables/game/useWatchContacts'
import { usePunch } from '../composables/game/usePunch'
import { useShopPurchase } from '../composables/useShopPurchase'
import { toggleCollisionDebug } from '../game/collision/collisionDebug'
import { toggleTerrainDebug } from '../game/town/terrainDebug'
import { actionKeyLabels, matches, mouseButtonCode } from '../config/keybindings'
import { fetchCharacterAppearance } from '../api/characterAppearance'
import { NEWCOMER_OUTFIT, type CreatorChoice } from '../avatar/characterLook'
import { getWorldCollisionStats } from '../game/collision/worldCollision'
import { HOUSING_LOBBY_SPAWN } from '../game/gameRoomConstants'
import { LOCK_RETRY_MS, isLockReleaseEscape } from '../game/pauseMenu'
import { createGameScene, disposeGameScene, renderGameFrame, resizeViewmodel, type GameScene } from '../game/gameScene'
import { createFirstPersonArms } from '../game/firstPersonArms'
import { createHeldItem } from '../game/heldItem'
import { COVE_HOME, COVE_THREADS, findHouse, findStore, findWork } from '../game/assets/catalog'
import type { WorldBounds } from '../game/world/worldManifest'
import type { GearSlot } from '../game/wardrobeSlots'
import { createSfx } from '../game/sfx'
import { createAmbientLoop } from '../game/ambientLoop'
import { MAX_STAMINA } from '../game/stamina'
import { createDoorSigns } from '../game/town/doorSigns'
import { frontDoorNode, houseKeyAt, openHouseInterior, rattleFrontDoor, updateFrontDoors } from '../game/town/openHouses'
import { loadTownEnvironment } from '../game/roomEnvironments'
import { useBootProgress } from '../composables/game/useBootProgress'
import GameLoadingScreen from '../components/game/GameLoadingScreen.vue'
import { isAlcoholItem, isMedicalItem } from '../utils/itemShopPresentation'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

// ---------------------------------------------------------------- shared game state

const gameRoomRef = shallowRef<Room | null>(null)
const roomMessage = ref<string | null>(null)
const boot = useBootProgress()
/** Stays up a moment after the boot so the screen shows 100 % and every stage ticked before it fades out. */
const loadingShown = ref(true)
const LOADING_HOLD_MS = 350
watch(boot.done, (done) => {
  if (done) setTimeout(() => (loadingShown.value = false), LOADING_HOLD_MS)
})
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
/** The mall walkways' music (world manifest zone `music`), started once the town is loaded. */
let zoneMusic: ReturnType<typeof createAmbientLoop> | null = null
let zoneMusicBounds: WorldBounds | null = null
let zoneMusicKey: string | null = null

function insideBounds(bounds: WorldBounds | null, at: { x: number; z: number }): boolean {
  return bounds !== null && at.x >= bounds.minX && at.x <= bounds.maxX && at.z >= bounds.minZ && at.z <= bounds.maxZ
}
const getRenderer = () => game?.renderer
const renderStats = useRenderStats(getRenderer)

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

// ---------------------------------------------------------------- stores: Cove Home (click to buy), the mall's shops (basket paid at the cashier), Cove Threads, Northline and Summit (basket)

/** The mall stores sell through a basket: the cashier prompt needs the canvas, paying refreshes the inventory. */
const mallStoreDeps = {
  getCamera,
  myPosition,
  canvasRef,
  promptsHidden: () => inventoryOpen.value,
  onPurchased: () => refreshOwnedItems(),
}
const furnitureStores = shallowReactive<CellStoreEntry[]>([])
const mallCellTemplates = useMallCellTemplates({ getScene, storeDeps: mallStoreDeps, addStore: (entry) => furnitureStores.push(entry) })
const zoneDecor = useZoneDecor({
  getScene,
  storeDeps: mallStoreDeps,
  addStore: (entry) => furnitureStores.push(entry),
  insideOtherStore: () => mallCellTemplates.currentStoreKey.value !== null,
  getGameRoom: () => gameRoomRef.value,
  onStaff: (role, npc) => {
    if (role === 'bartender' || role === 'bouncer') pub.onStaff(role, npc)
  },
})
const activeFurniture = computed(() => {
  const keys = [mallCellTemplates.currentStoreKey.value, zoneDecor.currentStoreKey.value]
  return keys.map((key) => furnitureStores.find((s) => s.key === key)).find((store) => store !== undefined) ?? null
})
const storeBrand = computed(() => activeFurniture.value?.brand ?? COVE_HOME.name)
const storeTarget = computed(() => activeFurniture.value?.store.target.value ?? null)
const storeDepartment = computed(() => activeFurniture.value?.store.currentDepartment.value ?? null)
const inThreads = computed(() => currentHouseKey.value === COVE_THREADS.key)
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
/** The store whose basket the HUD shows: a clothing store, or a mall store that pays at its counter. */
const basketStore = computed(() => (activeFurniture.value?.store.hasCounter.value ? activeFurniture.value.store : null))
const basketTitle = computed(() => activeFurniture.value?.brand ?? '')
const basketItems = computed(() => basketStore.value?.basket.value ?? [])
const basketTotal = computed(() => basketStore.value?.basketTotal.value ?? 0)
const checkoutOpen = computed(() => furnitureStores.some((s) => s.store.checkoutOpen.value))
const basketPaying = computed(() => basketStore.value?.paying.value ?? false)
const basketFeedback = computed(() => basketStore.value?.feedback.value ?? null)
const counterPrompt = computed(() => basketStore.value?.counterPrompt.value ?? null)
watch(checkoutOpen, (open) => {
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

const orchard = useOrchard({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  getArms: () => arms,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  refreshInventory: () => refreshOwnedItems(),
  say: (text) => survival.say(text),
})
const { pickProgress: orchardPickProgress } = orchard
const zoneBuyers = useZoneBuyers({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  itemByCode: () => itemByCode.value,
  refreshInventory: () => refreshOwnedItems(),
  buyers: () => zoneDecor.buyers.value,
})
const { openBuyer: zoneBuyerOpen, selling: zoneBuyerSelling, feedback: zoneBuyerFeedback } = zoneBuyers
const atm = useAtm({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  atms: () => zoneDecor.atms.value,
  promptLabel: () => t('atm.prompt'),
  timeoutMessage: () => t('atm.timeout'),
})
const { open: atmOpen } = atm
const cashBags = useCashBags({
  myPosition,
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  promptLabel: () => t('cashBag.prompt'),
  say: (text) => survival.say(text),
  pickedMessage: (amount) => t('cashBag.picked', { amount }),
})
watch(atmOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const farm = useFarm({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  refreshInventory: () => refreshOwnedItems(),
  say: (text) => survival.say(text),
})
const pickBar = computed(() => {
  if (orchardPickProgress.value !== null) return { progress: orchardPickProgress.value, label: 'Picking an apple…' }
  if (farm.pickProgress.value !== null) return { progress: farm.pickProgress.value, label: farm.pickLabel.value }
  return null
})
watch(zoneBuyerOpen, (buyer) => {
  if (!buyer && !document.pointerLockElement) requestPointerLock()
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
    const target = storeTarget.value
    if (!target) return null
    const price = target.coins !== null ? `${target.name} · ${target.coins} coins` : target.name
    if (!activeFurniture.value?.store.hasCounter.value) return { position: target.tagPosition, detail: price }
    if (target.owned) return { position: target.tagPosition, detail: `${target.name} · already in your wardrobe` }
    const look = target.display.figure ? ' · Shift: whole look' : ''
    return { position: target.tagPosition, detail: `${target.inBasket ? `${price} · in basket` : price}${look}`, action: target.inBasket ? 'Remove' : 'Add' }
  },
  onStoreTarget: () => {
    if (activeFurniture.value?.store.hasCounter.value) activeFurniture.value.store.toggleTarget(useWithShift)
    else openStorePurchase()
  },
  sources: [pub.source, pubChallenge.source, pubGames.source, seats.source, orchard.source, farm.source, zoneBuyers.source, atm.source, cashBags.source],
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
  onCoins: (balance) => applyCachedBalanceAfterPurchase('cash', balance),
  onClothesChanged: () => {
    for (const { store } of furnitureStores) void store.refreshOwned()
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
watch(tradeWindowOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const watchKey = computed(() => actionKeyLabels('survivalWatch')[0] ?? 'T')

// ---------------------------------------------------------------- watch apps: admin teleports

const watchBank = useWatchBank()
const adminWatch = useAdminWatch({ gameRoomRef, say: (text) => survival.say(text) })
const { isAdmin, menu: adminMenu, error: adminError } = adminWatch
function adminTeleport(key: string): void {
  adminWatch.teleport(key)
  trade.closeMenu()
}
function adminSummon(sessionId: string): void {
  adminWatch.summon(sessionId)
  adminWatch.load()
}

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
  onCashLost: (amount) => {
    applyCachedBalanceAfterPurchase('cash', 0)
    survival.say(t('cashBag.dropped', { amount }))
  },
  onBelongingsLost: (clothes) => {
    refreshOwnedItems()
    if (clothes) for (const { store } of furnitureStores) void store.refreshOwned()
    // waking up at the clinic always puts the newcomer outfit back on: show it to everyone
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
    if (watchMenuOpen.value) trade.closeMenu()
    else if (pointerLocked.value && !inventoryOpen.value) trade.openMenu()
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

const clinic = useClinic({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  health: () => survival.stats.value?.health ?? null,
  say: survival.say,
})
const { prompt: clinicPrompt } = clinic

/** Key settings opened from the pause screen. */
const settingsOpen = ref(false)

// ---------------------------------------------------------------- character creator / editor (docs/CHARACTER.md)

/** Open creator: 'create' before the first spawn (the boot waits for it), 'edit' from the character key. */
const creator = shallowRef<{ mode: 'create' | 'edit'; initial: CreatorChoice | null } | null>(null)
const creatorKey = computed(() => actionKeyLabels('characterEditor')[0] ?? 'P')
const creatorOutfit = computed(() =>
  creator.value?.mode === 'edit' && myCosmetics.value
    ? wearModelsFromLoadout(myCosmetics.value.slots)
    : { hair: null, head_accessory: null, ...NEWCOMER_OUTFIT },
)
let onCharacterCreated: ((state: CharacterCosmeticsState) => void) | null = null

function waitForCharacter(): Promise<CharacterCosmeticsState> {
  creator.value = { mode: 'create', initial: null }
  return new Promise((resolve) => {
    onCharacterCreated = resolve
  })
}

async function openCharacterEditor(): Promise<void> {
  if (creator.value) return
  if (document.pointerLockElement) document.exitPointerLock()
  try {
    creator.value = { mode: 'edit', initial: (await fetchCharacterAppearance()).choice }
  } catch {
    survival.say('Could not open your character. Try again.')
  }
}

function onCharacterSaved(state: CharacterCosmeticsState): void {
  const created = onCharacterCreated
  onCharacterCreated = null
  creator.value = null
  if (created) {
    created(state)
    return
  }
  onWardrobeChanged(state)
  for (const { store } of furnitureStores) void store.refreshOwned()
  requestPointerLock()
}

function closeCharacterEditor(): void {
  if (creator.value?.mode !== 'edit') return
  creator.value = null
  requestPointerLock()
}

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

const minimap = useMinimap({
  getRenderer,
  getScene,
  getCamera,
  myPosition,
  homeKey: () => {
    const me = myAccountId.value
    return me === null ? null : (housing.units.value.find((u) => u.occupant_account_id === me)?.model_key ?? null)
  },
  buildingKey: () => currentHouseKey.value,
})
const mapKey = computed(() => actionKeyLabels('map')[0] ?? 'M')
const gps = useGps({
  markers: () => minimap.markers.value,
  atms: () => zoneDecor.atms.value,
  player: minimap.player,
  atmName: () => t('watch.gps.atm'),
  say: (text) => survival.say(text),
  arrivedText: (name) => t('watch.gps.arrived', { name }),
  noAtmText: () => t('watch.gps.noAtm'),
  positionOf: (sessionId) => realtime.remotePosition(sessionId),
  leftText: (name) => t('watch.gps.left', { name }),
})
const watchContacts = useWatchContacts({
  players: () => realtime.remotePlayers(),
  positionOf: (sessionId) => realtime.remotePosition(sessionId),
  me: minimap.player,
  isOpen: () => watchMenuOpen.value,
  say: (text) => survival.say(text),
  acceptedText: (name) => t('watch.contacts.accepted', { name }),
  askedText: (pseudo) => t('watch.contacts.sent', { name: pseudo }),
})
const followedSessionId = computed(() => (gps.target.value?.kind === 'friend' ? gps.target.value.id.slice('friend:'.length) : null))
// Esc frees the mouse and opens the pause menu: the full map gives way to it
watch(pointerLocked, (locked) => {
  if (!locked) minimap.fullOpen.value = false
  if (!locked) trade.closeMenu()
})

const environment = useRoomEnvironment({
  getScene,
  getRenderer,
  onTownLoaded: (manifest) => {
    interactions.setWorldManifest(manifest)
    const musicZone = manifest.zones.find((zone) => zone.music)
    if (musicZone?.music && !zoneMusic) {
      zoneMusic = createAmbientLoop(musicZone.music.url, 0.14, sfx.listener)
      zoneMusicBounds = musicZone.music.bounds
      zoneMusicKey = musicZone.key
    }
    survival.onTownLoaded(manifest)
    clinic.onTownLoaded(manifest)
    seats.onTownLoaded(manifest)
    pub.onTownLoaded(manifest)
    pubGames.onTownLoaded(manifest)
    orchard.onTownLoaded(manifest)
    farm.onTownLoaded(manifest)
    void Promise.all([
      mallCellTemplates.onTownLoaded(manifest).catch((error: unknown) => console.error('[mall] cell templates failed to load', error)),
      zoneDecor.onTownLoaded(manifest).catch((error: unknown) => console.error('[zones] zone decor failed to load', error)),
    ]).then(() => boot.complete('decor'))
    minimap.onTownLoaded(manifest)
    houseFurniture.onTownReady()
  },
  onTownShown: (group) => {
    if (boot.done.value) return
    // Compile the town's shaders behind the loading screen instead of stalling the first frames.
    const renderer = getRenderer()
    const camera = getCamera()
    const compiled = renderer && camera ? renderer.compileAsync(group, camera, getScene()) : Promise.resolve()
    void compiled.catch((error: unknown) => console.warn('[boot] shader warm-up failed', error)).then(() => boot.complete('world'))
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
 * shops, the clinic nurse, then what is held in hand (food, fountain sips).
 */
function useAction(code: string): void {
  if (housing.unlock()) arms?.use('key')
  else
    void (
      interactions.tryInteract() ||
      furnitureStores.some((s) => s.store.tryOpenCheckout()) ||
      clinic.tryInteract() ||
      survival.onPrimaryDown(code)
    )
}

/** Interact and punch may be bound to keys or mouse buttons; returns true when `code` was one of them. */
let useWithShift = false

function runUseOrPunch(code: string, repeat: boolean, shift: boolean): boolean {
  if (matches('punch', code)) {
    if (!repeat && !survival.startEating(code)) punch.tryPunch()
    return true
  }
  if (matches('interact', code)) {
    useWithShift = shift
    if (!repeat) useAction(code)
    return true
  }
  return false
}

/**
 * Esc frees the mouse and shows the pause menu (the browser does that). Esc again closes it and the game
 * goes on: the lock is asked right away, but browsers don't count Escape as a gesture (and refuse a lock
 * for ~1 s after an Esc), so the player stands still until a click or a key gets it back.
 * See game/pauseMenu.ts.
 */
const pauseDismissed = ref(false)
let unlockedAt = 0
let lastLockRetry = 0
watch(pointerLocked, (locked) => {
  pauseDismissed.value = false
  if (!locked) unlockedAt = performance.now()
})

function retryPointerLock(): void {
  const now = performance.now()
  if (now - lastLockRetry < LOCK_RETRY_MS) return
  lastLockRetry = now
  requestPointerLock()
}

function toggleEscapeMenu(e: KeyboardEvent): void {
  if (isLockReleaseEscape(e.timeStamp || performance.now(), unlockedAt)) return
  pauseDismissed.value = !pauseDismissed.value
  // usually refused (no gesture), harmless; the next click / key in the game asks again
  if (pauseDismissed.value) {
    lastLockRetry = 0
    requestPointerLock()
  }
}
const pauseMenuOpen = computed(
  () =>
    !pointerLocked.value &&
    !inventoryOpen.value &&
    !switchingRoom.value &&
    !checkoutOpen.value &&
    !tradeWindowOpen.value &&
    !pubUiOpen.value &&
    !zoneBuyerOpen.value &&
    !atmOpen.value &&
    !playerListOpen.value &&
    !settingsOpen.value &&
    !creator.value,
)
/** Back in the game with the menu closed, but the browser hasn't given the pointer back yet. */
const resumedWithoutLock = computed(() => pauseMenuOpen.value && pauseDismissed.value)

const { t } = useI18n()
const walletBalances = useWalletBalances()

watch(inventoryOpen, (open) => {
  if (open) refreshCashAndBank().catch((err) => console.error('[bank] could not load cash and bank', err))
})

const chatOpen = ref(false)
const playerListOpen = ref(false)
watch(mutedAccounts, (accounts) => gameRoomRef.value?.send('voice_mute', { accounts: [...accounts] }))
watch(playerListOpen, (open) => {
  if (open && document.pointerLockElement) document.exitPointerLock()
  if (!open && !document.pointerLockElement) requestPointerLock()
})

function sendChat(text: string): void {
  gameRoomRef.value?.send('chat', { text })
}

const WALK_WITH_WATCH_ACTIONS = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'survivalWatch'] as const

function isWalkWithWatchKey(code: string): boolean {
  return code === 'ShiftLeft' || code === 'ShiftRight' || WALK_WITH_WATCH_ACTIONS.some((action) => matches(action, code))
}

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (chatOpen.value || atmOpen.value || playerListOpen.value) return true
  // the character screen owns the keyboard (Esc closes the editor)
  if (creator.value) return true
  // the trade window takes the keyboard (coins field, Esc): no game key behind it
  if (tradeWindowOpen.value) return true
  if (watchMenuOpen.value && !isWalkWithWatchKey(e.code)) return true
  // the bouncer's text field and the pub games (Space holds the pint) take the keyboard too
  if (pubSecretOpen.value || pubGamesOpen.value) return true
  // Y / N answer a Drink Fast challenge
  if (pubChallenge.onKeyDown(e)) return true
  // seated at the pub: a step or a jump stands the player up instead of moving
  if (seats.onKeyDown(e)) return true
  // defaultPrevented: the inventory / cafe menu already used this Esc to close themselves
  if (e.code === 'Escape' && !e.repeat && !e.defaultPrevented && pauseMenuOpen.value && !placementPreviewActive.value) {
    toggleEscapeMenu(e)
    return true
  }
  // a key is a gesture: take the pointer back (the player only moves once the lock is back)
  if (resumedWithoutLock.value) retryPointerLock()
  if (minimap.onKeyDown(e)) return true
  if (houseKeys.onKeyDown(e)) return true
  if (survival.onKeyDown(e)) return true
  if (runUseOrPunch(e.code, e.repeat, e.shiftKey)) return true
  if (matches('characterEditor', e.code) && !e.repeat) {
    void openCharacterEditor()
    return true
  }
  if (matches('playerList', e.code) && !e.repeat) {
    e.preventDefault()
    playerListOpen.value = true
    return true
  }
  if (matches('chat', e.code) && !e.repeat) {
    e.preventDefault()
    chatOpen.value = true
    return true
  }
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
  // walk-height overlay, same rule: dev only
  if (import.meta.env.DEV && e.code === 'KeyH' && !e.repeat) {
    const scene = getScene()
    if (!scene) return true
    const zones = toggleTerrainDebug(scene)
    console.info(`[terrain] heights ${zones ? `ON — ${zones.join(', ') || 'no heightmap loaded'}` : 'OFF'}`)
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
  renderFrame: () => {
    if (game) renderGameFrame(game)
  },
  resizeViewmodel: (w, h) => {
    if (game) resizeViewmodel(game, w, h)
  },
  refreshMyAppearance,
  updateProximity: interactions.updateProximity,
  onToggleInventory: toggleInventory,
  onHotbarDigit: selectHotbarIndex,
  onHotbarScroll: (step) => selectHotbarIndex((selectedHotbarIndex.value + step + 9) % 9),
  handleExtraKeyDown,
  onCanvasMouseDown: (e) => {
    // furniture placement keeps its own clicks (left: pick / place, right: cancel)
    if (placement.onPointerDown(e)) return true
    return pointerLocked.value && runUseOrPunch(mouseButtonCode(e.button), false, e.shiftKey)
  },
  speedFactor: () => survival.speedFactor() * intoxication.walkFactor(),
  movementLocked: () => seats.seated.value,
  afterCameraPlaced: intoxication.applyToCamera,
  trySpendJump: () => punch.trySpendJump(),
  trySpendSprint: (dt, wasSprinting) => punch.trySpendSprint(dt, wasSprinting),
  onBeforeRender: (dt) => {
    if (import.meta.env.DEV) renderStats.tick(dt)
    positionLabel.value = formatPosition()
    realtime.tickRemoteAvatars(dt)
    currentHouseKey.value = houseKeyAt(myPosition.x, myPosition.z)
    placement.tick(dt)
    mallCellTemplates.tick(dt, myPosition)
    zoneDecor.tick(dt, myPosition)
    cashBags.tick(dt)
    voice.tick()
    for (const { store } of furnitureStores) store.update(dt)
    threadsMusic.update(dt, inThreads.value)
    zoneMusic?.update(dt, (currentHouseKey.value === null || currentHouseKey.value === zoneMusicKey) && insideBounds(zoneMusicBounds, myPosition))
    interactions.updatePrompts()
    houseKeys.updateKeyPrompt()
    updateFrontDoors(dt, isBuildingDoorOpen)
    arms?.update(dt, myPosition)
    const held = heldModel()
    heldItem.update(arms?.rightHand() ?? null, held.url, held.scale)
    survival.tick(dt)
    stamina.value = punch.staminaNow()
    for (const { store } of furnitureStores) store.updatePrompt()
    clinic.updatePrompt()
    pub.tick(dt)
    pubGames.tick()
    orchard.tick()
    farm.tick()
    if (!doorSigns.group.parent) getScene()?.add(doorSigns.group)
    minimap.tick()
    gps.tick()
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

const voice = useProximityVoice({
  myPosition,
  getCamera,
  remotePosition: (sessionId) => realtime.remotePosition(sessionId),
  isMuted: (sessionId) => {
    const account = realtime.remoteAccount(sessionId)
    return account !== null && mutedAccounts.value.includes(account)
  },
  playerVolume: (sessionId) => {
    const account = realtime.remoteAccount(sessionId)
    return account === null ? 1 : playerVolumes.value[account] ?? 1
  },
  setVoiceState: (sessionId, state) => realtime.setRemoteVoiceState(sessionId, state),
  sendMuted: () => gameRoomRef.value?.send('voice_mute', { accounts: [...mutedAccounts.value] }),
  canTalk: () => pointerLocked.value && !chatOpen.value && !atmOpen.value,
  say: (text) => survival.say(text),
  micDeniedMessage: () => t('voice.micDenied'),
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
  admin: adminWatch.handlers,
  onTeleported: ({ x, y, z, ry }) => {
    Object.assign(myPosition, { x, y, z })
    getCamera()?.position.set(x, y, z)
    movement.setLook(ry, 0)
  },
  seats: { seatPose: seats.seatPose, onSeated: seats.onSeated },
  pub: pub.handlers,
  pubGames: pubGames.handlers,
  orchard: orchard.handlers,
  zoneBuyers: zoneBuyers.handlers,
  atm: atm.handlers,
  cashBags: cashBags.handlers,
  voice: { onToken: voice.onToken, disconnect: voice.disconnect },
  farm: farm.handlers,
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

/** null when the API could not be reached: the game still starts, with the default look and no creator. */
async function loadCosmeticsState(): Promise<CharacterCosmeticsState | null> {
  try {
    return await fetchCharacterCosmetics()
  } catch {
    return null
  }
}

let unmounted = false

async function bootGame() {
  if (!getStoredAuth()) {
    void router.push({ name: 'landing' })
    return
  }
  // The world downloads while the character loads (or is being created): loadTownEnvironment caches the one load for
  // loadTown below.
  loadTownEnvironment().catch(() => undefined)
  const loaded = await loadCosmeticsState()
  // first time in the game: build the character before spawning
  const cosmetics = loaded && loaded.character === null && !unmounted ? await waitForCharacter() : loaded
  const state = cosmetics ?? { slots: emptyCosmeticLoadout(), colors: defaultCosmeticColors(), character: null }
  boot.complete('character')
  myCosmetics.value = state
  if (unmounted || !canvasRef.value) return
  game = createGameScene(canvasRef.value, movement.containerSize())
  arms = createFirstPersonArms(game.fpHands)
  arms.setTop(wearModelsFromLoadout(state.slots).top)
  loadTown()
  await realtime.connectRealtime(state)
  try {
    housing.applyUnits((await fetchHousingUnits()).units)
  } catch {
    /* the realtime init / housing_units_sync also deliver the units */
  }
  await loadLayoutFromServer()
  refreshOwnedItems()
  boot.complete('server')
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
  zoneMusic?.dispose()
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
    <!-- an error during boot drops the loading screen so its banner is seen; the character creator shows over the load -->
    <Transition leave-active-class="transition-opacity duration-500" leave-to-class="opacity-0">
      <GameLoadingScreen
        v-if="loadingShown && !roomMessage && !creator"
        :percent="boot.percent.value"
        :stages="boot.stages.value"
        :files="boot.files.value"
      />
    </Transition>
    <GameMinimap
      :image="minimap.image.value"
      :markers="minimap.markers.value"
      :player="minimap.player"
      :inside-name="minimap.insideName.value"
      :full-open="minimap.fullOpen.value"
      :map-key="mapKey"
      :target="gps.target.value"
      @close="minimap.fullOpen.value = false"
    />
    <GameHudToolbar
      :position-label="positionLabel"
      :render-stats="renderStats.label.value"
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
      v-if="counterPrompt && !doorPrompt"
      :screen-x="counterPrompt.x"
      :screen-y="counterPrompt.y"
      :action-label="counterPrompt.action"
      :detail-label="counterPrompt.detail"
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
    <GameStoreItemCard
      v-if="storeTarget && !inventoryOpen"
      :target="storeTarget"
      :feedback="storeFeedback"
      :brand="storeBrand"
      :basket="activeFurniture?.store.hasCounter.value"
    />
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
      :cash="walletBalances.cash"
      :bank="walletBalances.coins"
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
    <!-- the game goes on: only a quiet hint while the browser hasn't given the mouse back yet -->
    <p
      v-if="resumedWithoutLock"
      class="cc-hud pointer-events-none absolute left-1/2 top-[calc(50%+28px)] z-20 -translate-x-1/2 px-3 py-1 text-[11px] font-bold text-fog"
    >
      Click to look around
    </p>
    <GameSettingsDialog v-if="settingsOpen" @close="settingsOpen = false" />
    <GameCharacterCreator
      v-if="creator"
      :mode="creator.mode"
      :initial="creator.initial"
      :outfit="creatorOutfit"
      :colors="myCosmetics?.colors ?? defaultCosmeticColors()"
      :key-label="creatorKey"
      @saved="onCharacterSaved"
      @close="closeCharacterEditor"
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
      {{ placementHelp }}
    </p>
    <div
      v-if="basketStore && !inventoryOpen"
      class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 px-4 py-1.5 font-display text-xs uppercase tracking-[0.2em] text-fog"
    >
      <span class="text-sun">{{ basketTitle }}</span> · Basket {{ basketItems.length }} · {{ basketTotal }} coins
    </div>
    <p
      v-if="basketStore && basketFeedback && !inventoryOpen && !checkoutOpen && !storeTarget"
      class="cc-hud pointer-events-none absolute bottom-24 right-3 z-20 max-w-xs px-3 py-2 text-xs font-bold"
      :class="basketFeedback.kind === 'success' ? 'text-mint' : 'text-coral'"
    >
      {{ basketFeedback.text }}
    </p>
    <GameBasketCheckout
      v-if="checkoutOpen"
      :title="basketTitle"
      :items="basketItems"
      :total="basketTotal"
      :paying="basketPaying"
      :feedback="basketFeedback"
      @pay="basketStore?.pay()"
      @remove="(item) => basketStore?.removeFromBasket(item)"
      @close="basketStore?.closeCheckout()"
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
      :is-admin="isAdmin"
      :admin-menu="adminMenu"
      :admin-error="adminError"
      :cash="walletBalances.cash"
      :bank-screen="watchBank.screen.value"
      :bank-error="watchBank.error.value"
      :gps-places="gps.places.value"
      :gps-target-id="gps.target.value?.id ?? null"
      :atm-distance="gps.places.value.find((place) => place.kind === 'atm')?.distance ?? null"
      :contact-rows="watchContacts.rows.value"
      :contacts-error="watchContacts.error.value"
      :followed-session-id="followedSessionId"
      @request="trade.request"
      @respond="trade.respond"
      @cancel="trade.cancel"
      @close="trade.closeMenu"
      @admin-open="adminWatch.load"
      @bank-open="watchBank.load"
      @gps-toggle="gps.toggle"
      @route-atm="gps.routeToNearestAtm"
      @contacts-open="watchContacts.load"
      @contact-accept="watchContacts.accept"
      @contact-follow="gps.togglePlayer"
      @contact-ask="watchContacts.ask"
      @teleport="adminTeleport"
      @summon="adminSummon"
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
    <GameAtmScreen v-if="atmOpen" :screen="atm.screen.value" :pending="atm.pending.value" :feedback="atm.feedback.value" @run="atm.run" @clear-feedback="atm.clearFeedback" @close="atm.close" />
    <GameZoneBuyerMenu
      v-if="zoneBuyerOpen"
      :area="zoneBuyerOpen.area"
      :selling="zoneBuyerSelling"
      :feedback="zoneBuyerFeedback"
      :held="zoneBuyers.held"
      :item-name="zoneBuyers.itemName"
      @sell="zoneBuyers.sell"
      @close="zoneBuyers.close"
    />
    <div
      v-if="pickBar"
      class="pointer-events-none absolute bottom-40 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-center"
    >
      <p class="m-0 font-display text-sm tracking-wide text-fog">{{ pickBar.label }}</p>
      <div
        class="h-2 w-[min(240px,60vw)] overflow-hidden rounded-full bg-ink-950/60"
        role="progressbar"
        :aria-valuenow="Math.round(pickBar.progress * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full rounded-full bg-mint" :style="{ width: `${pickBar.progress * 100}%` }" />
      </div>
    </div>
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
    <GamePlayerList
      v-if="playerListOpen"
      :players="realtime.remotePlayers"
      :speaking="voice.speaking.value"
      :muted="mutedAccounts"
      :volumes="playerVolumes"
      @toggle-mute="toggleMuteAccount"
      @set-volume="setPlayerVolume"
      @close="playerListOpen = false"
    />
    <GameChat :open="chatOpen" @send="sendChat" @close="chatOpen = false" />
    <p v-if="voice.talking.value" class="cc-hud pointer-events-none absolute bottom-48 left-4 z-[30] m-0 flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-fog" role="status">
      <span class="size-2.5 animate-pulse rounded-full bg-coral" />{{ t('voice.live') }}
    </p>
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
