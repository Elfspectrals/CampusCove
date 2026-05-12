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
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import { applySceneAtmosphere, buildApartmentEnvironment, buildCityEnvironment } from '../game/roomEnvironments'
import { APARTMENT_DOOR_POS, CITY_BUILDING_DOOR_POS } from '../game/gameRoomConstants'

const YAW_STEP = Math.PI / 12

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roomMessage = ref<string | null>(null)
const currentRoomLabel = ref<'city' | 'apartment'>('city')
const nearApartmentDoor = ref(false)
const nearCityDoor = ref(false)
const switchingRoom = ref(false)
const pointerLocked = ref(false)
const transitioningApartment = ref(false)
const wasPointerLockedAtTransitionStart = ref(false)
const refreshMyAppearance = ref<(() => void) | null>(null)
const doorPromptPos = ref<{ x: number; y: number; key: string; action: string } | null>(null)
const doorProjectionVec = new THREE.Vector3()

const realtimeHttpUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const gameRoomRef = shallowRef<Room | null>(null)

const myPosition = { x: 0, y: 1.6, z: 0 }
const direction = new THREE.Vector3(0, 0, -1)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let roomEnvironment: THREE.Group | null = null
let fpHands: THREE.Group | null = null

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
  tryEnterApartmentAtDoor,
  pickupToHotbar,
} = usePlayerInventory({
  gameRoomRef,
  currentRoomLabel,
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

function handleExtraKeyDown(e: KeyboardEvent): boolean {
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

function updateDoorPromptScreenPos(): void {
  if (!camera || !canvasRef.value) {
    doorPromptPos.value = null
    return
  }
  const inApartment = currentRoomLabel.value === 'apartment'
  const isNear = inApartment ? nearApartmentDoor.value : nearCityDoor.value
  if (!isNear || inventoryOpen.value) {
    doorPromptPos.value = null
    return
  }
  if (inApartment) {
    doorProjectionVec.set(APARTMENT_DOOR_POS.x, 1.5, APARTMENT_DOOR_POS.z)
  } else {
    doorProjectionVec.set(CITY_BUILDING_DOOR_POS.x, 1.8, CITY_BUILDING_DOOR_POS.z)
  }
  doorProjectionVec.project(camera)
  if (doorProjectionVec.z > 1) {
    doorPromptPos.value = null
    return
  }
  const rect = canvasRef.value.getBoundingClientRect()
  const sx = (doorProjectionVec.x * 0.5 + 0.5) * rect.width
  const sy = (-doorProjectionVec.y * 0.5 + 0.5) * rect.height
  doorPromptPos.value = {
    x: sx,
    y: sy,
    key: 'I',
    action: inApartment ? 'Exit' : 'Enter',
  }
}

function setRoomEnvironment(kind: 'city' | 'apartment') {
  if (kind === 'city') {
    apartmentPlacement.setPlayerInsideApartment(false)
  }
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeObject3D(roomEnvironment)
    roomEnvironment = null
  }
  applySceneAtmosphere(scene, kind)
  if (kind === 'city') {
    roomEnvironment = buildCityEnvironment()
    scene.add(roomEnvironment)
    nearApartmentDoor.value = false
    resetClientStateForCityWorld()
    clearApartmentObjects()
  } else {
    const built = buildApartmentEnvironment()
    roomEnvironment = built.group
    scene.add(roomEnvironment)
    apartmentPlacement.registerApartmentEnvironment(built)
    nearCityDoor.value = false
    void apartmentPlacement.init({
      scene,
      camera,
      renderer,
      colyseusRoom: gameRoomRef,
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
  onNearCityDoorInteract: () => {
    if (!getStoredAuth() || !gameRoomRef.value) return
    transitioningApartment.value = true
    wasPointerLockedAtTransitionStart.value = pointerLocked.value
    tryEnterApartmentAtDoor(nearCityDoor.value)
  },
  onToggleInventory: () => toggleInventory(),
  onHotbarDigit: (index: number) => {
    selectHotbarIndex(index)
  },
  nearApartmentDoor,
  nearCityDoor,
  handleExtraKeyDown,
  onCanvasMouseDown: (e) => {
    apartmentPlacement.onPointerDown(e)
  },
  onCanvasMouseUp: () => undefined,
  onBeforeRender: (dt) => {
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
  scene = new THREE.Scene()
  applySceneAtmosphere(scene, 'city')

  const { w, h } = containerSize()
  const aspect = w / h
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
  camera.position.set(0, 1.6, 0)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const ambient = new THREE.AmbientLight(0x404060, 0.6)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 0.8)
  dir.position.set(10, 20, 10)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  scene.add(dir)

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
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeObject3D(roomEnvironment)
    roomEnvironment = null
  }
  if (fpHands) {
    camera.remove(fpHands)
    disposeObject3D(fpHands)
    fpHands = null
  }
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
    <GameHudToolbar :current-room-label="currentRoomLabel" :apartment-object-count="apartmentObjectCount" />
    <GameInteractionPrompt
      v-if="doorPromptPos"
      :screen-x="doorPromptPos.x"
      :screen-y="doorPromptPos.y"
      :key-label="doorPromptPos.key"
      :action-label="doorPromptPos.action"
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
