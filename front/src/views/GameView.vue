<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { io } from 'socket.io-client'
import { getStoredAuth, clearAuth } from '../api/auth'

const router = useRouter()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let socket: ReturnType<typeof io> | null = null
const otherUsers = ref<Map<string, { mesh: THREE.Mesh; x: number; y: number; z: number }>>(new Map())
const keys = { forward: false, back: false, left: false, right: false }
const pointerLocked = ref(false)
const velocity = new THREE.Vector3(0, 0, 0)
const direction = new THREE.Vector3(0, 0, -1)
const moveSpeed = 8
const myPosition = { x: 0, y: 1.6, z: 0 }
let lastEmit = 0
const emitInterval = 50

function createSphere(color: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.5, 16, 16)
  const material = new THREE.MeshStandardMaterial({ color })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function initThree() {
  if (!canvasRef.value) return
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)
  scene.fog = new THREE.Fog(0x1a1a2e, 10, 50)

  const aspect = window.innerWidth / window.innerHeight
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
  camera.position.set(0, 1.6, 0)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
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
}

function connectSocket() {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }
  socket = io(socketUrl, {
    auth: { userId: auth.user.account_id, pseudo: auth.user.display_name || auth.user.username },
    transports: ['websocket', 'polling'],
  })
  socket.on('me', (data: { socketId: string; x: number; y: number; z: number }) => {
    myPosition.x = data.x
    myPosition.y = data.y
    myPosition.z = data.z
    camera.position.set(data.x, data.y, data.z)
  })
  socket.on('users', (list: Array<{ socketId: string; pseudo: string; color: number; x: number; y: number; z: number }>) => {
    list.forEach((u) => {
      if (u.socketId === socket?.id) return
      const mesh = createSphere(u.color)
      mesh.position.set(u.x, u.y, u.z)
      scene.add(mesh)
      otherUsers.value.set(u.socketId, { mesh, x: u.x, y: u.y, z: u.z })
    })
  })
  socket.on('user_joined', (data: { socketId: string; pseudo: string; color: number; x: number; y: number; z: number }) => {
    if (data.socketId === socket?.id) return
    const mesh = createSphere(data.color)
    mesh.position.set(data.x, data.y, data.z)
    scene.add(mesh)
    otherUsers.value.set(data.socketId, { mesh, x: data.x, y: data.y, z: data.z })
  })
  socket.on('user_moved', (data: { socketId: string; x: number; y: number; z: number }) => {
    const entry = otherUsers.value.get(data.socketId)
    if (entry) {
      entry.x = data.x
      entry.y = data.y
      entry.z = data.z
      entry.mesh.position.set(data.x, data.y, data.z)
    }
  })
  socket.on('user_left', (data: { socketId: string }) => {
    const entry = otherUsers.value.get(data.socketId)
    if (entry) {
      scene.remove(entry.mesh)
      entry.mesh.geometry.dispose()
      ;(entry.mesh.material as THREE.Material).dispose()
      otherUsers.value.delete(data.socketId)
    }
  })
}

function onPointerLockChange() {
  pointerLocked.value = document.pointerLockElement === canvasRef.value
}

function requestPointerLock() {
  canvasRef.value?.requestPointerLock()
}

function onResize() {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
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

onMounted(() => {
  initThree()
  connectSocket()
  animate()
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
  renderer?.dispose()
})
</script>

<template>
  <div class="relative h-screen w-screen overflow-hidden">
    <canvas ref="canvasRef" class="block h-full w-full cursor-crosshair" @click="requestPointerLock" />
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
