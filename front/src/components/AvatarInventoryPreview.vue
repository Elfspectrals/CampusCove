<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as THREE from 'three'
import type { CosmeticColors, CosmeticLoadout } from '../api/characterCosmetics'
import { appearanceCodesFromLoadout } from '../api/characterCosmetics'
import { buildCompositeAvatar, disposeObject3D, type AppearanceCodes } from '../avatar/compositeAvatar'
import { createTintedFbxPreviewCharacter } from '../avatar/fbxPreviewCharacter'

const props = defineProps<{
  loadout: CosmeticLoadout
  colors: CosmeticColors
}>()

const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const previewError = ref<string | null>(null)

/** Purple accent when falling back to primitive avatar. */
const PREVIEW_ACCENT = 0x7c3aed

let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let renderer: THREE.WebGLRenderer | null = null
let avatarRoot: THREE.Group | null = null
let floorMesh: THREE.Mesh | null = null
let resizeObserver: ResizeObserver | null = null

function renderOnce() {
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
  }
}

function sizeCanvas(): { w: number; h: number } {
  const el = containerRef.value
  if (!el) return { w: 320, h: 360 }
  const w = Math.max(200, el.clientWidth)
  const h = Math.max(260, Math.round(w * 1.08))
  return { w, h }
}

function codesFromLoadout(loadout: CosmeticLoadout): Partial<AppearanceCodes> {
  const r = appearanceCodesFromLoadout(loadout)
  return {
    body: r.body,
    hair: r.hair,
    top: r.top,
    bottom: r.bottom,
    shoes: r.shoes,
    head_accessory: r.head_accessory,
  }
}

async function rebuildAvatar() {
  if (!scene) return
  previewError.value = null
  if (avatarRoot) {
    scene.remove(avatarRoot)
    disposeObject3D(avatarRoot)
    avatarRoot = null
  }
  const fbx = await createTintedFbxPreviewCharacter(props.colors)
  if (fbx) {
    avatarRoot = fbx
    scene.add(fbx)
    renderOnce()
    return
  }
  previewError.value = '3D model unavailable — showing placeholder.'
  const fallback = buildCompositeAvatar(codesFromLoadout(props.loadout), PREVIEW_ACCENT)
  avatarRoot = fallback
  scene.add(fallback)
  renderOnce()
}

function initThree() {
  if (!canvasRef.value || !containerRef.value) return

  const { w, h } = sizeCanvas()

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b3fa8)
  scene.fog = new THREE.Fog(0x0b3fa8, 6.5, 14)
  camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 100)
  camera.position.set(0, 1.18, 3.25)
  camera.lookAt(0, 1.0, 0)

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
  })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const ambient = new THREE.AmbientLight(0xffffff, 0.3)
  scene.add(ambient)
  const hemi = new THREE.HemisphereLight(0xb7deff, 0x0a1d55, 0.72)
  scene.add(hemi)
  const key = new THREE.DirectionalLight(0xffffff, 1.38)
  key.position.set(2.2, 5.0, 3.8)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0x9ec5ff, 0.44)
  fill.position.set(-2.8, 1.9, -1.2)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0x7feaff, 0.68)
  rim.position.set(0, 2.9, -3.6)
  scene.add(rim)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 40),
    new THREE.MeshStandardMaterial({ color: 0x1e4db3, roughness: 0.88, metalness: 0.05 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)
  floorMesh = floor

  void rebuildAvatar()
}

function onResize() {
  if (!renderer || !camera || !containerRef.value) return
  const { w, h } = sizeCanvas()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  renderOnce()
}

function teardownThree() {
  if (avatarRoot && scene) {
    scene.remove(avatarRoot)
    disposeObject3D(avatarRoot)
    avatarRoot = null
  }
  if (floorMesh && scene) {
    scene.remove(floorMesh)
    floorMesh.geometry.dispose()
    ;(floorMesh.material as THREE.Material).dispose()
    floorMesh = null
  }
  renderer?.dispose()
  renderer = null
  camera = null
  scene = null
}

watch(
  () => [props.loadout, props.colors] as const,
  () => void rebuildAvatar(),
  { deep: true },
)

onMounted(() => {
  initThree()
  resizeObserver = new ResizeObserver(() => onResize())
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
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
    class="relative flex min-h-[360px] w-full flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900/80 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.8)] ring-1 ring-white/10 backdrop-blur-sm"
  >
    <div class="pointer-events-none absolute left-3 top-3 z-10 border-b border-white/10 pb-2 sm:left-4 sm:top-4">
      <p class="m-0 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">Character locker</p>
      <p class="m-0 mt-0.5 text-sm font-semibold text-white">Outfit preview</p>
    </div>
    <p
      v-if="previewError"
      class="pointer-events-none absolute bottom-3 left-3 right-3 z-10 rounded-md bg-black/50 px-2 py-1 text-center text-[11px] text-amber-200/90"
    >
      {{ previewError }}
    </p>
    <canvas
      ref="canvasRef"
      class="block min-h-[240px] w-full flex-1 touch-none"
      aria-label="Preview of your character"
    />
  </div>
</template>
