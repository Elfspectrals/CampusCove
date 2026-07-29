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
import {
  actionBindingLabel,
  matchesAction,
  movementBindingSummary,
} from '../config/keybindings'
import GameDoorHints from '../components/game/GameDoorHints.vue'
import GameHudToolbar from '../components/game/GameHudToolbar.vue'
import GameInteractionPrompt from '../components/game/GameInteractionPrompt.vue'
import GameLobbyActivityHud from '../components/game/GameLobbyActivityHud.vue'
import GameLobbyActivityPanel from '../components/game/GameLobbyActivityPanel.vue'
import GamePlacementHud from '../components/game/GamePlacementHud.vue'
import GamePlayerHotbar from '../components/game/GamePlayerHotbar.vue'
import GamePlayerInventoryPanel from '../components/game/GamePlayerInventoryPanel.vue'
import GamePointerLockOverlay from '../components/game/GamePointerLockOverlay.vue'
import GameRoomMessageBanner from '../components/game/GameRoomMessageBanner.vue'
import GameSettingsPanel from '../components/game/GameSettingsPanel.vue'
import GameVoiceControls from '../components/game/GameVoiceControls.vue'
import { useApartmentObjects } from '../composables/game/useApartmentObjects'
import { useApartmentPlacement } from '../composables/game/useApartmentPlacement'
import { useGameMovement } from '../composables/game/useGameMovement'
import { useLobbyActivities } from '../composables/game/useLobbyActivities'
import { useProximityVoice } from '../composables/game/useProximityVoice'
import {
  buildWorldCollisionFromUrl,
  disposeWorldCollision,
  getWorldCollisionStats,
  toggleCollisionDebug,
} from '../composables/game/useWorldCollision'
import { useGameRealtime } from '../composables/game/useGameRealtime'
import { usePlayerInventory } from '../composables/game/usePlayerInventory'
import {
  createGameRenderer,
  type GameRendererPipeline,
} from '../game/gameRenderer'
import {
  cloneGameSettings,
  getGameSettings,
  type GameSettings,
} from '../game/gameSettings'
import {
  createRoomEffects,
  type RoomEffectsHandle,
} from '../game/roomEffects'
import { applySceneAtmosphere, loadApartmentEnvironment, loadLobbyEnvironment } from '../game/roomEnvironments'
import {
  applySharedEnvironment,
  clearSharedEnvironment,
  configureDirectionalShadowRig,
  configureGlobalSceneLights,
  configureRoomMeshShadows,
  disposeSharedEnvironment,
  loadSharedEnvironmentMap,
  type DirectionalShadowRig,
} from '../game/sceneLighting'
import { APARTMENT_DOOR_POS, CITY_BUILDING_DOOR_POS, CITY_SPAWN } from '../game/gameRoomConstants'

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
const activityPromptPos = ref<{ x: number; y: number; key: string; action: string } | null>(null)
const doorProjectionVec = new THREE.Vector3()
const activityProjectionVec = new THREE.Vector3()
const settingsOpen = ref(false)
const gameSettings = ref<GameSettings>(cloneGameSettings(getGameSettings()))
const rendererStats = ref({
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  usingPostprocessing: false,
})

const realtimeHttpUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const gameRoomRef = shallowRef<Room | null>(null)

const myPosition = { x: CITY_SPAWN.x, y: CITY_SPAWN.y, z: CITY_SPAWN.z }
const positionLabel = ref(
  `${CITY_SPAWN.x.toFixed(1)}, ${CITY_SPAWN.y.toFixed(1)}, ${CITY_SPAWN.z.toFixed(1)}`,
)
const direction = new THREE.Vector3(0, 0, -1)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let rendererPipeline: GameRendererPipeline | null = null
let roomEnvironment: THREE.Group | null = null
let roomEffects: RoomEffectsHandle | null = null
let directionalLight: THREE.DirectionalLight | null = null
let shadowRig: DirectionalShadowRig | null = null
let roomEnvironmentLoadToken = 0
let sharedEnvironmentLoadToken = 0
let lastRendererStatsUpdate = 0
let fpHands: THREE.Group | null = null
let gameActive = false
let tickRemoteUsers: (dt: number) => void = () => {}

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

const movementSummary = computed(() =>
  movementBindingSummary(gameSettings.value.controls),
)
const interactKeyLabel = computed(() =>
  actionBindingLabel('interact', gameSettings.value.controls),
)
const inventoryKeyLabel = computed(() =>
  actionBindingLabel('inventory', gameSettings.value.controls),
)
const rotateCwKeyLabel = computed(() =>
  actionBindingLabel('rotateCW', gameSettings.value.controls),
)
const rotateCcwKeyLabel = computed(() =>
  actionBindingLabel('rotateCCW', gameSettings.value.controls),
)
const pushToTalkKeyLabel = computed(() =>
  actionBindingLabel('pushToTalk', gameSettings.value.controls),
)
const graphicsPresetLabel = computed(() => {
  const preset = gameSettings.value.graphics.preset
  return `${preset.slice(0, 1).toUpperCase()}${preset.slice(1)}`
})

const lobbyActivities = useLobbyActivities({
  getScene: () => scene,
  getRoom: () => gameRoomRef.value,
  myPosition,
  currentRoomLabel,
  getParticleLevel: () => gameSettings.value.graphics.particles,
})
const {
  config: activityConfig,
  nearHub: nearActivityHub,
  panelOpen: activityPanelOpen,
  runState: activityRunState,
  queueState: activityQueueState,
  resultState: activityResultState,
  activityError,
} = lobbyActivities

const proximityVoice = useProximityVoice({
  gameRoomRef,
  getCamera: () => camera,
  matchesPushToTalk: (event) =>
    matchesAction(event, 'pushToTalk', gameSettings.value.controls),
})
const {
  supported: voiceSupported,
  enabled: voiceEnabled,
  requestingPermission: voiceRequestingPermission,
  micMuted: voiceMicMuted,
  deafened: voiceDeafened,
  pushToTalkActive,
  error: voiceError,
  peerViews: voicePeerViews,
  statusLabel: voiceStatusLabel,
} = proximityVoice

const gameInputBlocked = computed(
  () =>
    settingsOpen.value ||
    activityPanelOpen.value ||
    transitioningApartment.value ||
    switchingRoom.value,
)
const activityTranslationBlocked = computed(
  () => activityRunState.value?.phase === 'countdown',
)

watch(
  gameRoomRef,
  (room) => {
    proximityVoice.bindRoom(room)
    if (room) lobbyActivities.bindRoom(room)
  },
  { flush: 'sync' },
)

watch(
  [settingsOpen, activityPanelOpen],
  ([isSettingsOpen, isActivityPanelOpen]) => {
    if (!isSettingsOpen && !isActivityPanelOpen) return
    proximityVoice.releasePushToTalk()
    if (document.pointerLockElement) document.exitPointerLock()
  },
)

watch(activityResultState, (result) => {
  if (!result) return
  proximityVoice.releasePushToTalk()
  if (document.pointerLockElement) document.exitPointerLock()
})

function openSettings(): void {
  proximityVoice.releasePushToTalk()
  settingsOpen.value = true
}

function applyGameSettings(next: GameSettings): void {
  gameSettings.value = cloneGameSettings(next)
  if (camera) {
    camera.fov = gameSettings.value.controls.fov
    camera.updateProjectionMatrix()
  }
  const result = rendererPipeline?.applyLiveGraphicsSettings(
    gameSettings.value.graphics,
  )
  configureCurrentRoomVisuals(currentRoomLabel.value)
  syncSharedEnvironmentLighting()
  if (result?.requiresReload) {
    roomMessage.value =
      'Settings saved. Use “Apply & reload” to finish antialiasing, post-processing, or map-detail changes.'
  }
}

function acceptReloadSettings(next: GameSettings): void {
  gameSettings.value = cloneGameSettings(next)
}

function startSoloActivity(): void {
  if (!lobbyActivities.startSolo()) return
  requestPointerLock()
}

function queueDuelActivity(): void {
  if (!lobbyActivities.queueDuel()) return
  lobbyActivities.closePanel()
  requestPointerLock()
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

function handleExtraKeyDown(e: KeyboardEvent): boolean {
  if (
    !gameInputBlocked.value &&
    proximityVoice.onPushToTalkKeyDown(e)
  ) {
    return true
  }
  if (
    !gameInputBlocked.value &&
    matchesAction(e, 'interact', gameSettings.value.controls) &&
    !e.repeat &&
    lobbyActivities.handleInteract()
  ) {
    return true
  }
  if (
    import.meta.env.DEV &&
    e.code === 'KeyC' &&
    e.ctrlKey &&
    e.altKey &&
    !e.repeat
  ) {
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
  if (
    matchesAction(e, 'rotateCW', gameSettings.value.controls) &&
    !e.repeat
  ) {
    if (apartmentPlacement.currentState.value.kind !== 'idle') {
      apartmentPlacement.stepRotate(YAW_STEP)
      return true
    }
    return false
  }
  if (
    matchesAction(e, 'rotateCCW', gameSettings.value.controls) &&
    !e.repeat
  ) {
    if (apartmentPlacement.currentState.value.kind !== 'idle') {
      apartmentPlacement.stepRotate(-YAW_STEP)
      return true
    }
    return false
  }
  return false
}

function handleExtraKeyUp(e: KeyboardEvent): boolean {
  return proximityVoice.onPushToTalkKeyUp(e)
}

function updateDoorPromptScreenPos(): void {
  if (!camera || !canvasRef.value) {
    doorPromptPos.value = null
    return
  }
  const inApartment = currentRoomLabel.value === 'apartment'
  const isNear = inApartment ? nearApartmentDoor.value : nearCityDoor.value
  if (
    !isNear ||
    inventoryOpen.value ||
    settingsOpen.value ||
    lobbyActivities.panelOpen.value
  ) {
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
    key: interactKeyLabel.value,
    action: inApartment ? 'Exit' : 'Enter',
  }
}

function updateActivityPromptScreenPos(): void {
  if (
    !camera ||
    !canvasRef.value ||
    !lobbyActivities.nearHub.value ||
    lobbyActivities.runState.value !== null ||
    inventoryOpen.value ||
    settingsOpen.value ||
    lobbyActivities.panelOpen.value
  ) {
    activityPromptPos.value = null
    return
  }

  const prompt = lobbyActivities.hubPromptPosition.value
  activityProjectionVec.set(prompt.x, prompt.y, prompt.z).project(camera)
  if (activityProjectionVec.z > 1) {
    activityPromptPos.value = null
    return
  }
  const rect = canvasRef.value.getBoundingClientRect()
  activityPromptPos.value = {
    x: (activityProjectionVec.x * 0.5 + 0.5) * rect.width,
    y: (-activityProjectionVec.y * 0.5 + 0.5) * rect.height,
    key: interactKeyLabel.value,
    action: 'Play Cove Rush',
  }
}

function isCurrentRoomLoad(token: number): boolean {
  return gameActive && token === roomEnvironmentLoadToken
}

function disposeStaleRoomEnvironment(group: THREE.Group): void {
  if (!group.userData.isPersistentEnvironment) {
    disposeObject3D(group)
  }
}

function configureCurrentRoomVisuals(
  kind: 'city' | 'apartment',
): void {
  if (!gameActive || !scene) return

  roomEffects?.dispose()
  roomEffects = createRoomEffects({
    kind,
    level: gameSettings.value.graphics.particles,
  })
  scene.add(roomEffects.group)

  shadowRig?.dispose()
  shadowRig =
    directionalLight === null
      ? null
      : configureDirectionalShadowRig(
          scene,
          directionalLight,
          gameSettings.value.graphics,
          kind,
        )
  shadowRig?.follow(myPosition)

  if (roomEnvironment) configureRoomMeshShadows(roomEnvironment)
}

function syncSharedEnvironmentLighting(): void {
  if (!gameActive || !scene || !renderer) return
  const token = ++sharedEnvironmentLoadToken
  if (!gameSettings.value.graphics.environmentMap) {
    clearSharedEnvironment(scene)
    return
  }

  void loadSharedEnvironmentMap(renderer)
    .then((envMap) => {
      if (
        !gameActive ||
        token !== sharedEnvironmentLoadToken ||
        !gameSettings.value.graphics.environmentMap
      ) {
        return
      }
      applySharedEnvironment(scene, envMap)
    })
    .catch((err: unknown) => {
      if (gameActive && token === sharedEnvironmentLoadToken) {
        console.warn('[environment] shared lighting load failed', err)
      }
    })
}

function setRoomEnvironment(kind: 'city' | 'apartment') {
  if (!gameActive) return
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
  configureCurrentRoomVisuals(kind)
  const collisionUrl =
    kind === 'city' ? '/maps/LobbyMap.collision.json?v=4' : '/maps/ApartmentInterior.collision.json?v=4'
  void buildWorldCollisionFromUrl(collisionUrl).catch((err: unknown) => {
    if (!isCurrentRoomLoad(token)) return
    console.warn(`[collision] ${kind} collision failed`, err)
    roomMessage.value = `Could not load ${kind} collision. Reload the game before moving around.`
  })

  if (kind === 'city') {
    void loadLobbyEnvironment()
      .then((group) => {
        if (!isCurrentRoomLoad(token)) {
          disposeStaleRoomEnvironment(group)
          return
        }
        roomEnvironment = group
        scene.add(group)
        configureRoomMeshShadows(group)
        nearApartmentDoor.value = false
        resetClientStateForCityWorld()
        clearApartmentObjects()
      })
      .catch((err: unknown) => {
        if (!isCurrentRoomLoad(token)) return
        console.error('[environment] city load failed', err)
        roomMessage.value = 'Could not load the city environment. Reload to try again.'
      })
  } else {
    void loadApartmentEnvironment()
      .then((built) => {
        if (!isCurrentRoomLoad(token)) {
          disposeStaleRoomEnvironment(built.group)
          return
        }
        roomEnvironment = built.group
        scene.add(roomEnvironment)
        configureRoomMeshShadows(roomEnvironment)
        apartmentPlacement.registerApartmentEnvironment(built)
        nearCityDoor.value = false
        void apartmentPlacement.init({
          scene,
          camera,
          renderer,
          colyseusRoom: gameRoomRef,
        })
      })
      .catch((err: unknown) => {
        if (!isCurrentRoomLoad(token)) return
        console.error('[environment] apartment load failed', err)
        roomMessage.value = 'Could not load the apartment environment. Return to the city and try again.'
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
  onWindowBlur,
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
  handleExtraKeyUp,
  getControlSettings: () => gameSettings.value.controls,
  inputBlocked: gameInputBlocked,
  translationBlocked: activityTranslationBlocked,
  getFpsCap: () => gameSettings.value.graphics.fpsCap,
  renderFrame: (activeScene, activeCamera) => {
    rendererPipeline?.render(activeScene, activeCamera)
  },
  resizeRenderer: (width, height) => {
    rendererPipeline?.resize(width, height)
  },
  onCanvasMouseDown: (e) => {
    apartmentPlacement.onPointerDown(e)
  },
  onCanvasMouseUp: () => undefined,
  onBeforeRender: (dt) => {
    tickRemoteUsers(dt)
    lobbyActivities.tick(dt)
    proximityVoice.tick()
    roomEffects?.tick(dt, camera)
    shadowRig?.follow(myPosition)
    positionLabel.value = `${myPosition.x.toFixed(1)}, ${myPosition.y.toFixed(1)}, ${myPosition.z.toFixed(1)}`
    if (currentRoomLabel.value === 'apartment') {
      apartmentPlacement.tick(dt)
    }
    updateDoorPromptScreenPos()
    updateActivityPromptScreenPos()
    const now = performance.now()
    if (
      gameSettings.value.graphics.showFps &&
      rendererPipeline &&
      now - lastRendererStatsUpdate >= 500
    ) {
      lastRendererStatsUpdate = now
      rendererStats.value = rendererPipeline.getStats()
    }
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

const realtime = useGameRealtime({
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
const { connectRealtime, clearRemoteUsers } = realtime
tickRemoteUsers = realtime.tickRemoteUsers

function logout() {
  proximityVoice.disableVoice()
  clearAuth()
  void gameRoomRef.value?.leave()
  router.push({ name: 'landing' })
}

function initThree(accentColor: number) {
  if (!canvasRef.value) return
  const settings = gameSettings.value
  const isLowQuality = settings.graphics.preset === 'low'

  scene = new THREE.Scene()
  const { w, h } = containerSize()
  const aspect = w / h
  camera = new THREE.PerspectiveCamera(
    settings.controls.fov,
    aspect,
    0.1,
    isLowQuality ? 300 : 1000,
  )
  camera.position.set(CITY_SPAWN.x, CITY_SPAWN.y, CITY_SPAWN.z)
  scene.add(camera)

  rendererPipeline = createGameRenderer({
    canvas: canvasRef.value,
    width: w,
    height: h,
    graphics: settings.graphics,
  })
  renderer = rendererPipeline.renderer

  applySceneAtmosphere(scene, 'city', renderer)

  const ambient = new THREE.AmbientLight(0xb0a89e, 0.15)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 1.0)
  dir.position.set(10, 20, 10)
  scene.add(dir)
  directionalLight = dir
  configureGlobalSceneLights(ambient, dir)

  syncSharedEnvironmentLighting()
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
  if (!gameActive) return
  const bodyTint = hexStringToNumber(state.colors.body)
  initThree(bodyTint)
  await connectRealtime(state)
  if (!gameActive) {
    const room = gameRoomRef.value
    gameRoomRef.value = null
    refreshMyAppearance.value = null
    clearRemoteUsers()
    await room?.leave()
    return
  }
  try {
    await loadLayoutFromServer()
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    roomMessage.value = `Inventory layout unavailable: ${message}`
  }
  if (!gameActive) return
  refreshOwnedItems()
  startRenderLoop()
}

function handleVisibilityOrFocus(): void {
  proximityVoice.releasePushToTalk()
  onVisibilityOrFocus()
}

function handleWindowBlur(): void {
  proximityVoice.releasePushToTalk()
  onWindowBlur()
}

onMounted(() => {
  gameActive = true
  void bootGame()
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', handleVisibilityOrFocus)
  window.addEventListener('blur', handleWindowBlur)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('pagehide', onBeforeUnload)
  document.addEventListener('visibilitychange', handleVisibilityOrFocus)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
})

function onBeforeUnload() {
  proximityVoice.releasePushToTalk()
  void gameRoomRef.value?.leave()
}

onUnmounted(() => {
  gameActive = false
  roomEnvironmentLoadToken += 1
  sharedEnvironmentLoadToken += 1
  stopRenderLoop()
  window.removeEventListener('resize', onResize)
  window.removeEventListener('focus', handleVisibilityOrFocus)
  window.removeEventListener('blur', handleWindowBlur)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('pagehide', onBeforeUnload)
  document.removeEventListener('visibilitychange', handleVisibilityOrFocus)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  proximityVoice.dispose()
  lobbyActivities.dispose()
  refreshMyAppearance.value = null
  void gameRoomRef.value?.leave()
  gameRoomRef.value = null
  clearPersistTimers()
  clearRemoteUsers()
  clearApartmentObjects()
  apartmentPlacement.dispose()
  disposeWorldCollision()
  roomEffects?.dispose()
  roomEffects = null
  shadowRig?.dispose()
  shadowRig = null
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeStaleRoomEnvironment(roomEnvironment)
    roomEnvironment = null
  }
  if (fpHands) {
    camera.remove(fpHands)
    disposeObject3D(fpHands)
    fpHands = null
  }
  disposeSharedEnvironment()
  rendererPipeline?.dispose()
  rendererPipeline = null
  directionalLight = null
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
      v-show="pointerLocked"
      class="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors duration-150"
      :class="crosshairClass"
    />
    <GameRoomMessageBanner v-if="roomMessage" :message="roomMessage" />
    <GameLobbyActivityHud
      :state="activityRunState"
      :queue-state="activityQueueState"
      :result="activityResultState"
      :error="activityError"
      @cancel="lobbyActivities.cancel"
      @leave="lobbyActivities.cancel"
      @dismiss="lobbyActivities.dismissResult"
    />
    <GameHudToolbar
      :current-room-label="currentRoomLabel"
      :apartment-object-count="apartmentObjectCount"
      :position-label="positionLabel"
    >
      <button
        v-if="!pointerLocked"
        type="button"
        class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click.stop="openSettings"
        @mousedown.stop
      >
        Settings · {{ graphicsPresetLabel }}
      </button>
      <span
        v-if="gameSettings.graphics.showFps"
        class="rounded-md border border-cyan-300/30 bg-black/55 px-2 py-1 font-mono text-xs text-cyan-100"
        title="Renderer performance"
      >
        {{ Math.round(rendererStats.fps) }} FPS ·
        {{ rendererStats.drawCalls }} calls
      </span>
    </GameHudToolbar>
    <GameInteractionPrompt
      v-if="doorPromptPos"
      :screen-x="doorPromptPos.x"
      :screen-y="doorPromptPos.y"
      :key-label="doorPromptPos.key"
      :action-label="doorPromptPos.action"
    />
    <GameInteractionPrompt
      v-if="activityPromptPos && nearActivityHub"
      :screen-x="activityPromptPos.x"
      :screen-y="activityPromptPos.y"
      :key-label="activityPromptPos.key"
      :action-label="activityPromptPos.action"
    />
    <GamePlacementHud
      :visible="placementPreviewActive"
      :hints="placementHudHints"
      :rotate-cw-label="rotateCwKeyLabel"
      :rotate-ccw-label="rotateCcwKeyLabel"
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
    <GameVoiceControls
      :supported="voiceSupported"
      :enabled="voiceEnabled"
      :requesting="voiceRequestingPermission"
      :mic-muted="voiceMicMuted"
      :deafened="voiceDeafened"
      :transmitting="pushToTalkActive"
      :status-label="voiceStatusLabel"
      :push-to-talk-label="pushToTalkKeyLabel"
      :peers="voicePeerViews"
      :error="voiceError"
      :expanded="!pointerLocked"
      @enable="proximityVoice.enableVoice"
      @disable="proximityVoice.disableVoice()"
      @toggle-mic="proximityVoice.toggleMicMuted"
      @toggle-deafen="proximityVoice.toggleDeafened"
      @toggle-peer-mute="proximityVoice.togglePeerMuted"
      @refresh-policy="proximityVoice.refreshPolicy"
    />
    <GamePointerLockOverlay
      v-show="
        !pointerLocked &&
        !inventoryOpen &&
        !transitioningApartment &&
        !switchingRoom &&
        !settingsOpen &&
        !activityPanelOpen
      "
      :movement-summary="movementSummary"
      @request-pointer-lock="requestPointerLock"
      @settings="openSettings"
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
      :inventory-open="inventoryOpen"
      :inventory-label="inventoryKeyLabel"
      :interact-label="interactKeyLabel"
      :push-to-talk-label="pushToTalkKeyLabel"
    />
    <GameLobbyActivityPanel
      :open="activityPanelOpen"
      :checkpoint-count="activityConfig.checkpointCount"
      :queue-state="activityQueueState"
      :run-state="activityRunState"
      :error="activityError"
      @close="lobbyActivities.closePanel"
      @start-solo="startSoloActivity"
      @queue-duel="queueDuelActivity"
      @cancel="lobbyActivities.cancel"
    />
    <GameSettingsPanel
      :open="settingsOpen"
      :settings="gameSettings"
      @close="settingsOpen = false"
      @saved="applyGameSettings"
      @apply-reload="acceptReloadSettings"
    />
  </div>
</template>
