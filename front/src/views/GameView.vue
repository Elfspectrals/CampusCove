<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import type { Room } from '@colyseus/sdk'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  type CharacterCosmeticsState,
} from '../api/characterCosmetics'
import { getStoredAuth, clearAuth } from '../api/auth'
import { buildFirstPersonHands, disposeObject3D } from '../avatar/compositeAvatar'
import GameApartmentInventoryPanel from '../components/game/GameApartmentInventoryPanel.vue'
import GameDoorHints from '../components/game/GameDoorHints.vue'
import GameHudToolbar from '../components/game/GameHudToolbar.vue'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import { useApartmentInventory } from '../composables/game/useApartmentInventory'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { applySceneAtmosphere, buildApartmentEnvironment, buildCityEnvironment } from '../game/roomEnvironments'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roomMessage = ref<string | null>(null)
const currentRoomLabel = ref<'city' | 'apartment'>('city')
const nearApartmentDoor = ref(false)
const nearCityDoor = ref(false)
const editorEnabled = ref(false)
const transformMode = ref<'translate' | 'rotate'>('translate')
const switchingRoom = ref(false)

const realtimeHttpUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const gameRoomRef = shallowRef<Room | null>(null)

const myPosition = { x: 0, y: 1.6, z: 0 }
const direction = new THREE.Vector3(0, 0, -1)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let roomEnvironment: THREE.Group | null = null
let fpHands: THREE.Group | null = null
let transformControls: TransformControls | null = null
let transformControlsHelper: THREE.Object3D | null = null

const {
  apartmentObjectCount,
  apartmentObjectIds,
  selectedPlacedObjectId,
  registerTransformPersistListeners,
  detachForRoomSwitch,
  clearPersistTimers,
  clearApartmentObjects,
  ensureApartmentObjectsFromServer,
  attachSelectedPlacedObject,
  upsertApartmentObjectFromRemote,
  removeApartmentObjectMesh,
} = useApartmentObjects({
  getScene: () => scene,
  getTransformControls: () => transformControls,
  getTransformControlsHelper: () => transformControlsHelper,
  getGameRoom: () => gameRoomRef.value,
  currentRoomLabel,
})

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
  spawnSelectedInventoryAsset,
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
  attachSelectedPlacedObject,
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

function setRoomEnvironment(kind: 'city' | 'apartment') {
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeObject3D(roomEnvironment)
    roomEnvironment = null
  }
  applySceneAtmosphere(scene, kind)
  roomEnvironment = kind === 'city' ? buildCityEnvironment() : buildApartmentEnvironment()
  scene.add(roomEnvironment)
  if (kind === 'city') {
    nearApartmentDoor.value = false
    setEditorEnabled(false)
    clearApartmentObjects()
    resetClientStateForCityWorld()
  } else {
    nearCityDoor.value = false
  }
}

function setEditorEnabled(value: boolean) {
  editorEnabled.value = value
  if (transformControls) {
    transformControls.enabled = value && !pointerLocked.value
    if (transformControlsHelper) transformControlsHelper.visible = value
    if (!value) {
      transformControls.detach()
    }
  }
}

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
  editorEnabled,
  getTransformControls: () => transformControls,
  getTransformControlsHelper: () => transformControlsHelper,
  apartmentInventoryLoading,
  apartmentInventoryError,
  apartmentInventoryOpen,
  apartmentInventory,
  normalizeInventoryAndHotbarSelection,
  selectedPlacedObjectId,
  apartment: {
    detachForRoomSwitch,
    ensureApartmentObjectsFromServer,
    attachSelectedPlacedObject,
    clearApartmentObjects,
    upsertApartmentObjectFromRemote,
    removeApartmentObjectMesh,
  },
  setRoomEnvironment,
  setEditorEnabled,
})

const {
  pointerLocked,
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
} = useGameMovement({
  myPosition,
  direction,
  canvasRef,
  containerRef,
  gameRoomRef,
  currentRoomLabel,
  apartmentInventoryOpen,
  editorEnabled,
  nearApartmentDoor,
  nearCityDoor,
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getFpHands: () => fpHands,
  getTransformControls: () => transformControls,
  refreshMyAppearance,
  onNearApartmentDoorInteract: async () => {
    await tryExitApartmentAtDoor(nearApartmentDoor.value)
  },
  onNearCityDoorInteract: () => {
    tryEnterApartmentAtDoor(nearCityDoor.value)
  },
  onToggleApartmentInventory: () => toggleApartmentInventory(),
  onHotbarDigit: (index: number) => {
    if (index < 0 || index > 8) return
    selectedHotbarIndex.value = index
    const code = hotbarSlots.value[index]
    if (code) {
      selectedInventoryObjectKey.value = code
    }
  },
})

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

  transformControls = new TransformControls(camera, renderer.domElement)
  transformControls.setMode('translate')
  transformControlsHelper = transformControls.getHelper()
  transformControlsHelper.visible = false
  registerTransformPersistListeners(transformControls)
  scene.add(transformControlsHelper)
}

function toggleEditor() {
  if (currentRoomLabel.value !== 'apartment') return
  const next = !editorEnabled.value
  if (next && document.pointerLockElement) {
    document.exitPointerLock()
  }
  setEditorEnabled(next)
  if (transformControls) {
    if (transformControlsHelper) transformControlsHelper.visible = editorEnabled.value
    if (!transformControls.object) attachSelectedPlacedObject()
  }
}

function setTransformMode(mode: 'translate' | 'rotate') {
  transformMode.value = mode
  if (!transformControls) return
  transformControls.setMode(mode)
}

function logout() {
  clearAuth()
  void gameRoomRef.value?.leave()
  router.push({ name: 'landing' })
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
  clearApartmentObjects()
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeObject3D(roomEnvironment)
    roomEnvironment = null
  }
  if (transformControls) {
    transformControls.dispose()
    transformControls = null
  }
  if (transformControlsHelper) {
    scene.remove(transformControlsHelper)
    disposeObject3D(transformControlsHelper)
    transformControlsHelper = null
  }
  if (fpHands) {
    camera.remove(fpHands)
    disposeObject3D(fpHands)
    fpHands = null
  }
  renderer?.dispose()
})
</script>

<template>
  <div ref="containerRef" class="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
    <canvas ref="canvasRef" class="block min-h-0 w-full flex-1 cursor-crosshair" @click="requestPointerLock" />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameHudToolbar
      :current-room-label="currentRoomLabel"
      :apartment-object-count="apartmentObjectCount"
      :editor-enabled="editorEnabled"
      @toggle-editor="toggleEditor"
      @set-transform-mode="setTransformMode"
    />
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
      @refresh-apartment-inventory="refreshApartmentInventory"
      @select-inventory-item="selectInventoryItem"
      @spawn-selected-inventory-asset="spawnSelectedInventoryAsset"
      @pickup-selected-placed-object="pickupSelectedPlacedObject"
      @placed-object-selected="onPlacedObjectSelected"
      @on-hotbar-slot-click="onHotbarSlotClick"
      @clear-hotbar-slot="clearHotbarSlot"
    />
    <GamePointerLockOverlay
      v-show="!pointerLocked && !editorEnabled && !apartmentInventoryOpen"
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
    <GameDoorHints
      :current-room-label="currentRoomLabel"
      :near-apartment-door="nearApartmentDoor"
      :near-city-door="nearCityDoor"
      :apartment-inventory-open="apartmentInventoryOpen"
    />
  </div>
</template>
