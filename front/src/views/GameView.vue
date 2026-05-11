<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
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
import GameApartmentInventoryPanel from '../components/game/GameApartmentInventoryPanel.vue'
import GameDoorHints from '../components/game/GameDoorHints.vue'
import GameHudToolbar from '../components/game/GameHudToolbar.vue'
import GamePlacementHud from '../components/game/GamePlacementHud.vue'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import { useApartmentInventory } from '../composables/game/useApartmentInventory'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { applySceneAtmosphere, buildApartmentEnvironment, buildCityEnvironment } from '../game/roomEnvironments'

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

let getApartmentInventoryOpen: () => boolean = () => false
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
  getApartmentInventoryOpen: () => getApartmentInventoryOpen(),
  currentRoomLabel,
  pointerLocked,
  persistApartmentTransformForMesh,
  refreshApartmentInventory: () => runRefreshApartmentInventory(),
})

apartmentPlacementRef = apartmentPlacement

const {
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
  onHotbarSlotClick,
  clearHotbarSlot,
  pickupSelectedPlacedObject,
  onPlacedObjectSelected,
  refreshApartmentInventory,
  toggleApartmentInventory,
  tryExitApartmentAtDoor,
  tryEnterApartmentAtDoor,
} = useApartmentInventory({
  gameRoomRef,
  currentRoomLabel,
  myPosition,
  direction,
  selectedPlacedObjectId,
  attachSelectedPlacedObject: () => undefined,
  startPlacementPreview: (itemDef, ownedCountRef) => {
    apartmentPlacement.startPreviewNew(itemDef, ownedCountRef)
  },
})

getApartmentInventoryOpen = () => apartmentInventoryOpen.value
runRefreshApartmentInventory = refreshApartmentInventory

const placementHudHints = computed(() => apartmentPlacement.hudHints.value)

const placementPreviewActive = computed(
  () =>
    apartmentPlacement.currentState.value.kind === 'preview_new' ||
    apartmentPlacement.currentState.value.kind === 'preview_existing',
)

const { connectRealtime, clearRemoteUsers, refreshMyAppearance } = useGameRealtime({
  router,
  realtimeHttpUrl,
  gameRoomRef,
  getScene: () => scene,
  camera: () => camera,
  currentRoomLabel,
  myPosition,
  roomMessage,
  switchingRoom,
  apartmentInventoryLoading,
  apartmentInventoryError,
  apartmentInventoryOpen,
  apartmentInventory,
  normalizeInventoryAndHotbarSelection,
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

function toggleApartmentInventoryWrapped(): void {
  toggleApartmentInventory()
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
  apartmentInventoryOpen,
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getFpHands: () => fpHands,
  refreshMyAppearance,
  onNearApartmentDoorInteract: async () => {
    apartmentPlacement.cancelPreview()
    await tryExitApartmentAtDoor(nearApartmentDoor.value)
  },
  onNearCityDoorInteract: () => {
    tryEnterApartmentAtDoor(nearCityDoor.value)
  },
  onToggleApartmentInventory: () => toggleApartmentInventoryWrapped(),
  onHotbarDigit: (index: number) => {
    if (index < 0 || index > 8) return
    selectedHotbarIndex.value = index
    const code = hotbarSlots.value[index]
    if (code) {
      selectInventoryItem(code)
    }
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
    <GamePlacementHud :visible="placementPreviewActive" :hints="placementHudHints" />
    <GameApartmentInventoryPanel
      v-if="currentRoomLabel === 'apartment' && apartmentInventoryOpen"
      :apartment-inventory="apartmentInventory"
      :apartment-inventory-loading="apartmentInventoryLoading"
      :apartment-inventory-error="apartmentInventoryError"
      :selected-inventory-object-key="selectedInventoryObjectKey"
      :selected-placed-object-id="selectedPlacedObjectId"
      :apartment-object-ids="apartmentObjectIds"
      :selected-inventory-item="selectedInventoryItem"
      :can-spawn-selected-inventory-item="canSpawnSelectedInventoryItem"
      :hotbar-slots="hotbarSlots"
      :selected-hotbar-index="selectedHotbarIndex"
      :placement-preview-active="placementPreviewActive"
      @refresh-apartment-inventory="refreshApartmentInventory"
      @select-inventory-item="selectInventoryItem"
      @pickup-selected-placed-object="pickupSelectedPlacedObject"
      @placed-object-selected="onPlacedObjectSelected"
      @on-hotbar-slot-click="onHotbarSlotClick"
      @clear-hotbar-slot="clearHotbarSlot"
    />
    <GamePointerLockOverlay
      v-show="!pointerLocked && !apartmentInventoryOpen"
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
      v-if="currentRoomLabel === 'apartment' && apartmentInventoryOpen && placementPreviewActive"
      class="pointer-events-none absolute bottom-24 left-3 z-10 max-w-md text-[10px] leading-snug text-white/70 md:left-[22rem]"
    >
      R = rotate · Shift+R = reverse · LMB = place / pick · RMB = cancel · Esc / E = cancel
    </p>
    <GameDoorHints
      :current-room-label="currentRoomLabel"
      :near-apartment-door="nearApartmentDoor"
      :near-city-door="nearCityDoor"
      :apartment-inventory-open="apartmentInventoryOpen"
    />
  </div>
</template>
