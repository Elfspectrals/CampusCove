<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { io } from 'socket.io-client'
import {
  appearanceCodesFromLoadout,
  appearanceIdsFromLoadout,
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  SLOTS,
  type CharacterCosmeticsState,
  type CosmeticColors,
  DEFAULT_SLOT_COLORS,
} from '../api/characterCosmetics'
import { getStoredAuth, clearAuth } from '../api/auth'
import { createTintedCharacter } from '../avatar/glbCharacter'
import {
  buildCompositeAvatar,
  buildFirstPersonHands,
  disposeObject3D,
  type AppearanceCodes,
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
  group: THREE.Group
  x: number
  y: number
  z: number
  color: number
  codes: Partial<AppearanceCodes>
  slotColors: CosmeticColors
}

const otherUsers = ref<Map<string, OtherUser>>(new Map())
const keys = { forward: false, back: false, left: false, right: false }
const pointerLocked = ref(false)
const velocity = new THREE.Vector3(0, 0, 0)
const direction = new THREE.Vector3(0, 0, -1)
const moveSpeed = 8
const myPosition = { x: 0, y: 1.6, z: 0 }
let lastEmit = 0
const emitInterval = 50

function hexStringToNumber(hex: string): number {
  return parseInt(hex.length === 7 ? hex.slice(1) : hex, 16)
}

function parseCodesFromServer(raw: Record<string, string | null> | null | undefined): Partial<AppearanceCodes> {
  if (!raw) return {}
  const slots: (keyof AppearanceCodes)[] = ['body', 'hair', 'top', 'bottom', 'shoes', 'head_accessory']
  const out: Partial<AppearanceCodes> = {}
  for (const s of slots) {
    const v = raw[s]
    out[s] = typeof v === 'string' && v.length > 0 ? v : null
  }
  return out
}

function parseSlotHexesFromServer(raw: Record<string, string> | null | undefined): CosmeticColors {
  const out = { ...DEFAULT_SLOT_COLORS }
  if (!raw) return out
  for (const s of SLOTS) {
    const v = raw[s]
    if (typeof v === 'string' && /^#[0-9A-Fa-f]{6}$/.test(v)) {
      out[s] = v
    }
  }
  return out
}

function placeAvatar(group: THREE.Group, x: number, y: number, z: number) {
  group.position.set(x, y, z)
}

function removeOtherUser(socketId: string) {
  const entry = otherUsers.value.get(socketId)
  if (!entry) return
  scene.remove(entry.group)
  disposeObject3D(entry.group)
  otherUsers.value.delete(socketId)
}

async function upsertOtherUser(
  socketId: string,
  data: {
    x: number
    y: number
    z: number
    color: number
    appearanceCodes?: Record<string, string | null>
    slotHexes?: Record<string, string>
  },
) {
  const codes = parseCodesFromServer(data.appearanceCodes ?? undefined)
  const slotColors = parseSlotHexesFromServer(data.slotHexes)
  const existing = otherUsers.value.get(socketId)
  if (existing) {
    scene.remove(existing.group)
    disposeObject3D(existing.group)
  }
  const glb = await createTintedCharacter(slotColors)
  const group = glb ?? buildCompositeAvatar(codes, data.color)
  placeAvatar(group, data.x, data.y, data.z)
  scene.add(group)
  otherUsers.value.set(socketId, {
    group,
    x: data.x,
    y: data.y,
    z: data.z,
    color: data.color,
    codes,
    slotColors,
  })
}

async function updateOtherAppearance(
  socketId: string,
  _appearance: Record<string, number | null>,
  appearanceCodes: Record<string, string | null>,
  slotHexes?: Record<string, string>,
) {
  const entry = otherUsers.value.get(socketId)
  if (!entry) return
  const codes = parseCodesFromServer(appearanceCodes)
  const slotColors = parseSlotHexesFromServer(slotHexes)
  scene.remove(entry.group)
  disposeObject3D(entry.group)
  const glb = await createTintedCharacter(slotColors)
  const group = glb ?? buildCompositeAvatar(codes, entry.color)
  placeAvatar(group, entry.x, entry.y, entry.z)
  scene.add(group)
  otherUsers.value.set(socketId, {
    ...entry,
    group,
    codes,
    slotColors,
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
  const appearanceCodes = appearanceCodesFromLoadout(state.slots)

  socket = io(socketUrl, {
    auth: {
      userId: auth.user.account_id,
      pseudo: auth.user.display_name || auth.user.username,
      appearance,
      appearanceCodes,
      slotHexes: state.colors,
    },
    transports: ['websocket', 'polling'],
  })

  socket.on('connect', () => {
    roomFullMessage.value = null
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
        pseudo: string
        color: number
        x: number
        y: number
        z: number
        appearanceCodes?: Record<string, string | null>
        slotHexes?: Record<string, string>
      }>,
    ) => {
      list.forEach((u) => {
        if (u.socketId === socket?.id) return
        void upsertOtherUser(u.socketId, {
          x: u.x,
          y: u.y,
          z: u.z,
          color: u.color,
          appearanceCodes: u.appearanceCodes,
          slotHexes: u.slotHexes,
        })
      })
    },
  )

  socket.on(
    'user_joined',
    (data: {
      socketId: string
      pseudo: string
      color: number
      x: number
      y: number
      z: number
      appearanceCodes?: Record<string, string | null>
      slotHexes?: Record<string, string>
    }) => {
      if (data.socketId === socket?.id) return
      void upsertOtherUser(data.socketId, {
        x: data.x,
        y: data.y,
        z: data.z,
        color: data.color,
        appearanceCodes: data.appearanceCodes,
        slotHexes: data.slotHexes,
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
      appearanceCodes: Record<string, string | null>
      slotHexes?: Record<string, string>
    }) => {
      if (data.socketId === socket?.id) return
      void updateOtherAppearance(data.socketId, data.appearance, data.appearanceCodes, data.slotHexes)
    },
  )

  socket.on('user_left', (data: { socketId: string }) => {
    removeOtherUser(data.socketId)
  })
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
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  cancelAnimationFrame(frameId)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
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
