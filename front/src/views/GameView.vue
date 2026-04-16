<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { io } from 'socket.io-client'
import {
  appearanceIdsFromLoadout,
  bodyModelGlbFromLoadout,
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  SLOTS,
  type CharacterCosmeticsState,
  type CosmeticColors,
  DEFAULT_SLOT_COLORS,
} from '../api/characterCosmetics'
import { getStoredAuth, clearAuth } from '../api/auth'
import { createTintedCharacterFromUrl } from '../avatar/glbCharacter'
import {
  buildCompositeAvatar,
  buildFirstPersonHands,
  disposeObject3D,
} from '../avatar/compositeAvatar'

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roomFullMessage = ref<string | null>(null)

function containerSize(): { w: number; h: number } {
  const el = containerRef.value
  if (el && el.clientWidth > 0 && el.clientHeight > 0) {
    return { w: el.clientWidth, h: el.clientHeight }
  }
  return { w: window.innerWidth, h: window.innerHeight }
}
const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let fpHands: THREE.Group | null = null
let socket: ReturnType<typeof io> | null = null

interface OtherUser {
  userId: string
  group: THREE.Group
  x: number
  y: number
  z: number
  color: number
  bodyTintColors: CosmeticColors
  bodyModelGlb: string | null
}

interface PendingAppearanceUpdate {
  appearance: Record<string, number | null>
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
}

const otherUsers = ref<Map<string, OtherUser>>(new Map())
const socketByUserId = new Map<string, string>()
const pendingAppearanceUpdates = new Map<string, PendingAppearanceUpdate>()
const upsertTokenByUserId = new Map<string, number>()
const renderTokenBySocketId = new Map<string, number>()
const keys = { forward: false, back: false, left: false, right: false }
const pointerLocked = ref(false)
const velocity = new THREE.Vector3(0, 0, 0)
const direction = new THREE.Vector3(0, 0, -1)
const moveSpeed = 8
const myPosition = { x: 0, y: 1.6, z: 0 }
let lastEmit = 0
const emitInterval = 50
let refreshMyAppearance: (() => void) | null = null

function nextRenderToken(socketId: string): number {
  const next = (renderTokenBySocketId.get(socketId) ?? 0) + 1
  renderTokenBySocketId.set(socketId, next)
  return next
}

function hexStringToNumber(hex: string): number {
  return parseInt(hex.length === 7 ? hex.slice(1) : hex, 16)
}

function parseBodyTintColors(raw: Record<string, string> | null | undefined): CosmeticColors {
  const bodyHex =
    raw && typeof raw.body === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.body) ? raw.body : DEFAULT_SLOT_COLORS.body
  const out = { ...DEFAULT_SLOT_COLORS }
  for (const s of SLOTS) out[s] = bodyHex
  return out
}

function parseBodyModelGlb(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

function placeAvatar(group: THREE.Group, x: number, y: number, z: number) {
  group.position.set(x, y, z)
}

function removeSceneAvatarDuplicates(socketId: string, userId: string) {
  const toRemove: THREE.Object3D[] = []
  for (const child of scene.children) {
    if (!(child instanceof THREE.Group)) continue
    const tag = child.userData as { isRemoteAvatar?: boolean; socketId?: string; userId?: string }
    if (!tag.isRemoteAvatar) continue
    if (tag.socketId === socketId || tag.userId === userId) {
      toRemove.push(child)
    }
  }
  for (const obj of toRemove) {
    scene.remove(obj)
    disposeObject3D(obj)
  }
}

/** One logical remote player per userId: drop stale socket rows even if socketByUserId was out of sync. */
function removeOtherUsersByUserIdExcept(userId: string, keepSocketId: string) {
  for (const [sid, ou] of [...otherUsers.value.entries()]) {
    if (ou.userId !== userId || sid === keepSocketId) continue
    removeOtherUser(sid)
  }
}

function removeOtherUser(socketId: string) {
  const entry = otherUsers.value.get(socketId)
  if (!entry) return
  removeSceneAvatarDuplicates(socketId, entry.userId)
  scene.remove(entry.group)
  disposeObject3D(entry.group)
  otherUsers.value.delete(socketId)
  if (socketByUserId.get(entry.userId) === socketId) {
    socketByUserId.delete(entry.userId)
  }
  pendingAppearanceUpdates.delete(socketId)
  renderTokenBySocketId.delete(socketId)
}

async function upsertOtherUser(
  socketId: string,
  data: {
    userId: string
    x: number
    y: number
    z: number
    color: number
    slotHexes?: Record<string, string>
    bodyModelGlb?: string | null
  },
) {
  const renderToken = nextRenderToken(socketId)
  const token = (upsertTokenByUserId.get(data.userId) ?? 0) + 1
  upsertTokenByUserId.set(data.userId, token)

  removeOtherUsersByUserIdExcept(data.userId, socketId)

  const knownSocketId = socketByUserId.get(data.userId)
  if (knownSocketId && knownSocketId !== socketId) {
    removeOtherUser(knownSocketId)
  }
  const bodyTintColors = parseBodyTintColors(data.slotHexes)
  const bodyModelGlb = parseBodyModelGlb(data.bodyModelGlb)
  const existing = otherUsers.value.get(socketId)
  if (existing) {
    scene.remove(existing.group)
    disposeObject3D(existing.group)
    otherUsers.value.delete(socketId)
    if (socketByUserId.get(existing.userId) === socketId) {
      socketByUserId.delete(existing.userId)
    }
    pendingAppearanceUpdates.delete(socketId)
  }
  const glb = await createTintedCharacterFromUrl(bodyModelGlb, bodyTintColors)
  const group = glb ?? buildCompositeAvatar(null, data.color)

  // A newer upsert request for this same user won the race: drop this stale render.
  if (upsertTokenByUserId.get(data.userId) !== token) {
    disposeObject3D(group)
    return
  }
  if (renderTokenBySocketId.get(socketId) !== renderToken) {
    disposeObject3D(group)
    return
  }

  const latestSocketId = socketByUserId.get(data.userId)
  if (latestSocketId && latestSocketId !== socketId) {
    removeOtherUser(latestSocketId)
  }
  removeOtherUsersByUserIdExcept(data.userId, socketId)
  removeSceneAvatarDuplicates(socketId, data.userId)
  group.userData.isRemoteAvatar = true
  group.userData.socketId = socketId
  group.userData.userId = data.userId
  placeAvatar(group, data.x, data.y, data.z)
  scene.add(group)
  otherUsers.value.set(socketId, {
    userId: data.userId,
    group,
    x: data.x,
    y: data.y,
    z: data.z,
    color: data.color,
    bodyTintColors,
    bodyModelGlb,
  })
  socketByUserId.set(data.userId, socketId)

  const pending = pendingAppearanceUpdates.get(socketId)
  if (pending) {
    pendingAppearanceUpdates.delete(socketId)
    void updateOtherAppearance(socketId, pending.appearance, pending.slotHexes, pending.bodyModelGlb)
  }
}

async function updateOtherAppearance(
  socketId: string,
  _appearance: Record<string, number | null>,
  slotHexes?: Record<string, string>,
  bodyModelGlb?: string | null,
) {
  const entry = otherUsers.value.get(socketId)
  if (!entry) {
    pendingAppearanceUpdates.set(socketId, { appearance: _appearance, slotHexes, bodyModelGlb })
    return
  }
  const renderToken = nextRenderToken(socketId)
  const bodyTintColors = parseBodyTintColors(slotHexes)
  const parsedBodyModelGlb = parseBodyModelGlb(bodyModelGlb)
  const glb = await createTintedCharacterFromUrl(parsedBodyModelGlb, bodyTintColors)
  const latestEntry = otherUsers.value.get(socketId)
  const group = glb ?? buildCompositeAvatar(null, (latestEntry ?? entry).color)
  if (!latestEntry) {
    disposeObject3D(group)
    return
  }
  if (renderTokenBySocketId.get(socketId) !== renderToken) {
    disposeObject3D(group)
    return
  }
  removeOtherUsersByUserIdExcept(latestEntry.userId, socketId)
  removeSceneAvatarDuplicates(socketId, latestEntry.userId)
  group.userData.isRemoteAvatar = true
  group.userData.socketId = socketId
  group.userData.userId = latestEntry.userId
  scene.remove(latestEntry.group)
  disposeObject3D(latestEntry.group)
  placeAvatar(group, latestEntry.x, latestEntry.y, latestEntry.z)
  scene.add(group)
  otherUsers.value.set(socketId, {
    ...latestEntry,
    group,
    bodyTintColors,
    bodyModelGlb: parsedBodyModelGlb,
  })
}

function initThree(accentColor: number) {
  if (!canvasRef.value) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = new THREE.Fog(0x1a1a2e, 10, 50)

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

  const floorGeo = new THREE.PlaneGeometry(50, 50)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x16213e })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const grid = new THREE.GridHelper(50, 50, 0x0f3460, 0x0f3460)
  grid.position.y = 0.01
  scene.add(grid)

  fpHands = buildFirstPersonHands(accentColor)
  fpHands.visible = false
  camera.add(fpHands)
}

function connectSocket(state: CharacterCosmeticsState) {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }
  const appearance = appearanceIdsFromLoadout(state.slots)
  const bodyState = {
    appearanceBody: appearance.body,
    bodyHex: state.colors.body,
    bodyModelGlb: bodyModelGlbFromLoadout(state.slots),
  }

  const emitBodyAppearance = () => {
    socket?.emit('appearance', {
      slots: { body: bodyState.appearanceBody },
      slotHexes: { body: bodyState.bodyHex },
      bodyModelGlb: bodyState.bodyModelGlb,
    })
  }

  const refreshAppearanceFromApi = async () => {
    try {
      const latest = await fetchCharacterCosmetics()
      const latestAppearance = appearanceIdsFromLoadout(latest.slots)
      bodyState.appearanceBody = latestAppearance.body
      bodyState.bodyHex = latest.colors.body
      bodyState.bodyModelGlb = bodyModelGlbFromLoadout(latest.slots)
      emitBodyAppearance()
    } catch {
      // Keep existing body state if the refresh fails.
    }
  }
  refreshMyAppearance = () => {
    void refreshAppearanceFromApi()
  }

  socket = io(socketUrl, {
    auth: {
      userId: auth.user.account_id,
      pseudo: auth.user.display_name || auth.user.username,
      appearance,
      slotHexes: { body: bodyState.bodyHex },
      bodyModelGlb: bodyState.bodyModelGlb,
    },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    roomFullMessage.value = null
    emitBodyAppearance()
    void refreshAppearanceFromApi()
  })

  socket.on('connect_error', () => {
    roomFullMessage.value = 'Could not connect to game server.'
  })

  socket.on('room_full', () => {
    roomFullMessage.value = 'Room is full (10 players max). Try again in a moment.'
  })

  socket.on(
    'me',
    (data: {
      socketId: string
      x: number
      y: number
      z: number
      color?: number
    }) => {
      myPosition.x = data.x
      myPosition.y = data.y
      myPosition.z = data.z
      camera.position.set(data.x, data.y, data.z)
    },
  )

  socket.on(
    'users',
    (
      list: Array<{
        socketId: string
        id: string
        pseudo: string
        color: number
        x: number
        y: number
        z: number
        slotHexes?: Record<string, string>
        bodyModelGlb?: string | null
      }>,
    ) => {
      list.forEach((u) => {
        if (u.socketId === socket?.id) return
        void upsertOtherUser(u.socketId, {
          userId: u.id,
          x: u.x,
          y: u.y,
          z: u.z,
          color: u.color,
          slotHexes: u.slotHexes,
          bodyModelGlb: u.bodyModelGlb,
        })
      })
    },
  )

  socket.on(
    'user_joined',
    (data: {
      socketId: string
      id: string
      pseudo: string
      color: number
      x: number
      y: number
      z: number
      slotHexes?: Record<string, string>
      bodyModelGlb?: string | null
    }) => {
      if (data.socketId === socket?.id) return
      void upsertOtherUser(data.socketId, {
        userId: data.id,
        x: data.x,
        y: data.y,
        z: data.z,
        color: data.color,
        slotHexes: data.slotHexes,
        bodyModelGlb: data.bodyModelGlb,
      })
    },
  )

  socket.on('user_moved', (data: { socketId: string; x: number; y: number; z: number }) => {
    const entry = otherUsers.value.get(data.socketId)
    if (entry) {
      entry.x = data.x
      entry.y = data.y
      entry.z = data.z
      entry.group.position.set(data.x, data.y, data.z)
    }
  })

  socket.on(
    'appearance_updated',
    (data: {
      socketId: string
      appearance: Record<string, number | null>
      slotHexes?: Record<string, string>
      bodyModelGlb?: string | null
    }) => {
      if (data.socketId === socket?.id) return
      void updateOtherAppearance(data.socketId, data.appearance, data.slotHexes, data.bodyModelGlb)
    },
  )

  socket.on('user_left', (data: { socketId: string }) => {
    removeOtherUser(data.socketId)
  })

}

function onVisibilityOrFocus() {
  if (document.visibilityState !== 'visible') return
  refreshMyAppearance?.()
}

function onBeforeUnload() {
  socket?.disconnect()
}

function onPointerLockChange() {
  pointerLocked.value = document.pointerLockElement === canvasRef.value
  if (fpHands) {
    fpHands.visible = pointerLocked.value
  }
}

function requestPointerLock() {
  canvasRef.value?.requestPointerLock()
}

function onResize() {
  if (!camera || !renderer) return
  const { w, h } = containerSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function onKeyDown(e: KeyboardEvent) {
  switch (e.code) {
    case 'KeyW':
    case 'KeyZ':
      keys.forward = true
      break
    case 'KeyS':
      keys.back = true
      break
    case 'KeyA':
    case 'KeyQ':
      keys.left = true
      break
    case 'KeyD':
      keys.right = true
      break
  }
}

function onKeyUp(e: KeyboardEvent) {
  switch (e.code) {
    case 'KeyW':
    case 'KeyZ':
      keys.forward = false
      break
    case 'KeyS':
      keys.back = false
      break
    case 'KeyA':
    case 'KeyQ':
      keys.left = false
      break
    case 'KeyD':
      keys.right = false
      break
  }
}

let mouseX = 0
let mouseY = 0
let yaw = 0
let pitch = 0

function onMouseMove(e: MouseEvent) {
  if (!pointerLocked.value) return
  mouseX = e.movementX
  mouseY = e.movementY
}

function updateMovement(dt: number) {
  const forward = keys.forward ? 1 : keys.back ? -1 : 0
  const right = keys.right ? 1 : keys.left ? -1 : 0
  yaw -= mouseX * 0.002
  pitch -= mouseY * 0.002
  pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch))
  mouseX = 0
  mouseY = 0
  direction.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  const rightVec = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize()
  velocity.set(0, 0, 0)
  if (forward) velocity.add(direction.clone().multiplyScalar(forward * moveSpeed * dt))
  if (right) velocity.add(rightVec.clone().multiplyScalar(right * moveSpeed * dt))
  myPosition.x += velocity.x
  myPosition.y = 1.6
  myPosition.z += velocity.z
  camera.position.set(myPosition.x, myPosition.y, myPosition.z)
  camera.rotation.order = 'YXZ'
  camera.rotation.y = yaw
  camera.rotation.x = pitch
  const now = Date.now()
  if (socket && now - lastEmit > emitInterval) {
    lastEmit = now
    socket.emit('move', { x: myPosition.x, y: myPosition.y, z: myPosition.z })
  }
}

let frameId = 0
let lastTime = performance.now()

function animate() {
  frameId = requestAnimationFrame(animate)
  const now = performance.now()
  const dt = (now - lastTime) / 1000
  lastTime = now
  if (pointerLocked.value) updateMovement(dt)
  renderer?.render(scene, camera)
}

function logout() {
  clearAuth()
  socket?.disconnect()
  router.push({ name: 'landing' })
}

async function bootGame() {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }

  let state: CharacterCosmeticsState
  try {
    state = await fetchCharacterCosmetics()
  } catch {
    state = {
      slots: emptyCosmeticLoadout(),
      colors: defaultCosmeticColors(),
    }
  }

  const bodyTint = hexStringToNumber(state.colors.body)
  initThree(bodyTint)
  connectSocket(state)
  animate()
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

onUnmounted(() => {
  cancelAnimationFrame(frameId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('focus', onVisibilityOrFocus)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('pagehide', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibilityOrFocus)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  refreshMyAppearance = null
  socket?.disconnect()
  for (const id of [...otherUsers.value.keys()]) {
    removeOtherUser(id)
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
    <div
      v-if="roomFullMessage"
      class="pointer-events-auto absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-lg border border-amber-400/50 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100"
      role="status"
    >
      {{ roomFullMessage }}
    </div>
    <div
      v-show="!pointerLocked"
      class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60"
    >
      <p class="m-0 text-base text-white/80">Click to lock pointer · ZQSD / WASD to move · Mouse to look</p>
      <button
        type="button"
        class="rounded-lg border-0 bg-campus-accent px-8 py-3 text-lg font-semibold text-white hover:opacity-90"
        @click="requestPointerLock"
      >
        Play
      </button>
      <button
        type="button"
        class="rounded-md border border-white/30 bg-transparent px-4 py-2 text-sm text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="logout"
      >
        Logout
      </button>
    </div>
    <div v-show="pointerLocked" class="absolute right-3 top-3">
      <button
        type="button"
        class="rounded-md border border-white/30 bg-transparent px-3 py-1.5 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="logout"
      >
        Logout
      </button>
    </div>
  </div>
</template>
