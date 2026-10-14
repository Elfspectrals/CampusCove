<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import type { Room } from '@colyseus/sdk'
import { clearAuth, getStoredAuth } from '../api/auth'
import { buildFirstPersonHands, disposeObject3D } from '../avatar/compositeAvatar'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import { useGameMovement } from '../composables/game/useGameMovement'
import { buildWorldCollisionFromUrl } from '../composables/game/useWorldCollision'
import { PARIS_MAP_SPAWN } from '../game/gameRoomConstants'
import { getGraphicsQuality, supportsEnvironmentMap } from '../game/graphicsQuality'
import { applySceneAtmosphere, loadLobbyEnvironment } from '../game/roomEnvironments'
import {
  applySharedEnvironment,
  clearSharedEnvironment,
  configureGlobalSceneLights,
  disposeSharedEnvironment,
  loadSharedEnvironmentMap,
} from '../game/sceneLighting'
import type { HousingUnitSnapshot } from '../game/housingCubes'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roomMessage = ref<string | null>(null)
const currentRoomLabel = ref<'city' | 'apartment'>('city')
const nearApartmentDoor = ref(false)
const nearCityDoor = ref(false)
const inventoryOpen = ref(false)
const refreshMyAppearance = ref<(() => void) | null>(null)
const gameRoomRef = shallowRef<Room | null>(null)
const housingUnits = ref<HousingUnitSnapshot[]>([])
const nearbyHousingUnit = ref<HousingUnitSnapshot | null>(null)

const myPosition = { x: PARIS_MAP_SPAWN.x, y: PARIS_MAP_SPAWN.y, z: PARIS_MAP_SPAWN.z }
const direction = new THREE.Vector3(0, 0, -1)
const positionLabel = ref(
  `${PARIS_MAP_SPAWN.x.toFixed(1)}, ${PARIS_MAP_SPAWN.y.toFixed(1)}, ${PARIS_MAP_SPAWN.z.toFixed(1)}`,
)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let roomEnvironment: THREE.Group | null = null
let fpHands: THREE.Group | null = null

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
  inventoryOpen,
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getFpHands: () => fpHands,
  refreshMyAppearance,
  onNearApartmentDoorInteract: async () => undefined,
  onNearHousingInteract: () => undefined,
  onToggleInventory: () => undefined,
  onHotbarDigit: () => undefined,
  nearApartmentDoor,
  nearCityDoor,
  housingUnits,
  nearbyHousingUnit,
  onBeforeRender: () => {
    positionLabel.value = `${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)}`
  },
})

function logout() {
  clearAuth()
  router.push({ name: 'landing' })
}

function initThree(accentColor: number) {
  const isLowQuality = getGraphicsQuality() === 'low'
  scene = new THREE.Scene()
  const { w, h } = containerSize()
  camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000)
  camera.position.set(PARIS_MAP_SPAWN.x, PARIS_MAP_SPAWN.y, PARIS_MAP_SPAWN.z)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value!, antialias: !isLowQuality })
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

  void loadLobbyEnvironment()
    .then((group) => {
      roomEnvironment = group
      scene.add(group)
    })
    .catch((err) => {
      console.error('[map-paris] LobbyMap load failed', err)
      roomMessage.value = 'Could not load Paris map.'
    })

  void buildWorldCollisionFromUrl('/maps/LobbyMap.collision.json?v=4').catch((err) => {
    console.warn('[map-paris] collision load failed', err)
  })

  fpHands = buildFirstPersonHands(accentColor)
  fpHands.visible = false
  camera.add(fpHands)
}

async function boot() {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }
  initThree(0x8b7aa8)
  startRenderLoop()
}

onMounted(() => {
  void boot()
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', onVisibilityOrFocus)
  document.addEventListener('visibilitychange', onVisibilityOrFocus)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  stopRenderLoop()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('focus', onVisibilityOrFocus)
  document.removeEventListener('visibilitychange', onVisibilityOrFocus)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  refreshMyAppearance.value = null
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
  clearSharedEnvironment(scene)
  disposeSharedEnvironment()
  renderer?.dispose()
})
</script>

<template>
  <div ref="containerRef" class="relative h-dvh w-full overflow-hidden bg-[#0a0a12]">
    <canvas
      ref="canvasRef"
      class="block h-full w-full"
      @click="requestPointerLock"
    />
    <p
      class="pointer-events-none absolute left-3 top-3 m-0 rounded bg-black/50 px-2 py-1 font-mono text-xs text-white/80"
    >
      {{ positionLabel }}
    </p>
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GamePointerLockOverlay
      v-if="!pointerLocked"
      @request-pointer-lock="requestPointerLock"
      @logout="logout"
    />
  </div>
</template>
