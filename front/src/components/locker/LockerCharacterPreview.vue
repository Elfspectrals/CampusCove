<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { disposeObject3D } from '../../avatar/compositeAvatar'

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewError = ref<string | null>(null)

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let resizeObserver: ResizeObserver | null = null

let avatarPivot: THREE.Group | null = null
let avatarRoot: THREE.Group | null = null
let floorMesh: THREE.Mesh | null = null

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

function normalizeCharacter(root: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const targetHeight = 1.82
  const scale = targetHeight / Math.max(size.y, 0.001)

  root.scale.setScalar(scale)
  root.position.copy(center).multiplyScalar(-scale)

  const floorAligned = new THREE.Box3().setFromObject(root)
  root.position.y -= floorAligned.min.y
}

async function loadPreviewModel(): Promise<void> {
  if (!scene || !avatarPivot) return

  previewError.value = null
  if (avatarRoot) {
    avatarPivot.remove(avatarRoot)
    disposeObject3D(avatarRoot)
    avatarRoot = null
  }

  try {
    const loader = new GLTFLoader()
    const url = new URL('../../low_poly_character.glb', import.meta.url).href
    const gltf = await loader.loadAsync(url)
    const model = gltf.scene as THREE.Group
    normalizeCharacter(model)
    model.position.y = 0
    model.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
    avatarRoot = model
    avatarPivot.add(model)
  } catch {
    previewError.value = 'Could not load character preview.'
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
}

function initThree(): void {
  if (!canvasRef.value) return

  const { width, height } = canvasSize()
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0d2248)

  camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100)
  camera.position.set(0, 1.15, 3.4)
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

  const ambient = new THREE.AmbientLight(0xffffff, 0.45)
  scene.add(ambient)

  const hemi = new THREE.HemisphereLight(0xbad8ff, 0x102049, 0.65)
  scene.add(hemi)

  const key = new THREE.DirectionalLight(0xffffff, 1.35)
  key.position.set(2.6, 4.8, 3.2)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 20
  scene.add(key)

  const fill = new THREE.DirectionalLight(0x8bb4ff, 0.45)
  fill.position.set(-2.7, 1.9, -1.8)
  scene.add(fill)

  const rim = new THREE.DirectionalLight(0x7ce6ff, 0.72)
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
    disposeObject3D(avatarRoot)
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
      Outfit Preview
    </p>
    <p class="pointer-events-none absolute bottom-3 left-3 text-[11px] font-semibold text-slate-300/85">
      Drag to rotate
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
      aria-label="3D character locker preview"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @pointerleave="endDrag"
    />
  </div>
</template>
