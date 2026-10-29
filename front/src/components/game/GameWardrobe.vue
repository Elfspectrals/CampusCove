<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import {
  DEFAULT_SLOT_COLORS,
  fetchCharacterCosmetics,
  putCharacterCosmetics,
  wearModelsFromLoadout,
  type CharacterCosmeticsState,
  type CosmeticSlot,
} from '../../api/characterCosmetics'
import { fetchAccountInventory, type AccountInventoryRow } from '../../api/inventory'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { wearSignature } from '../../avatar/modularCharacterLogic'

type WardrobeTab = 'head' | 'top' | 'bottom' | 'shoes'

const TABS: Array<{ id: WardrobeTab; label: string; slots: CosmeticSlot[] }> = [
  { id: 'head', label: 'Head', slots: ['hair', 'head_accessory'] },
  { id: 'top', label: 'Top', slots: ['top'] },
  { id: 'bottom', label: 'Pants', slots: ['bottom'] },
  { id: 'shoes', label: 'Shoes', slots: ['shoes'] },
]

const emit = defineEmits<{ changed: [state: CharacterCosmeticsState] }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const state = shallowRef<CharacterCosmeticsState | null>(null)
const owned = ref<AccountInventoryRow[]>([])
const tab = ref<WardrobeTab>('top')
const saving = ref(false)
const error = ref<string | null>(null)

const tabSlots = computed(() => TABS.find((t) => t.id === tab.value)!.slots)
const pieces = computed(() =>
  owned.value.filter((row) => row.item.cosmetic_slot && tabSlots.value.includes(row.item.cosmetic_slot as CosmeticSlot) && row.item.model_glb),
)

function equippedIn(slots: CosmeticSlot[]): string {
  const s = state.value
  if (!s) return '…'
  const names = slots.map((slot) => s.slots[slot]?.name).filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'Nothing'
}

function isEquipped(row: AccountInventoryRow): boolean {
  const slot = row.item.cosmetic_slot as CosmeticSlot
  return state.value?.slots[slot]?.item_def_id === row.item.item_def_id
}

let renderer: THREE.WebGLRenderer | null = null
let character: THREE.Group | null = null
let shownOutfit = ''
let frame = 0
let lastTime = 0
let yaw = 0
let dragX: number | null = null
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(30, 220 / 300, 0.1, 20)
camera.position.set(0, 1.05, 4.4)
camera.lookAt(0, 0.9, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2))
const sun = new THREE.DirectionalLight(0xffffff, 2.0)
sun.position.set(2, 3, 4)
scene.add(sun)

async function showOutfit(s: CharacterCosmeticsState): Promise<void> {
  const models = wearModelsFromLoadout(s.slots)
  const signature = wearSignature(models, s.colors)
  if (signature === shownOutfit) return
  shownOutfit = signature
  const next = await createModularCharacter(models, s.colors, DEFAULT_SLOT_COLORS)
  if (signature !== shownOutfit) {
    disposeObject3D(next)
    return
  }
  if (character) {
    scene.remove(character)
    disposeObject3D(character)
  }
  character = next
  character.rotation.y = yaw
  scene.add(character)
}

function loop(time: number): void {
  frame = requestAnimationFrame(loop)
  const dt = lastTime ? (time - lastTime) / 1000 : 0
  lastTime = time
  if (character) {
    character.rotation.y = yaw
    updateAvatarAnimation(character, dt, 0)
  }
  renderer?.render(scene, camera)
}

async function equip(row: AccountInventoryRow): Promise<void> {
  if (saving.value) return
  const slot = row.item.cosmetic_slot as CosmeticSlot
  saving.value = true
  error.value = null
  try {
    const next = await putCharacterCosmetics({ slots: { [slot]: isEquipped(row) ? null : row.item.item_def_id } })
    state.value = next
    emit('changed', next)
    await showOutfit(next)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not change your outfit.'
  } finally {
    saving.value = false
  }
}

function onPointerDown(e: PointerEvent): void {
  dragX = e.clientX
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent): void {
  if (dragX === null) return
  yaw += (e.clientX - dragX) * 0.012
  dragX = e.clientX
}

onMounted(async () => {
  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value!, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(220, 300, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  frame = requestAnimationFrame(loop)
  try {
    const [cosmetics, inventory] = await Promise.all([fetchCharacterCosmetics(), fetchAccountInventory({ kind: 'cosmetic' })])
    state.value = cosmetics
    owned.value = inventory.items
    await showOutfit(cosmetics)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load your wardrobe.'
  }
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  if (character) disposeObject3D(character)
  renderer?.dispose()
})
</script>

<template>
  <section class="mb-5 flex gap-4" aria-label="Wardrobe">
    <canvas
      ref="canvasRef"
      width="220"
      height="300"
      class="h-[300px] w-[220px] shrink-0 cursor-grab rounded-2xl bg-[radial-gradient(circle_at_50%_70%,rgb(var(--cc-grape)/0.45),transparent_60%),linear-gradient(180deg,rgb(var(--cc-ink-700)),rgb(var(--cc-ink-950)))] active:cursor-grabbing"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="dragX = null"
      @pointercancel="dragX = null"
    />
    <div class="min-w-0 flex-1">
      <div class="cc-eyebrow mb-2">Wardrobe</div>
      <div class="mb-3 grid grid-cols-4 gap-1.5">
        <button
          v-for="t in TABS"
          :key="t.id"
          type="button"
          class="cc-slot flex h-14 flex-col items-center justify-center px-1 text-center"
          :class="tab === t.id ? 'cc-slot-active' : ''"
          @click="tab = t.id"
        >
          <span class="font-display text-xs text-fog">{{ t.label }}</span>
          <span class="w-full truncate text-[10px] font-bold text-mist">{{ equippedIn(t.slots) }}</span>
        </button>
      </div>
      <p v-if="error" class="cc-alert cc-alert-error m-0 mb-2 text-xs">{{ error }}</p>
      <p v-if="pieces.length === 0" class="m-0 text-xs font-bold text-mist">Nothing here yet. Cove Threads, on the road to the clinic, sells clothes.</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <button
          v-for="row in pieces"
          :key="row.item.item_def_id"
          type="button"
          class="cc-slot h-14 w-14 shrink-0"
          :class="isEquipped(row) ? 'cc-slot-active' : ''"
          :title="isEquipped(row) ? `${row.item.name} (click to take off)` : row.item.name"
          :disabled="saving"
          @click="equip(row)"
        >
          <img :src="row.item.preview_image ?? ''" :alt="row.item.name" class="h-full w-full object-cover" draggable="false" />
        </button>
      </div>
    </div>
  </section>
</template>
