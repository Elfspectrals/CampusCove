<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import type { Room } from '@colyseus/sdk'
import {
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  type CharacterCosmeticsState,
} from '../api/characterCosmetics'
import { getStoredAuth, clearAuth } from '../api/auth'
import { buyHousingUnit, fetchHousingUnits, rentHousingUnit, renewHousingUnit } from '../api/housing'
import { buildFirstPersonHands, disposeObject3D } from '../avatar/compositeAvatar'
import { matchesRotateCCW, matchesRotateCW } from '../config/keybindings'
import GameDoorHints from '../components/game/GameDoorHints.vue'
import GameHudToolbar from '../components/game/GameHudToolbar.vue'
import GameInteractionPrompt from '../components/game/GameInteractionPrompt.vue'
import GamePlacementHud from '../components/game/GamePlacementHud.vue'
import GamePlayerHotbar from '../components/game/GamePlayerHotbar.vue'
import GamePlayerInventoryPanel from '../components/game/GamePlayerInventoryPanel.vue'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useGameMovement } from '../composables/game/useGameMovement'
import {
  buildWorldCollisionFromUrl,
  getWorldCollisionStats,
  toggleCollisionDebug,
} from '../composables/game/useWorldCollision'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import {
  formatLeaseRemaining,
  housingActionFor,
  showRenewForUnit,
  useCityHousing,
} from '../composables/game/useCityHousing'
import { getGraphicsQuality, supportsEnvironmentMap, toggleGraphicsQuality } from '../game/graphicsQuality'
import { applySceneAtmosphere, loadApartmentEnvironment, loadTownEnvironment, stripRoomEnvironmentsFromScene } from '../game/roomEnvironments'
import { TOWN } from '../game/assets/catalog'
import {
  applySharedEnvironment,
  clearSharedEnvironment,
  configureGlobalSceneLights,
  disposeSharedEnvironment,
  loadSharedEnvironmentMap,
} from '../game/sceneLighting'
import { APARTMENT_DOOR_POS, HOUSING_LOBBY_SPAWN } from '../game/gameRoomConstants'
import { housingCubeInteractPosition, syncHousingCubes } from '../game/housingCubes'

const YAW_STEP = Math.PI / 12

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roomMessage = ref<string | null>(null)
const currentRoomLabel = ref<'city' | 'apartment'>('city')
const nearApartmentDoor = ref(false)
const nearCityDoor = ref(false)
const canEditApartment = ref(false)
const visitedApartmentOwnerId = ref<number | null>(null)
const housingClaimInFlight = ref(false)
const switchingRoom = ref(false)
const pointerLocked = ref(false)
const transitioningApartment = ref(false)
const wasPointerLockedAtTransitionStart = ref(false)
const refreshMyAppearance = ref<(() => void) | null>(null)
const doorPromptPos = ref<{ x: number; y: number; key: string; action: string; detail?: string } | null>(null)
const renewPromptPos = ref<{ x: number; y: number } | null>(null)
const doorProjectionVec = new THREE.Vector3()

const realtimeHttpUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const gameRoomRef = shallowRef<Room | null>(null)

const myPosition = { x: HOUSING_LOBBY_SPAWN.x, y: HOUSING_LOBBY_SPAWN.y, z: HOUSING_LOBBY_SPAWN.z }
const positionLabel = ref(
  `${HOUSING_LOBBY_SPAWN.x.toFixed(1)}, ${HOUSING_LOBBY_SPAWN.y.toFixed(1)}, ${HOUSING_LOBBY_SPAWN.z.toFixed(1)}`,
)
const direction = new THREE.Vector3(0, 0, -1)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let roomEnvironment: THREE.Group | null = null
let housingCubesGroup: THREE.Group | null = null
let roomEnvironmentLoadToken = 0
let fpHands: THREE.Group | null = null

const myAccountId = computed(() => getStoredAuth()?.user.account_id ?? null)

const {
  units: housingUnits,
  nearbyUnit: nearbyHousingUnit,
  applyUnits: applyHousingUnits,
} = useCityHousing(myAccountId)

function syncCityHousingCubes(): void {
  if (!housingCubesGroup) return
  syncHousingCubes(housingCubesGroup, housingUnits.value)
}

function onHousingUnitsFromServer(units: import('../types/gameRealtime').HousingUnitPayload[]): void {
  applyHousingUnits(units)
  if (currentRoomLabel.value === 'city') {
    syncCityHousingCubes()
  }
}

let apartmentPlacementRef: ReturnType<typeof useApartmentPlacement> | null = null

let getInventoryOpen: () => boolean = () => false
let runRefreshApartmentInventory: () => void = () => {}

const {
  apartmentObjectCount,
  apartmentObjectIds,
  selectedPlacedObjectId,
  detachForRoomSwitch,
  clearPersistTimers,
  clearApartmentObjects,
  ensureApartmentObjectsFromServer,
  upsertApartmentObjectFromRemote,
  removeApartmentObjectMesh,
  persistApartmentTransformForMesh,
  getApartmentObjectMesh,
} = useApartmentObjects({
  getScene: () => scene,
  getGameRoom: () => gameRoomRef.value,
  currentRoomLabel,
  onApartmentObjectMeshUpserted: (mesh) => {
    const id = typeof mesh.userData.apartmentObjectId === 'string' ? mesh.userData.apartmentObjectId : ''
    if (id) apartmentPlacementRef?.registerApartmentProp(id, mesh)
  },
  onApartmentObjectMeshRemoved: (objectId) => {
    apartmentPlacementRef?.unregisterApartmentProp(objectId)
  },
  onApartmentObjectRemovedNotify: (objectId) => {
    apartmentPlacementRef?.notifyPropRemovedFromWorld(objectId)
  },
})

const apartmentPlacement = useApartmentPlacement({
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getColyseusRoom: () => gameRoomRef.value,
  getApartmentObjectMesh,
  getApartmentInventoryOpen: () => getInventoryOpen(),
  currentRoomLabel,
  pointerLocked,
  canEditApartment,
  persistApartmentTransformForMesh,
  refreshApartmentInventory: () => runRefreshApartmentInventory(),
})

apartmentPlacementRef = apartmentPlacement

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
  tryExitApartmentAtDoor,
  enterApartment,
  pickupToHotbar,
} = usePlayerInventory({
  gameRoomRef,
  currentRoomLabel,
  canEditApartment,
  myPosition,
  direction,
  selectedPlacedObjectId,
  attachSelectedPlacedObject: () => undefined,
  startPlacementPreview: (itemDef, ownedCountRef) => {
    apartmentPlacement.startPreviewNew(itemDef, ownedCountRef)
  },
  cancelPlacementPreview: () => apartmentPlacement.cancelPreview(),
})

getInventoryOpen = () => inventoryOpen.value
runRefreshApartmentInventory = refreshOwnedItems

const placementHudHints = computed(() => apartmentPlacement.hudHints.value)

const placementPreviewActive = computed(
  () =>
    apartmentPlacement.currentState.value.kind === 'preview_new' ||
    apartmentPlacement.currentState.value.kind === 'preview_existing',
)

const graphicsQuality = ref(getGraphicsQuality())
const graphicsQualityLabel = computed(() => (graphicsQuality.value === 'low' ? 'Low' : 'High'))

function onToggleGraphicsQuality(event: MouseEvent): void {
  event.stopPropagation()
  toggleGraphicsQuality()
  window.location.reload()
}

function hexStringToNumber(hex: string): number {
  return parseInt(hex.length === 7 ? hex.slice(1) : hex, 16)
}

async function loadCosmeticsState(): Promise<CharacterCosmeticsState> {
  try {
    return await fetchCharacterCosmetics()
  } catch {
    return {
      slots: emptyCosmeticLoadout(),
      colors: defaultCosmeticColors(),
    }
  }
}

async function tryRenewNearbyRent(): Promise<void> {
  if (currentRoomLabel.value !== 'city' || housingClaimInFlight.value) return
  const unit = nearbyHousingUnit.value
  if (!unit || !showRenewForUnit(unit, myAccountId.value)) return
  housingClaimInFlight.value = true
  roomMessage.value = null
  try {
    await renewHousingUnit(unit.public_id)
    gameRoomRef.value?.send('housing_refresh')
  } catch (err) {
    roomMessage.value = err instanceof Error ? err.message : 'Could not renew lease.'
  } finally {
    housingClaimInFlight.value = false
  }
}

async function onNearHousingInteract(): Promise<void> {
  if (!getStoredAuth() || !gameRoomRef.value || housingClaimInFlight.value) return
  const unit = nearbyHousingUnit.value
  if (!unit) return
  const action = housingActionFor(unit, myAccountId.value)
  if (!action) return

  if (action === 'buy' || action === 'rent') {
    housingClaimInFlight.value = true
    roomMessage.value = null
    try {
      if (action === 'buy') {
        await buyHousingUnit(unit.public_id)
      } else {
        await rentHousingUnit(unit.public_id)
      }
      gameRoomRef.value.send('housing_refresh')
    } catch (err) {
      roomMessage.value = err instanceof Error ? err.message : 'Housing claim failed.'
    } finally {
      housingClaimInFlight.value = false
    }
    return
  }

  if (action === 'enter' || action === 'visit') {
    const ownerId = unit.occupant_account_id
    if (ownerId === null) return
    transitioningApartment.value = true
    wasPointerLockedAtTransitionStart.value = pointerLocked.value
    void enterApartment(ownerId, unit.template_key)
  }
}

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (currentRoomLabel.value === 'city' && e.code === 'KeyU' && !e.repeat) {
    void tryRenewNearbyRent()
    return true
  }
  if (e.code === 'KeyC' && !e.repeat) {
    const on = toggleCollisionDebug(scene)
    const s = getWorldCollisionStats()
    console.info(
      `[collision] debug ${on ? 'ON' : 'OFF'} — ${s.cuboids} cuboids, mode=${s.mode ?? 'n/a'}`,
    )
    return true
  }
  if (currentRoomLabel.value !== 'apartment') return false
  if (e.code === 'Escape' && !e.repeat) {
    if (apartmentPlacement.currentState.value.kind !== 'idle') {
      apartmentPlacement.cancelPreview()
      return true
    }
    return false
  }
  if (matchesRotateCW(e) && !e.repeat) {
    if (apartmentPlacement.currentState.value.kind !== 'idle') {
      apartmentPlacement.stepRotate(YAW_STEP)
      return true
    }
    return false
  }
  if (matchesRotateCCW(e) && !e.repeat) {
    if (apartmentPlacement.currentState.value.kind !== 'idle') {
      apartmentPlacement.stepRotate(-YAW_STEP)
      return true
    }
    return false
  }
  return false
}

function projectWorldToScreen(wx: number, wy: number, wz: number): { x: number; y: number } | null {
  if (!camera || !canvasRef.value) return null
  doorProjectionVec.set(wx, wy, wz)
  doorProjectionVec.project(camera)
  if (doorProjectionVec.z > 1) return null
  const rect = canvasRef.value.getBoundingClientRect()
  return {
    x: (doorProjectionVec.x * 0.5 + 0.5) * rect.width,
    y: (-doorProjectionVec.y * 0.5 + 0.5) * rect.height,
  }
}

function updateDoorPromptScreenPos(): void {
  if (!camera || !canvasRef.value) {
    doorPromptPos.value = null
    renewPromptPos.value = null
    return
  }
  const inApartment = currentRoomLabel.value === 'apartment'
  const isNear = inApartment ? nearApartmentDoor.value : nearCityDoor.value
  if (!isNear || inventoryOpen.value || housingClaimInFlight.value) {
    doorPromptPos.value = null
    renewPromptPos.value = null
    return
  }

  if (inApartment) {
    const screen = projectWorldToScreen(APARTMENT_DOOR_POS.x, 1.5, APARTMENT_DOOR_POS.z)
    if (!screen) {
      doorPromptPos.value = null
      renewPromptPos.value = null
      return
    }
    doorPromptPos.value = { ...screen, key: 'I', action: 'Exit' }
    renewPromptPos.value = null
    return
  }

  const unit = nearbyHousingUnit.value
  if (!unit) {
    doorPromptPos.value = null
    renewPromptPos.value = null
    return
  }
  const action = housingActionFor(unit, myAccountId.value)
  const interactPos = housingCubeInteractPosition(unit)
  const screen = projectWorldToScreen(interactPos.x, interactPos.y, interactPos.z)
  if (!screen || !action) {
    doorPromptPos.value = null
    renewPromptPos.value = null
    return
  }

  let actionLabel = 'Enter'
  let detail: string | undefined
  if (action === 'buy') {
    actionLabel = 'Buy'
    detail = `${unit.price_coins.toLocaleString()} coins`
  } else if (action === 'rent') {
    actionLabel = 'Rent'
    detail = `${unit.price_coins.toLocaleString()} coins · ${unit.rent_duration_hours}h`
  } else if (action === 'visit') {
    actionLabel = 'Visit'
  } else if (action === 'enter') {
    actionLabel = 'Enter'
    const leaseDetail = formatLeaseRemaining(unit)
    if (leaseDetail) detail = leaseDetail
  }

  doorPromptPos.value = { ...screen, key: 'I', action: actionLabel, detail }

  if (showRenewForUnit(unit, myAccountId.value)) {
    renewPromptPos.value = { x: screen.x + 72, y: screen.y }
  } else {
    renewPromptPos.value = null
  }
}

/** House asset key for an apartment template ('housing_<unit_id>'), via the unit's model_key. */
function houseKeyForTemplate(templateKey: string | undefined): string | null {
  if (!templateKey) return null
  return housingUnits.value.find((u) => u.template_key === templateKey)?.model_key ?? null
}

function setRoomEnvironment(kind: 'city' | 'apartment', templateKey?: string) {
  const token = ++roomEnvironmentLoadToken
  if (kind === 'city') {
    apartmentPlacement.setPlayerInsideApartment(false)
  }
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    if (!roomEnvironment.userData.isPersistentEnvironment) {
      disposeObject3D(roomEnvironment)
    }
    roomEnvironment = null
  }
  applySceneAtmosphere(scene, kind, renderer)
  if (kind === 'city') {
    canEditApartment.value = false
    visitedApartmentOwnerId.value = null
    stripRoomEnvironmentsFromScene(scene)
    myPosition.x = HOUSING_LOBBY_SPAWN.x
    myPosition.y = HOUSING_LOBBY_SPAWN.y
    myPosition.z = HOUSING_LOBBY_SPAWN.z
    nearApartmentDoor.value = false
    resetClientStateForCityWorld()
    clearApartmentObjects()
    void buildWorldCollisionFromUrl(TOWN.collisionUrl).catch((err) => {
      console.warn('[collision] town collision failed', err)
    })
    // Town map + the 10 house exteriors (assets/town, assets/houses). Legacy units without a
    // model_key still get a placeholder cube.
    void loadTownEnvironment()
      .then(({ group }) => {
        if (token !== roomEnvironmentLoadToken) return
        roomEnvironment = group
        if (!housingCubesGroup) {
          housingCubesGroup = new THREE.Group()
          housingCubesGroup.name = 'HousingCubes'
        }
        if (housingCubesGroup.parent !== group) {
          group.add(housingCubesGroup)
        }
        syncCityHousingCubes()
        scene.add(group)
      })
      .catch((err) => {
        console.error('[town] load failed', err)
        roomMessage.value = 'Could not load the town.'
      })
  } else {
    void loadApartmentEnvironment(houseKeyForTemplate(templateKey)).then((built) => {
      if (token !== roomEnvironmentLoadToken) return
      roomEnvironment = built.group
      scene.add(roomEnvironment)
      apartmentPlacement.registerApartmentEnvironment(built)
      void buildWorldCollisionFromUrl(built.house.interiorCollisionUrl).catch((err) => {
        console.warn('[collision] house collision failed', err)
      })
      nearCityDoor.value = false
      void apartmentPlacement.init({
        scene,
        camera,
        renderer,
        colyseusRoom: gameRoomRef,
      })
    })
  }
}

const {
  containerSize,
  onKeyDown,
  onKeyUp,
  onMouseMove,
  onPointerLockChange,
  onResize,
  requestPointerLock,
  onVisibilityOrFocus,
  startRenderLoop,
  stopRenderLoop,
  onCanvasMouseDown,
  onCanvasMouseUp,
} = useGameMovement({
  pointerLocked,
  myPosition,
  direction,
  canvasRef,
  containerRef,
  gameRoomRef,
  currentRoomLabel,
  inventoryOpen,
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getFpHands: () => fpHands,
  refreshMyAppearance,
  onNearApartmentDoorInteract: async () => {
    if (!gameRoomRef.value) return
    apartmentPlacement.cancelPreview()
    transitioningApartment.value = true
    wasPointerLockedAtTransitionStart.value = pointerLocked.value
    await tryExitApartmentAtDoor(nearApartmentDoor.value)
  },
  onNearHousingInteract: () => {
    void onNearHousingInteract()
  },
  onToggleInventory: () => toggleInventory(),
  onHotbarDigit: (index: number) => {
    selectHotbarIndex(index)
  },
  nearApartmentDoor,
  nearCityDoor,
  housingUnits,
  nearbyHousingUnit,
  handleExtraKeyDown,
  onCanvasMouseDown: (e) => {
    apartmentPlacement.onPointerDown(e)
  },
  onCanvasMouseUp: () => undefined,
  onBeforeRender: (dt) => {
    positionLabel.value = `${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)}`
    if (currentRoomLabel.value === 'apartment') {
      apartmentPlacement.tick(dt)
    }
    updateDoorPromptScreenPos()
  },
})

watch(inventoryOpen, (open) => {
  if (open) {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    return
  }
  if (!document.pointerLockElement) {
    requestPointerLock()
  }
})

const { connectRealtime, clearRemoteUsers } = useGameRealtime({
  router,
  realtimeHttpUrl,
  gameRoomRef,
  getScene: () => scene,
  camera: () => camera,
  currentRoomLabel,
  myPosition,
  roomMessage,
  switchingRoom,
  transitioningApartment,
  wasPointerLockedAtTransitionStart,
  refreshMyAppearance,
  getCanvas: () => canvasRef.value,
  requestPointerLock,
  pickupCodeToHotbar: pickupToHotbar,
  inventoryLoading,
  inventoryError,
  applyServerInventoryPayload,
  selectedPlacedObjectId,
  apartment: {
    detachForRoomSwitch,
    ensureApartmentObjectsFromServer,
    attachSelectedPlacedObject: () => undefined,
    clearApartmentObjects,
    upsertApartmentObjectFromRemote,
    removeApartmentObjectMesh,
  },
  setRoomEnvironment,
  canEditApartment,
  visitedApartmentOwnerId,
  onHousingUnitsSync: onHousingUnitsFromServer,
  onApartmentActionErrorBanner: () => {
    apartmentPlacement.onApartmentActionError()
  },
})

function logout() {
  clearAuth()
  void gameRoomRef.value?.leave()
  router.push({ name: 'landing' })
}

function initThree(accentColor: number) {
  if (!canvasRef.value) return
  const isLowQuality = getGraphicsQuality() === 'low'

  scene = new THREE.Scene()
  const { w, h } = containerSize()
  const aspect = w / h
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, isLowQuality ? 300 : 1000)
  camera.position.set(HOUSING_LOBBY_SPAWN.x, HOUSING_LOBBY_SPAWN.y, HOUSING_LOBBY_SPAWN.z)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: !isLowQuality })
  renderer.setSize(w, h)
  renderer.setPixelRatio(isLowQuality ? 1 : Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = !isLowQuality
  if (!isLowQuality) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  applySceneAtmosphere(scene, 'city', renderer)

  const ambient = new THREE.AmbientLight(0xb0a89e, 0.15)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 1.0)
  dir.position.set(10, 20, 10)
  if (!isLowQuality) {
    dir.castShadow = true
    dir.shadow.mapSize.set(1024, 1024)
  }
  scene.add(dir)
  configureGlobalSceneLights(ambient, dir)

  if (supportsEnvironmentMap()) {
    void loadSharedEnvironmentMap(renderer).then((envMap) => {
      applySharedEnvironment(scene, envMap)
    })
  } else {
    clearSharedEnvironment(scene)
  }

  setRoomEnvironment('city')

  fpHands = buildFirstPersonHands(accentColor)
  fpHands.visible = false
  camera.add(fpHands)
}

async function bootGame() {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }
  const state = await loadCosmeticsState()
  const bodyTint = hexStringToNumber(state.colors.body)
  initThree(bodyTint)
  await connectRealtime(state)
  try {
    const housing = await fetchHousingUnits()
    onHousingUnitsFromServer(housing.units)
  } catch {
    /* socket init / housing_units_sync still populate cubes */
  }
  await loadLayoutFromServer()
  refreshOwnedItems()
  startRenderLoop()
}

onMounted(() => {
  void bootGame()
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', onVisibilityOrFocus)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('pagehide', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibilityOrFocus)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
})

function onBeforeUnload() {
  void gameRoomRef.value?.leave()
}

onUnmounted(() => {
  stopRenderLoop()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('focus', onVisibilityOrFocus)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('pagehide', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibilityOrFocus)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  refreshMyAppearance.value = null
  void gameRoomRef.value?.leave()
  clearPersistTimers()
  clearRemoteUsers()
  apartmentPlacement.dispose()
  clearApartmentObjects()
  housingCubesGroup = null
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    if (!roomEnvironment.userData.isPersistentEnvironment) {
      disposeObject3D(roomEnvironment)
    }
    roomEnvironment = null
  }
  if (fpHands) {
    camera.remove(fpHands)
    disposeObject3D(fpHands)
    fpHands = null
  }
  disposeSharedEnvironment()
  renderer?.dispose()
})

const crosshairClass = computed(() => {
  if (!placementPreviewActive.value) return 'border-white/90 bg-white/25'
  if (apartmentPlacement.crosshairTint.value === 'invalid') return 'border-rose-400/80 bg-rose-500/35'
  if (apartmentPlacement.crosshairTint.value === 'valid') return 'border-emerald-400/80 bg-emerald-400/30'
  return 'border-white/90 bg-white/25'
})
</script>

<template>
  <div ref="containerRef" class="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
    <canvas
      ref="canvasRef"
      class="block min-h-0 w-full flex-1 cursor-crosshair"
      @click="requestPointerLock"
      @mousedown="onCanvasMouseDown"
      @mouseup="onCanvasMouseUp"
      @contextmenu.prevent
    />
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors duration-150"
      :class="crosshairClass"
    />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameHudToolbar
      :current-room-label="currentRoomLabel"
      :apartment-object-count="apartmentObjectCount"
      :position-label="positionLabel"
    >
      <button
        v-if="!pointerLocked"
        type="button"
        class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click.stop="onToggleGraphicsQuality"
        @mousedown.stop
      >
        Graphics: {{ graphicsQualityLabel }}
      </button>
    </GameHudToolbar>
    <GameInteractionPrompt
      v-if="doorPromptPos"
      :screen-x="doorPromptPos.x"
      :screen-y="doorPromptPos.y"
      :key-label="doorPromptPos.key"
      :action-label="doorPromptPos.action"
      :detail-label="doorPromptPos.detail"
    />
    <GameInteractionPrompt
      v-if="renewPromptPos"
      :screen-x="renewPromptPos.x"
      :screen-y="renewPromptPos.y"
      key-label="U"
      action-label="Renew"
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
      v-show="!pointerLocked && !inventoryOpen && !transitioningApartment && !switchingRoom"
      @request-pointer-lock="requestPointerLock"
      @logout="logout"
    />
    <div v-show="pointerLocked" class="absolute right-3 top-3">
      <button
        type="button"
        class="rounded-md border border-white/30 bg-transparent px-3 py-1.5 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="logout"
      >
        Logout
      </button>
    </div>
    <p
      v-if="currentRoomLabel === 'apartment' && inventoryOpen && placementPreviewActive"
      class="pointer-events-none absolute bottom-24 left-3 z-10 max-w-md text-[10px] leading-snug text-white/70 md:left-[22rem]"
    >
      R = rotate · Shift+R = reverse · LMB = place / pick · RMB = cancel · Esc / E = cancel
    </p>
    <GameDoorHints :inventory-open="inventoryOpen" />
  </div>
</template>
