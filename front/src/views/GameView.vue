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
import GameAdminPanel from '../components/game/GameAdminPanel.vue'
import GameAtmScreen from '../components/game/GameAtmScreen.vue'
import GameLockpick from '../components/game/GameLockpick.vue'
import GameFurnitureStorage from '../components/game/GameFurnitureStorage.vue'
import GamePubMenu from '../components/game/GamePubMenu.vue'
import GamePubSecretDialog from '../components/game/GamePubSecretDialog.vue'
import GamePoliceLicenceDialog from '../components/game/GamePoliceLicenceDialog.vue'
import GameSportsPassDesk from '../components/game/GameSportsPassDesk.vue'
import GameSportsSignup from '../components/game/GameSportsSignup.vue'
import GameChat from '../components/game/GameChat.vue'
import GameDrunkEffects from '../components/game/GameDrunkEffects.vue'
import GameDrinkFast from '../components/game/GameDrinkFast.vue'
import GamePubChallenge from '../components/game/GamePubChallenge.vue'
import GamePubRaceBoard from '../components/game/GamePubRaceBoard.vue'
import GameJail from '../components/game/GameJail.vue'
import GameCuffed from '../components/game/GameCuffed.vue'
import GamePickpocket from '../components/game/GamePickpocket.vue'
import GameStorageBoard from '../components/game/GameStorageBoard.vue'
import GamePubQuizBoard from '../components/game/GamePubQuizBoard.vue'
import GameQuiz from '../components/game/GameQuiz.vue'
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
import GameTutorialQuest from '../components/game/GameTutorialQuest.vue'
import GameTutorialMarker from '../components/game/GameTutorialMarker.vue'
import { useTutorialMarker } from '../composables/game/useTutorialMarker'
import { useTutorialHints } from '../composables/game/useTutorialHints'
import GameTutorialHint from '../components/game/GameTutorialHint.vue'
import type { Vec3 } from '../game/mallTemplates/mallTemplate'
import { applyTutorialState, loadTutorial, skipTheTutorial, tutorial } from '../composables/game/useTutorial'
import GameTaskBanner from '../components/game/GameTaskBanner.vue'
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
import { useTaskBanner } from '../composables/game/useTaskBanner'

import { useLockpick } from '../composables/game/useLockpick'
import { useFurnitureStorage } from '../composables/game/useFurnitureStorage'
import { useRespawnBed } from '../composables/game/useRespawnBed'
import { useHouseAlarms } from '../composables/game/useHouseAlarms'
import type { HouseFurniturePayload } from '../types/gameRealtime'
import { useMarketStalls } from '../composables/game/useMarketStalls'
import { useMarket } from '../composables/game/useMarket'
import { useMarketCrowd } from '../composables/game/useMarketCrowd'
import { MARKET_MUSIC_URL, MARKET_ZONE } from '../game/market/marketStalls.ts'
import GameMarketPanel from '../components/game/GameMarketPanel.vue'
import { useCashBags } from '../composables/game/useCashBags'
import { useJailCell } from '../composables/game/useJailCell'
import { useJail } from '../composables/game/useJail'
import { usePolice } from '../composables/game/usePolice'
import { useSportsPass } from '../composables/game/useSportsPass'
import { passValid } from '../game/sports/sportsPass'
import { useSportsSignup } from '../composables/game/useSportsSignup'
import { usePickpocket } from '../composables/game/usePickpocket'
import { useStorageAuction } from '../composables/game/useStorageAuction'
import { useStorageWarehouse } from '../composables/game/useStorageWarehouse'
import { useProximityVoice } from '../composables/game/useProximityVoice'
import { mutedAccounts, playerVolumes, setPlayerVolume, toggleMuteAccount } from '../composables/game/useVoiceSettings'
import GamePlayerList from '../components/game/GamePlayerList.vue'
import GameTasksPanel from '../components/game/GameTasksPanel.vue'
import { useFarm } from '../composables/game/useFarm'
import { useMallCellTemplates, type CellStoreEntry } from '../composables/game/useMallCellTemplates'
import { useZoneDecor } from '../composables/game/useZoneDecor'
import { usePub } from '../composables/game/usePub'
import { usePubChallenge } from '../composables/game/usePubChallenge'
import { usePubGames } from '../composables/game/usePubGames'
import { usePubQuiz } from '../composables/game/usePubQuiz'
import { useRenderStats } from '../composables/game/useRenderStats'
import { useRoomEnvironment } from '../composables/game/useRoomEnvironment'
import { useSeats } from '../composables/game/useSeats'
import { useSurvival } from '../composables/game/useSurvival'
import { useTrade } from '../composables/game/useTrade'
import { useAdminWatch } from '../composables/game/useAdminWatch'
import { adminGrantedMessage } from '../game/admin/adminPanel'
import { useWatchBank } from '../composables/game/useWatchBank'
import { useGps } from '../composables/game/useGps'
import { useWatchContacts } from '../composables/game/useWatchContacts'
import { usePunch } from '../composables/game/usePunch'
import { useHeldTool } from '../composables/game/useHeldTool'
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
import { storeBuildings, workBuildings, type WorldBounds } from '../game/world/worldManifest'
import type { GearSlot } from '../game/wardrobeSlots'
import type { PoliceBountyPayload, PoliceCuffCancelledPayload, SportsErrorPayload } from '../types/gameRealtime'
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
const marketMusic = createAmbientLoop(MARKET_MUSIC_URL, 0.14, sfx.listener)
let marketBounds: WorldBounds | null = null

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

const furnitureUsage = computed(() => {
  const unit = housing.units.value.find((u) => u.model_key === editableHouseKey.value)
  return unit ? { placed: apartmentObjectIds.value.length, limit: unit.furniture_limit } : null
})

const placement = useApartmentPlacement({
  getScene,
  getCamera,
  getColyseusRoom: () => gameRoomRef.value,
  getApartmentObjectMesh,
  getApartmentInventoryOpen: () => inventoryOpen.value,
  canDecorate,
  furnitureUsage,
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
    if (role === 'auctioneer') storageWarehouse.setAuctioneer(npc)
  },
  npcSpeed: (npc) => storageWarehouse.npcSpeed(npc),
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
const holdingLockpick = () => selectedItem.value?.code === 'tool_lockpick'
const holdingReinforcedLock = () => selectedItem.value?.code === 'tool_reinforced_lock'

const lockpick = useLockpick({
  gameRoomRef,
  onOutcome: (outcome) => {
    if (outcome === 'open' || outcome === 'broke' || outcome === 'abandoned') void refreshOwnedItems()
  },
})
const { open: lockpickOpen } = lockpick
watch(lockpickOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})

const housing = useCityHousing({
  myAccountId,
  gameRoomRef,
  roomMessage,
  holdingHouseKey,
  refreshInventory: () => refreshOwnedItems(),
  holdingLockpick,
  holdingReinforcedLock,
  startLockpick: lockpick.start,
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
  dartsFree: () => tutorial.value?.status === 'active' && tutorial.value.step === 'play_darts',
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

const pubQuiz = usePubQuiz({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  say: (text) => survival.say(text),
  t: (key, params) => (params ? t(key, params) : t(key)),
})
const { screen: pubQuizScreen, open: pubQuizOpen, board: pubQuizBoard, announcement: pubQuizAnnouncement } = pubQuiz

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
const pubUiOpen = computed(() => pubMenuOpen.value || pubSecretOpen.value || pubGamesOpen.value || pubQuizOpen.value)
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
const { shown: taskDone, handlers: taskHandlers } = useTaskBanner()
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
const tutorialWorldPlaces = shallowRef<{ trees: readonly Vec3[]; dartsOche: Vec3 | null; bartender: Vec3 | null; doors: readonly Vec3[] }>({
  trees: [],
  dartsOche: null,
  bartender: null,
  doors: [],
})
const tutorialMarker = useTutorialMarker({
  myPosition,
  getCamera,
  canvasRef,
  step: () => (tutorial.value?.status === 'active' ? tutorial.value.step : null),
  places: () => ({
    ...tutorialWorldPlaces.value,
    farmer: zoneDecor.buyers.value.find((buyer) => buyer.zone === 'orchard')?.position ?? null,
    atms: zoneDecor.atms.value,
  }),
})
const { marker: tutorialMarkerOnScreen } = tutorialMarker
const tutorialHints = useTutorialHints({
  myPosition,
  getCamera,
  canvasRef,
  accountId: () => myAccountId.value,
  active: () => tutorial.value?.status === 'active' && !loadingShown.value,
  places: () => {
    const { bartender, doors } = tutorialWorldPlaces.value
    const buyers = zoneDecor.buyers.value.map((buyer) => buyer.position)
    return { atm: zoneDecor.atms.value, npc: bartender ? [...buyers, bartender] : buyers, door: doors }
  },
})
const { bubble: tutorialHintBubble } = tutorialHints
const interactKeys = computed(() => actionKeyLabels('interact').join(' / '))
const houseAlarms = useHouseAlarms({
  gameRoomRef,
  say: (text) => survival.say(text),
  ring: () => sfx.play('alarm_siren'),
  liveMessage: () => t('watch.alarm.alert'),
  awayMessage: (count) => t('watch.alarm.away', { count }),
})
const furnishedHouses = shallowRef<HouseFurniturePayload[]>([])
const storage = useFurnitureStorage({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  houses: () => furnishedHouses.value,
  promptLabel: () => t('storage.prompt'),
  onChanged: () => refreshOwnedItems(),
})
const { open: storageOpen } = storage
const respawnBed = useRespawnBed({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  houses: () => furnishedHouses.value,
  promptLabel: () => t('bed.prompt'),
  say: (text) => survival.say(text),
  doneMessage: () => t('bed.set'),
})
watch(storageOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const marketStalls = useMarketStalls({ stalls: () => zoneDecor.marketStalls.value })
const market = useMarket({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  market: () => marketStalls.market.value,
  stalls: () => zoneDecor.marketStalls.value,
  myAccountId: () => myAccountId.value,
  t: (key, params) => t(key, params ?? {}),
  playSound: (name) => sfx.play(name),
  refreshInventory: () => refreshOwnedItems(),
})
const marketCrowd = useMarketCrowd({
  shoppers: () => zoneDecor.marketShoppers.value,
  stalls: () => zoneDecor.marketStalls.value,
  market: () => marketStalls.market.value,
})
const marketPanelOpen = computed(() => market.panel.value !== null)
watch(marketPanelOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const cashBags = useCashBags({
  myPosition,
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  promptLabel: () => t('cashBag.prompt'),
  say: (text) => survival.say(text),
  pickedMessage: (amount, toolCount) => {
    if (toolCount === 0) return t('cashBag.picked', { amount })
    return amount > 0 ? t('cashBag.pickedTools', { amount, count: toolCount }) : t('cashBag.pickedOnlyTools', { count: toolCount })
  },
  onToolsPicked: () => refreshOwnedItems(),
})
let storageUnits: readonly { id: string; door: string; threshold: [number, number, number]; inside: [number, number, number] }[] = []
const storageAuction = useStorageAuction({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  myAccountId: () => myAccountId.value,
  units: () => storageUnits,
  inWarehouse: () => currentHouseKey.value === 'storage',
  promptsHidden: () => inventoryOpen.value || !canUsePub(),
  t: (key, params) => t(key, params ?? {}),
  say: (text) => survival.say(text),
})
const storageBoard = storageAuction.board
const storageWarehouse = useStorageWarehouse({
  getScene,
  sale: storageAuction.sale,
  units: () => storageUnits,
  playOn: (name, object) => sfx.playOn(name, object),
})
watch(atmOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const jailCell = useJailCell({
  myPosition,
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  trayLabel: () => t('jail.trayPrompt'),
  onAte: () => {
    survival.playOneShot('eat')
    survival.say(t('jail.trayEaten'))
  },
})
const POLICE_ERROR_KEYS: Record<string, string> = {
  police_insufficient_funds: 'police.notEnough',
  police_account_too_new: 'police.tooNew',
  police_licence_held: 'police.alreadyHeld',
  police_jailed: 'police.jailed',
  police_no_licence: 'police.noLicence',
  police_wanted: 'police.wanted',
  police_not_on_duty: 'police.notOnDuty',
  police_busy: 'police.busy',
  cuff_busy: 'police.cuffBusy',
  cuff_too_far: 'police.cuffTooFar',
  cuff_jailed: 'police.cuffJailed',
  cuff_knocked_out: 'police.cuffKnockedOut',
  cuff_already: 'police.cuffAlready',
  cuff_moving: 'police.cuffMoving',
}
const CUFF_CANCEL_KEYS: Partial<Record<PoliceCuffCancelledPayload['reason'], string>> = {
  moved: 'police.cuffCancelMoved',
  punched: 'police.cuffCancelMoved',
  too_far: 'police.cuffCancelTooFar',
}
const BOUNTY_REASON_KEYS: Record<string, string> = {
  daily_cap: 'police.bountyCap',
  suspect_already_paid: 'police.bountyAlreadyPaid',
  friends: 'police.bountyFriends',
  recent_exchange: 'police.bountyExchange',
  suspect_too_new: 'police.bountyTooNew',
  no_crime_stars: 'police.bountyNoCrime',
  not_wanted: 'police.bountyNotWanted',
}
function bountyText({ paid, reason }: PoliceBountyPayload): string {
  if (paid > 0) return t(reason === 'daily_cap' ? 'police.bountyPaidCapped' : 'police.bountyPaid', { paid })
  const key = reason ? BOUNTY_REASON_KEYS[reason] : undefined
  return key ? t(key) : t('police.bountyNone')
}
const police = usePolice({
  myPosition,
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  jailed: () => jailSentence.value !== null,
  deskPrompt: (price) => ({ action: t('police.buyAction'), detail: t('police.buyDetail', { price }) }),
  lockerPrompt: (onDuty, licensed) => ({
    action: t(onDuty ? 'police.goOffDuty' : 'police.goOnDuty'),
    detail: onDuty || licensed ? t('police.lockers') : t('police.licenceNeeded'),
  }),
  errorText: (error, price) => {
    const key = POLICE_ERROR_KEYS[error.code]
    return key ? t(key, { price: price ?? '' }) : error.message
  },
  say: (text) => survival.say(text),
  onDutyStarted: () => {
    sfx.play('door_close')
    survival.say(t('police.onDutyStarted'))
  },
  onDutyEnded: (reason) => {
    if (reason !== 'off') return
    sfx.play('door_open')
    survival.say(t('police.offDuty'))
  },
  onLicenceBought: () => survival.say(t('police.bought')),
  onLicenceLost: () => survival.say(t('police.licenceLost')),
  pseudoOf: (sessionId) => realtime.remotePseudo(sessionId) ?? '…',
  cuffPrompt: (pseudo) => ({ action: t('police.cuffAction', { pseudo }), detail: t('police.cuffDetail') }),
  uncuffPrompt: (pseudo) => ({ action: t('police.uncuffAction', { pseudo }) }),
  lockUpPrompt: (pseudo) => ({ action: t('police.lockUpAction', { pseudo }), detail: t('police.lockUpDetail') }),
  releasePrompt: () => ({ action: t('police.releaseAction'), detail: t('police.releaseDetail') }),
  onCuffStarted: (role) => {
    if (role === 'suspect') survival.say(t('police.beingCuffed'))
  },
  onCuffCancelled: (role, reason) => {
    const key = role === 'officer' ? CUFF_CANCEL_KEYS[reason] : undefined
    if (key) survival.say(t(key))
  },
  onCuffs: (role, { cuffed, reason }) => {
    if (role === 'suspect') survival.say(t(cuffed ? 'police.youAreCuffed' : 'police.youAreFree'))
    else if (cuffed) survival.say(t('police.cuffed'))
    else if (reason !== 'cell' && reason !== 'uncuffed') survival.say(t('police.escortEnded'))
  },
  onBounty: (data) => survival.say(bountyText(data)),
})
const { cuffedBy: policeCuffedBy, onDuty: policeOnDuty, confirmOpen: policeConfirmOpen, buying: policeBuying, error: policeError, price: policePrice } = police
watch(policeConfirmOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
function sportsErrorText({ code, message }: SportsErrorPayload): string {
  const key = `sports.errors.${code}`
  return te(key) ? t(key) : message
}
const sportsPass = useSportsPass({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  desks: () => zoneDecor.sportsPassDesks.value,
  deskPrompt: ({ validUntil, prices }) => ({
    action: t('sports.pass.deskAction'),
    detail: validUntil !== null && passValid(validUntil, Date.now())
      ? t('sports.pass.deskValid', { end: new Date(validUntil).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) })
      : t('sports.pass.deskDetail', prices),
  }),
  errorText: sportsErrorText,
  noPassText: () => t('sports.noPass'),
  say: (text) => survival.say(text),
  onBought: () => {
    sfx.play('market_bought')
    survival.say(t('sports.bought'))
  },
})
const { open: sportsPassOpen, state: sportsPassState, buying: sportsPassBuying, error: sportsPassError } = sportsPass
watch(sportsPassOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const sportsSignup = useSportsSignup({
  myPosition,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  coaches: () => zoneDecor.sportsCoaches.value,
  coachPrompt: () => ({ action: t('sports.signup.coachAction'), detail: t('sports.signup.coachDetail') }),
  errorText: sportsErrorText,
  closedText: (reason) => t(`sports.signup.closed.${reason}`),
  say: (text) => survival.say(text),
  onSignedUp: () => {
    sfx.play('market_bell')
    survival.say(t('sports.signedUp'))
  },
})
const { open: sportsSignupOpen, choices: sportsVenueChoices, canPickVenue: sportsCanPickVenue, lobby: sportsLobby, spec: sportsSpec, team: sportsTeam, settings: sportsSettings, pending: sportsSignupPending, error: sportsSignupError, clientNow: sportsClientNow, clockOffset: sportsClockOffset } = sportsSignup
watch(sportsSignupOpen, (open) => {
  if (!open && !document.pointerLockElement) requestPointerLock()
})
const PICKPOCKET_ERROR_KEYS = new Set([
  'pickpocket_on_duty',
  'pickpocket_jailed',
  'pickpocket_cuffed',
  'pickpocket_knocked_out',
  'pickpocket_victim_jailed',
  'pickpocket_position',
  'pickpocket_account_too_new',
  'pickpocket_victim_too_new',
  'pickpocket_cooldown',
  'pickpocket_victim_recent',
  'pickpocket_inventory_full',
  'pickpocket_item_gone',
])
const pickpocket = usePickpocket({
  myPosition,
  getScene,
  getCamera,
  canvasRef,
  gameRoomRef,
  promptsHidden: () => inventoryOpen.value,
  blocked: () => !canUsePub() || jailSentence.value !== null || policeOnDuty.value || policeCuffedBy.value !== null,
  pseudoOf: (sessionId) => realtime.remotePseudo(sessionId) ?? '…',
  prompt: (pseudo) => ({ action: t('pickpocket.action', { pseudo }), detail: t('pickpocket.detail') }),
  say: (text) => survival.say(text),
  failedText: (reason) => t(`pickpocket.failed.${reason}`),
  succeededText: (witnessed) => t(witnessed ? 'pickpocket.succeededSeen' : 'pickpocket.succeeded'),
  takenText: ({ name, quantity }) => t('pickpocket.taken', { name, quantity }),
  lootClosedText: () => t('pickpocket.lootClosed'),
  alertText: ({ kind, thiefPseudo, victimPseudo }) => {
    if (kind === 'witness') return t('pickpocket.alertWitness', { thief: thiefPseudo, victim: victimPseudo })
    return t(kind === 'seen' ? 'pickpocket.alertSeen' : 'pickpocket.alertFailed', { thief: thiefPseudo })
  },
  missingText: ({ name, quantity, thiefPseudo }) =>
    thiefPseudo ? t('pickpocket.missingBy', { name, quantity, thief: thiefPseudo }) : t('pickpocket.missing', { name, quantity }),
  errorText: (error) => (PICKPOCKET_ERROR_KEYS.has(error.code) ? t(`pickpocket.errors.${error.code}`) : error.message),
  onInventoryChanged: () => refreshOwnedItems(),
  onStopped: () => sfx.play('whoosh'),
  onCaught: () => sfx.play('impact'),
})
const { game: pickpocketGame, loot: pickpocketLoot } = pickpocket
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
  if (police.cuffProgress.value !== null) return { progress: police.cuffProgress.value, label: t('police.cuffing') }
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
  promptsHidden: () => inventoryOpen.value || housing.claimInFlight.value || lockpickOpen.value,
  housingUnits: housing.units,
  nearbyHousingUnit: housing.nearbyUnit,
  housingActionFor: housing.actionFor,
  housingLeaveDetailFor: housing.leaveDetailFor,
  isWorkDoorOpen: (lot) => housing.isWorkDoorOpen(lot.key),
  onHousingDoor: () => {
    const unit = housing.nearbyUnit.value?.unit
    const action = unit ? housing.actionFor(unit) : null
    if (action === 'open' || action === 'close' || action === 'locked') arms?.use('door')
    else if (action === 'lock' || action === 'pick') arms?.use('key')
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
  sources: [pub.source, pubQuiz.source, pubChallenge.source, pubGames.source, seats.source, orchard.source, farm.source, zoneBuyers.source, atm.source, storage.source, respawnBed.source, cashBags.source, storageAuction.source, jailCell.source, police.source, pickpocket.source, market.source, sportsPass.source, sportsSignup.source],
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
const FIRST_PERSON_TOOL_SCALE = 0.6

function holdingJobTool(): boolean {
  return heldTool.code.value !== null && heldTool.code.value === selectedItem.value?.code
}

function heldModel(): { url: string | null; scale: number } {
  const item = selectedItem.value
  if (!item || (item.kind !== 'tool' && item.kind !== 'consumable')) return { url: null, scale: 1 }
  if (holdingJobTool()) return { url: item.model_glb, scale: FIRST_PERSON_TOOL_SCALE }
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
const adminWatch = useAdminWatch({
  gameRoomRef,
  say: (text) => survival.say(text),
  grantedMessage: (data) => {
    const { key, params } = adminGrantedMessage(data)
    return t(key, params)
  },
  refreshInventory: () => refreshOwnedItems(),
})
const { isAdmin, menu: adminMenu, error: adminError, panelOpen: adminPanelOpen } = adminWatch
function openAdminPanel(): void {
  trade.closeMenu()
  adminWatch.openPanel()
  if (document.pointerLockElement) document.exitPointerLock()
}
watch(adminPanelOpen, (open) => {
  if (open && document.pointerLockElement) document.exitPointerLock()
  if (!open && !document.pointerLockElement) requestPointerLock()
})
function adminTeleport(key: string): void {
  adminWatch.teleport(key)
  trade.closeMenu()
}
function adminGoTo(sessionId: string): void {
  adminWatch.goTo(sessionId)
  trade.closeMenu()
}
function adminSummon(sessionId: string): void {
  adminWatch.summon(sessionId)
  adminWatch.load()
}

// ---------------------------------------------------------------- survival: hunger, thirst, health

const stamina = ref(MAX_STAMINA)
const wantedStars = ref(0)
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
  onToolsLost: (count) => {
    refreshOwnedItems()
    survival.say(t('cashBag.droppedTools', { count }))
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
  cellTap: () => jailCell.tap(),
  cellTapPrompt: () => ({ action: t('jail.tapAction'), detail: t('jail.tapDetail') }),
})
const {
  prompt: survivalPrompt,
  effects: survivalEffects,
  damageFlash,
  knockedOut,
  knockoutCause,
  knockedOutToJail,
  hospitalBill,
  jailTax,
  lostBelongings,
  message: survivalMessage,
  reducedEffects,
  recovering,
} = survival

const jail = useJail({
  gameRoomRef,
  onReleased: ({ reason, fine }) => {
    jailCell.clear()
    if (reason === 'released') survival.say(t('jail.releasedByOfficer'))
    else survival.say(reason === 'served' ? t('jail.served') : t('jail.paid', { fine }))
  },
})
const { sentence: jailSentence, error: jailError, paying: jailPaying } = jail

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
    storageUnits = manifest.storage?.units ?? []
    const musicZone = manifest.zones.find((zone) => zone.music)
    if (musicZone?.music && !zoneMusic) {
      zoneMusic = createAmbientLoop(musicZone.music.url, 0.14, sfx.listener)
      zoneMusicBounds = musicZone.music.bounds
      zoneMusicKey = musicZone.key
    }
    marketBounds = manifest.zones.find((zone) => zone.key === MARKET_ZONE)?.bounds ?? null
    survival.onTownLoaded(manifest)
    clinic.onTownLoaded(manifest)
    jailCell.onTownLoaded(manifest)
    police.onTownLoaded(manifest)
    seats.onTownLoaded(manifest)
    pub.onTownLoaded(manifest)
    pubQuiz.onTownLoaded(manifest)
    pubGames.onTownLoaded(manifest)
    orchard.onTownLoaded(manifest)
    farm.onTownLoaded(manifest)
    tutorialWorldPlaces.value = {
      trees: manifest.orchard?.trees ?? [],
      dartsOche: manifest.pub?.darts.oche ?? null,
      bartender: manifest.pub?.bartender ?? null,
      doors: [...storeBuildings(manifest), ...workBuildings(manifest)].map((building) => building.door),
    }
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
    !lockpickOpen.value &&
    !storageOpen.value &&
    !marketPanelOpen.value &&
    !sportsPassOpen.value &&
    !sportsSignupOpen.value &&
    !adminPanelOpen.value &&
    !playerListOpen.value &&
    !tasksOpen.value &&
    !settingsOpen.value &&
    !creator.value,
)
/** Back in the game with the menu closed, but the browser hasn't given the pointer back yet. */
const resumedWithoutLock = computed(() => pauseMenuOpen.value && pauseDismissed.value)

const { t, te, locale } = useI18n()
const walletBalances = useWalletBalances()

watch(inventoryOpen, (open) => {
  if (open) refreshCashAndBank().catch((err) => console.error('[bank] could not load cash and bank', err))
})

const chatOpen = ref(false)
const playerListOpen = ref(false)
const tasksOpen = ref(false)
watch(mutedAccounts, (accounts) => gameRoomRef.value?.send('voice_mute', { accounts: [...accounts] }))
watch([playerListOpen, tasksOpen], ([listOpen, taskMenuOpen]) => {
  const open = listOpen || taskMenuOpen
  if (open && document.pointerLockElement) document.exitPointerLock()
  if (!open && !document.pointerLockElement) requestPointerLock()
})

function sendChat(text: string): void {
  gameRoomRef.value?.send('chat', { text })
}

const WALK_WITH_WATCH_ACTIONS = ['moveForward', 'moveBack', 'moveLeft', 'moveRight', 'jump', 'survivalWatch'] as const

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement
}

function isWalkWithWatchKey(code: string): boolean {
  return code === 'ShiftLeft' || code === 'ShiftRight' || WALK_WITH_WATCH_ACTIONS.some((action) => matches(action, code))
}

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (chatOpen.value || atmOpen.value || lockpickOpen.value || storageOpen.value || marketPanelOpen.value || playerListOpen.value || tasksOpen.value) return true
  if (adminPanelOpen.value && (isEditableTarget(e.target) || !pointerLocked.value)) return true
  // the character screen owns the keyboard (Esc closes the editor)
  if (creator.value) return true
  // the trade window takes the keyboard (coins field, Esc): no game key behind it
  if (tradeWindowOpen.value) return true
  if (watchMenuOpen.value && !isWalkWithWatchKey(e.code)) return true
  // the bouncer's text field and the pub games (Space holds the pint) take the keyboard too
  if (pubSecretOpen.value || pubGamesOpen.value) return true
  if (pubQuiz.onKeyDown(e)) return true
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
  if (pickpocket.onKeyDown(e)) return true
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
  if (matches('tasks', e.code) && !e.repeat) {
    e.preventDefault()
    tasksOpen.value = true
    return true
  }
  if (matches('chat', e.code) && !e.repeat) {
    e.preventDefault()
    chatOpen.value = true
    return true
  }
  if (matches('buyHouse', e.code) && !e.repeat) {
    e.preventDefault()
    return housing.buy() || housing.leave()
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
  onHotbarScroll: (step) => {
    if (placement.onWheelStep(step)) return
    selectHotbarIndex((selectedHotbarIndex.value + step + 9) % 9)
  },
  handleExtraKeyDown,
  onCanvasMouseDown: (e) => {
    // furniture placement keeps its own clicks (left: pick / place, right: cancel)
    if (placement.onPointerDown(e)) return true
    if (adminPanelOpen.value && !pointerLocked.value) {
      requestPointerLock()
      return true
    }
    return pointerLocked.value && runUseOrPunch(mouseButtonCode(e.button), false, e.shiftKey)
  },
  speedFactor: () => survival.speedFactor() * intoxication.walkFactor(),
  movementLocked: () => seats.seated.value || police.cuffedBy.value !== null,
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
    marketCrowd.tick(dt)
    cashBags.tick(dt)
    storageAuction.tick()
    storageWarehouse.tick(dt)
    voice.tick()
    for (const { store } of furnitureStores) store.update(dt)
    threadsMusic.update(dt, inThreads.value)
    zoneMusic?.update(dt, (currentHouseKey.value === null || currentHouseKey.value === zoneMusicKey) && insideBounds(zoneMusicBounds, myPosition))
    marketMusic.update(dt, currentHouseKey.value === null && marketStalls.market.value?.open === true && insideBounds(marketBounds, myPosition))
    interactions.updatePrompts()
    houseKeys.updateKeyPrompt()
    updateFrontDoors(dt, isBuildingDoorOpen)
    arms?.update(dt, myPosition)
    const held = heldModel()
    arms?.setHolding(holdingJobTool())
    heldItem.update(arms?.rightHand() ?? null, held.url, held.scale)
    survival.tick(dt)
    stamina.value = punch.staminaNow()
    for (const { store } of furnitureStores) store.updatePrompt()
    clinic.updatePrompt()
    pub.tick(dt)
    pubGames.tick()
    pubQuiz.tick()
    orchard.tick()
    tutorialMarker.tick()
    tutorialHints.tick()
    farm.tick()
    police.tick()
    sportsSignup.tick()
    if (!doorSigns.group.parent) getScene()?.add(doorSigns.group)
    minimap.tick()
    gps.tick()
  },
})
const { requestPointerLock, onCanvasMouseDown } = movement

const heldTool = useHeldTool({
  gameRoomRef,
  selectedCode: () => selectedItem.value?.code ?? null,
  itemName: (code) => (selectedItem.value?.code === code ? selectedItem.value.name.toLowerCase() : 'tool'),
  say: (text) => survival.say(text),
  playSound: sfx.play,
  refreshInventory: () => refreshOwnedItems(),
})
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
  cooldownMs: () => heldTool.cooldownMs.value,
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
  onHouseFurnitureSync: (houses) => {
    furnishedHouses.value = houses
    houseFurniture.applyHouses(houses)
  },
  onDoorsSync: housing.applyOpenDoors,
  onDoorSound: ({ door, sound, side = 'front' }) => {
    const node = frontDoorNode(door, side)
    if (!node) return
    sfx.playOn(`door_${sound}`, node)
    if (sound === 'rattle') rattleFrontDoor(door, side)
  },
  onMyOutfit: (models) => {
    if (!policeOnDuty.value) arms?.setTop(models.top)
  },
  onMyShownTop: (top) => arms?.setTop(top),
  onPunched: punch.onPunched,
  onPunchTired: punch.onTired,
  onMyWanted: (stars) => (wantedStars.value = stars),
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
  pubQuiz: pubQuiz.handlers,
  orchard: orchard.handlers,
  zoneBuyers: zoneBuyers.handlers,
  atm: atm.handlers,
  tasks: taskHandlers,
  tutorial: {
    onState: (data) => {
      const wasDone = tutorial.value?.status === 'done'
      applyTutorialState(data)
      if (!wasDone && tutorial.value?.status === 'done') survival.say(t('tutorial.welcome'))
    },
  },
  lockpick: {
    ...lockpick.handlers,
    onReinforced: () => {
      survival.say(t('lockpick.reinforced'))
      void refreshOwnedItems()
    },
    onReinforceError: (data) => survival.say(data.message),
    onHouseAlarm: () => houseAlarms.onLive(),
    onAlarmSiren: ({ door }) => {
      const node = frontDoorNode(door)
      if (node) sfx.playOn('alarm_siren', node)
    },
  },
  storage: storage.handlers,
  bed: respawnBed.handlers,
  market: { ...marketStalls.handlers, ...market.handlers },
  cashBags: cashBags.handlers,
  jail: { ...jail.handlers, onTray: jailCell.onTray },
  police: police.handlers,
  sports: {
    onPassState: sportsPass.handlers.onState,
    onPassBought: sportsPass.handlers.onBought,
    onPassError: sportsPass.handlers.onError,
    onCorrection: sportsPass.onCorrection,
    onLobby: sportsSignup.handlers.onLobby,
    onLobbyClosed: sportsSignup.handlers.onLobbyClosed,
    onError: sportsSignup.handlers.onError,
    onRoomJoined: sportsSignup.handlers.onRoomJoined,
  },
  pickpocket: pickpocket.handlers,
  storageAuction: {
    ...storageAuction.handlers,
    onOpened: (data) => {
      storageAuction.handlers.onOpened(data)
      storageWarehouse.onOpened(data)
    },
  },
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
  loadTutorial().catch((error: unknown) => survival.say(error instanceof Error ? error.message : String(error)))
  boot.complete('server')
  if (!unmounted) movement.startRenderLoop()
}

async function skipTutorialQuest(): Promise<void> {
  try {
    await skipTheTutorial()
  } catch (error) {
    survival.say(error instanceof Error ? error.message : String(error))
  }
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
  storageWarehouse.dispose()
  window.clearInterval(doorSignTimer)
  doorSigns.dispose()
  arms?.dispose()
  threadsMusic.dispose()
  zoneMusic?.dispose()
  marketMusic.dispose()
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
      :jail-text="knockedOutToJail ? t('jail.takenAway') : null"
      :jail-bill-text="
        knockedOutToJail && hospitalBill !== null && hospitalBill + jailTax > 0
          ? t('jail.deathBill', { hospital: hospitalBill, tax: jailTax, total: hospitalBill + jailTax })
          : null
      "
      :lost-belongings="lostBelongings"
      :message="survivalMessage"
      :recovering="recovering"
      :reduced-effects="reducedEffects"
    />
    <GameDrunkEffects :effects="drunkEffects" />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameRoomMessageBanner v-else-if="pubQuizAnnouncement" :message="pubQuizAnnouncement" />
    <GameRoomMessageBanner v-else-if="market.announcement.value" :message="market.announcement.value" />
    <GameTaskBanner v-if="taskDone" :key="`${taskDone.task}-${taskDone.tier}`" :done="taskDone" />
    <!-- an error during boot drops the loading screen so its banner is seen; the character creator shows over the load -->
    <Transition leave-active-class="transition-opacity duration-500" leave-to-class="opacity-0">
      <GameLoadingScreen
        v-if="loadingShown && !roomMessage && !creator"
        :percent="boot.percent.value"
        :stages="boot.stages.value"
        :files="boot.files.value"
      />
    </Transition>
    <GameTutorialMarker
      v-if="tutorialMarkerOnScreen && !loadingShown"
      :x="tutorialMarkerOnScreen.x"
      :y="tutorialMarkerOnScreen.y"
      :on-screen="tutorialMarkerOnScreen.onScreen"
      :angle="tutorialMarkerOnScreen.angle"
      :metres="tutorialMarkerOnScreen.metres"
    />
    <GameTutorialHint
      v-if="tutorialHintBubble && !loadingShown"
      :kind="tutorialHintBubble.kind"
      :x="tutorialHintBubble.x"
      :y="tutorialHintBubble.y"
      :use-key="interactKeys"
    />
    <GameTutorialQuest
      v-if="tutorial?.status === 'active' && !loadingShown"
      :step="tutorial.step"
      @skip="skipTutorialQuest"
    />
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
      :wanted-stars="wantedStars"
      :on-duty="policeOnDuty"
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
      :admin="adminWatch"
      :own-session-id="gameRoomRef?.sessionId ?? ''"
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
      :alarm-alerts="houseAlarms.alerts.value"
      :alarm-unseen="houseAlarms.unseen.value"
      @alarm-open="houseAlarms.markSeen"
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
      @go-to="adminGoTo"
      @storage-sale="adminWatch.startStorageSale"
      @admin-panel="openAdminPanel"
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
    <GameFurnitureStorage
      v-if="storageOpen"
      :screen="storage.screen.value"
      :storable="storage.storable.value"
      :pending="storage.pending.value"
      :error="storage.error.value"
      @deposit="storage.deposit"
      @take="storage.take"
      @close="storage.close"
    />
    <GameLockpick v-if="lockpick.board.value" :board="lockpick.board.value" @press="lockpick.press" @close="lockpick.close" />
    <GameAdminPanel
      v-if="adminPanelOpen && gameRoomRef"
      :own-session-id="gameRoomRef.sessionId"
      :menu="adminMenu"
      :items="adminWatch.items.value"
      :result="adminWatch.result.value"
      :log="adminWatch.log.value"
      :recent-place="adminWatch.recentPlace.value"
      :error="adminError"
      @give-money="adminWatch.giveMoney"
      @give-item="adminWatch.giveItem"
      @start-quiz="adminWatch.startQuiz"
      @start-storage-sale="adminWatch.startStorageSale"
      @open-market="adminWatch.openMarket"
      @close-market="adminWatch.closeMarket"
      @collect-taxes="adminWatch.collectTaxes"
      @teleport="adminWatch.teleport"
      @go-to="adminWatch.goTo"
      @summon="adminSummon"
      @close="adminWatch.closePanel"
    />
    <GameAtmScreen v-if="atmOpen" :screen="atm.screen.value" :pending="atm.pending.value" :feedback="atm.feedback.value" @run="atm.run" @clear-feedback="atm.clearFeedback" @close="atm.close" />
    <GameMarketPanel
      v-if="market.panel.value"
      :panel="market.panel.value"
      :market="marketStalls.market.value"
      :canopies="marketStalls.canopyHexes.value"
      :offerable="market.offerable.value"
      :pending="market.pending.value"
      :feedback="market.feedback.value"
      @claim="(stallNo, canopy) => market.run({ action: 'claim', stallNo, canopy })"
      @list="(slot, code, quantity, unitPrice, container) => market.run({ action: 'list', slot, code, quantity, unitPrice, container })"
      @withdraw="(lotId) => market.run({ action: 'withdraw', lotId })"
      @buy="market.buy"
      @close="market.close"
    />
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
    <GameTasksPanel v-if="tasksOpen" @close="tasksOpen = false" />
    <GameChat :open="chatOpen" @send="sendChat" @close="chatOpen = false" />
    <p v-if="voice.talking.value" class="cc-hud pointer-events-none absolute bottom-48 left-4 z-[30] m-0 flex items-center gap-2 px-3 py-1.5 text-sm font-bold text-fog" role="status">
      <span class="size-2.5 animate-pulse rounded-full bg-coral" />{{ t('voice.live') }}
    </p>
    <GamePoliceLicenceDialog
      v-if="policeConfirmOpen && policePrice !== null"
      :price="policePrice"
      :buying="policeBuying"
      :error="policeError"
      @confirm="police.confirmBuy"
      @close="police.closeConfirm"
    />
    <GameSportsPassDesk
      v-if="sportsPassOpen && sportsPassState"
      :pass="sportsPassState"
      :buying="sportsPassBuying"
      :error="sportsPassError"
      @buy="sportsPass.buy"
      @close="sportsPass.close"
    />
    <GameSportsSignup
      v-if="sportsSignupOpen"
      :lobby="sportsLobby"
      :choices="sportsVenueChoices"
      :can-pick-venue="sportsCanPickVenue"
      :spec="sportsSpec"
      :team="sportsTeam"
      :settings="sportsSettings"
      :my-session-id="gameRoomRef?.sessionId ?? null"
      :pending="sportsSignupPending"
      :error="sportsSignupError"
      :client-now="sportsClientNow"
      :clock-offset="sportsClockOffset"
      @pick-team="(side) => (sportsTeam = side)"
      @set-setting="(key, value) => (sportsSettings = { ...sportsSettings, [key]: value })"
      @pick-venue="sportsSignup.pickVenue"
      @sign-up="sportsSignup.signUp"
      @leave="sportsSignup.leave"
      @close="sportsSignup.close"
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
    <GameJail v-if="jailSentence && !knockedOut" :sentence="jailSentence" :error="jailError" :paying="jailPaying" @pay="jail.pay" />
    <GameCuffed v-if="policeCuffedBy && !knockedOut" :officer="realtime.remotePseudo(policeCuffedBy) ?? '…'" />
    <GamePickpocket v-if="!knockedOut" :game="pickpocketGame" :loot="pickpocketLoot" @take="pickpocket.take" />
    <GameStorageBoard v-if="storageBoard" :board="storageBoard" />
    <GamePubQuizBoard v-if="pubQuizBoard" :board="pubQuizBoard" />
    <GameQuiz
      v-if="pubQuizScreen"
      :screen="pubQuizScreen"
      :my-session-id="gameRoomRef?.sessionId ?? ''"
      @answer="pubQuiz.answer"
      @close="pubQuiz.close"
    />
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
