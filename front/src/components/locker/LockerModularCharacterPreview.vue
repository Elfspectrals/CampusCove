<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import {
  createModularAvatar,
  disposeModularAvatar,
  SAMPLE_MODULAR_LOADOUT,
  type ModularSlot,
} from '../../avatar/modularAvatar'

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewError = ref<string | null>(null)
const loadingModel = ref<boolean>(true)
const fallbackNotice = ref<string | null>(null)

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let resizeObserver: ResizeObserver | null = null

let avatarPivot: THREE.Group | null = null
let avatarRoot: THREE.Group | null = null
let floorMesh: THREE.Mesh | null = null
let lookAtTarget = new THREE.Vector3(0, 1, 0)

let dragActive = false
let dragPointerId: number | null = null
let lastPointerX = 0
let targetRotationY = 0
let currentRotationY = 0
let inertiaVelocity = 0

function canvasSize(): { width: number; height: number } {
  const el = containerRef.value
  if (!el) return { width: 320, height: 460 }
  const width = Math.max(240, el.clientWidth)
  const height = Math.max(280, el.clientHeight)
  return { width, height }
}

function frameCameraToModel(): void {
  if (!camera || !avatarRoot) return

  avatarRoot.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(avatarRoot)
  if (box.isEmpty()) return

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  const safeHeight = Math.max(size.y, 0.5)
  const safeWidth = Math.max(size.x, 0.4)
  const safeDepth = Math.max(size.z, 0.4)
  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const fitHeight = (safeHeight * 1.24) / (2 * Math.tan(vFov / 2))
  const fitWidth = (safeWidth * 1.24) / (2 * Math.tan(hFov / 2))
  const distance = Math.max(fitHeight, fitWidth) + safeDepth * 0.75

  lookAtTarget = new THREE.Vector3(0, center.y + safeHeight * 0.05, 0)
  camera.position.set(0, center.y + safeHeight * 0.1, distance)
  camera.near = Math.max(0.01, distance / 120)
  camera.far = Math.max(30, distance * 12)
  camera.updateProjectionMatrix()
  camera.lookAt(lookAtTarget)

  if (floorMesh) {
    floorMesh.scale.setScalar(Math.max(1, safeHeight / 1.95))
    floorMesh.position.y = -0.01
  }
}

function fallbackMessage(slots: ModularSlot[]): string | null {
  if (slots.length === 0) return null
  const list = slots.map((slot) => slot.toUpperCase()).join(', ')
  return `Fallback meshes: ${list}`
}

async function loadPreviewModel(): Promise<void> {
  if (!avatarPivot) return

  loadingModel.value = true
  previewError.value = null
  fallbackNotice.value = null

  if (avatarRoot) {
    avatarPivot.remove(avatarRoot)
    disposeModularAvatar(avatarRoot)
    avatarRoot = null
  }

  try {
    const assembled = await createModularAvatar(SAMPLE_MODULAR_LOADOUT)
    avatarRoot = assembled.root
    avatarPivot.add(avatarRoot)
    fallbackNotice.value = fallbackMessage(assembled.usedFallbackSlots)
    targetRotationY = 0
    currentRotationY = 0
    avatarPivot.rotation.y = 0
    frameCameraToModel()
  } catch {
    previewError.value = 'Could not load modular preview.'
  } finally {
    loadingModel.value = false
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!canvasRef.value) return
  dragActive = true
  dragPointerId = event.pointerId
  lastPointerX = event.clientX
  inertiaVelocity = 0
  canvasRef.value.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!dragActive || dragPointerId !== event.pointerId) return
  const deltaX = event.clientX - lastPointerX
  lastPointerX = event.clientX
  const rotationDelta = deltaX * 0.01
  targetRotationY += rotationDelta
  inertiaVelocity = rotationDelta
}

function endDrag(event: PointerEvent): void {
  if (!canvasRef.value) return
  if (dragPointerId !== event.pointerId) return
  dragActive = false
  canvasRef.value.releasePointerCapture(event.pointerId)
  dragPointerId = null
}

function renderFrame(): void {
  if (!renderer || !scene || !camera || !avatarPivot) return

  if (!dragActive) {
    targetRotationY += inertiaVelocity
    inertiaVelocity *= 0.92
    if (Math.abs(inertiaVelocity) < 0.0003) inertiaVelocity = 0
  }

  currentRotationY += (targetRotationY - currentRotationY) * 0.14
  avatarPivot.rotation.y = currentRotationY
  renderer.render(scene, camera)
}

function onResize(): void {
  if (!renderer || !camera) return
  const { width, height } = canvasSize()
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  if (avatarRoot) frameCameraToModel()
}

function initThree(): void {
  if (!canvasRef.value) return

  const { width, height } = canvasSize()
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d2248)

  camera = new THREE.PerspectiveCamera(34, width / height, 0.05, 200)
  camera.position.set(0, 1.15, 3.8)
  camera.lookAt(0, 1.0, 0)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: false,
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const ambient = new THREE.AmbientLight(0xffffff, 0.62)
  scene.add(ambient)

  const hemi = new THREE.HemisphereLight(0xc7e2ff, 0x102049, 0.9)
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xffffff, 1.55)
  key.position.set(2.6, 4.8, 3.2)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 20
  scene.add(key)

  const fill = new THREE.DirectionalLight(0xa8c7ff, 0.75)
  fill.position.set(-2.7, 1.9, -1.8)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0x7ce6ff, 0.95)
  rim.position.set(0, 2.2, -4.2)
  scene.add(rim)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.65, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1f448f,
      roughness: 0.85,
      metalness: 0.08,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.01
  floor.receiveShadow = true
  scene.add(floor)
  floorMesh = floor

  avatarPivot = new THREE.Group()
  scene.add(avatarPivot)

  void loadPreviewModel()
  renderer.setAnimationLoop(renderFrame)
}

function teardownThree(): void {
  if (renderer) renderer.setAnimationLoop(null)

  if (avatarPivot && avatarRoot) {
    avatarPivot.remove(avatarRoot)
    disposeModularAvatar(avatarRoot)
    avatarRoot = null
  }

  if (scene && floorMesh) {
    scene.remove(floorMesh)
    floorMesh.geometry.dispose()
    ;(floorMesh.material as THREE.Material).dispose()
    floorMesh = null
  }

  renderer?.dispose()
  renderer = null
  camera = null
  scene = null
  avatarPivot = null
  lookAtTarget.set(0, 1, 0)
}

onMounted(() => {
  initThree()
  resizeObserver = new ResizeObserver(() => onResize())
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  window.removeEventListener('resize', onResize)
  teardownThree()
})
</script>

<template>
  <div
    ref="containerRef"
    class="relative h-full min-h-[320px] w-full overflow-hidden rounded-[12px] border border-[#60A5FA]/30 bg-gradient-to-b from-[#14356F] via-[#102A5C] to-[#0B1F48] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-cyan-300/12 to-transparent" />
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/35 to-transparent" />
    <p class="pointer-events-none absolute left-3 top-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200/90">
      Modular Preview
    </p>
    <p class="pointer-events-none absolute bottom-3 left-3 text-[11px] font-semibold text-slate-300/85">
      Drag to rotate
    </p>
    <p
      v-if="loadingModel && !previewError"
      class="pointer-events-none absolute bottom-3 right-3 rounded-md border border-cyan-200/30 bg-slate-900/55 px-2 py-1 text-[11px] font-semibold text-cyan-100"
      role="status"
    >
      Loading modular avatar...
    </p>
    <p
      v-if="fallbackNotice && !previewError"
      class="pointer-events-none absolute right-3 top-3 rounded-md border border-amber-300/40 bg-amber-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100"
    >
      {{ fallbackNotice }}
    </p>
    <p
      v-if="previewError"
      class="pointer-events-none absolute bottom-3 right-3 rounded-md border border-rose-300/30 bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-100"
    >
      {{ previewError }}
    </p>
    <canvas
      ref="canvasRef"
      class="block h-full w-full touch-none"
      aria-label="3D modular character locker preview"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @pointerleave="endDrag"
    />
  </div>
</template>
