<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import {
  DEFAULT_SLOT_COLORS,
  fetchCharacterCosmetics,
  putCharacterCosmetics,
  wearModelsFromLoadout,
  type CharacterCosmeticsState,
  type CosmeticSlot,
  type PutCharacterCosmeticsPayload,
} from '../../api/characterCosmetics'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { wearSignature } from '../../avatar/modularCharacterLogic'
import { GEAR_SLOTS, gearSlotOf, unequipPayload, type GearSlot } from '../../game/wardrobeSlots'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'

/**
 * Equipment slots next to the character preview, Minecraft armour style: clothes live in the backpack and are
 * dragged (or picked up and clicked) onto their slot to be worn; dragging a worn piece onto a backpack slot takes
 * it off. The parent keeps the backpack in sync through `outfit`.
 */
const props = defineProps<{
  slots: string[]
  itemByCode: Record<string, ApartmentInventoryItem>
  /** Item held on the cursor (click-to-pick) or being dragged out of an inventory slot. */
  heldCode: string | null
  cursorFromSlot: number | null
}>()

const emit = defineEmits<{
  outfit: [change: { state: CharacterCosmeticsState; returnedCode: string | null; toSlot: number | null; wornCode: string | null; consumedCursor: boolean }]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const state = shallowRef<CharacterCosmeticsState | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)
const hoverGear = ref<GearSlot | null>(null)
/** A worn piece being dragged out of its equipment slot. */
let draggingGear: GearSlot | null = null

function equippedIn(gear: GearSlot) {
  const s = state.value
  if (!s) return null
  for (const slot of GEAR_SLOTS.find((g) => g.id === gear)!.slots) {
    const item = s.slots[slot]
    if (item?.model_glb) return item
  }
  return null
}

function clothesFor(code: string | null): ApartmentInventoryItem | null {
  const item = code ? props.itemByCode[code] : undefined
  return item && item.kind === 'cosmetic' && gearSlotOf(item.cosmetic_slot) ? item : null
}

function fits(gear: GearSlot): boolean {
  return gearSlotOf(clothesFor(props.heldCode)?.cosmetic_slot) === gear
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

async function save(
  slots: PutCharacterCosmeticsPayload['slots'],
  returned: { code: string | null; toSlot: number | null; wornCode: string | null },
  consumedCursor: boolean,
): Promise<void> {
  if (saving.value) return
  saving.value = true
  error.value = null
  try {
    const next = await putCharacterCosmetics({ slots })
    state.value = next
    emit('outfit', { state: next, returnedCode: returned.code, toSlot: returned.toSlot, wornCode: returned.wornCode, consumedCursor })
    await showOutfit(next)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not change your outfit.'
  } finally {
    saving.value = false
  }
}

/** Wears a backpack piece; whatever was in its slot goes back where the piece came from. */
function wear(item: ApartmentInventoryItem, fromSlot: number | null, consumedCursor: boolean): Promise<void> {
  const gear = gearSlotOf(item.cosmetic_slot)!
  return save({ [item.cosmetic_slot as CosmeticSlot]: item.item_def_id }, { code: equippedIn(gear)?.code ?? null, toSlot: fromSlot, wornCode: item.code }, consumedCursor)
}

/** Takes a worn piece off into the backpack (a given slot, or the first free one). */
function takeOff(gear: GearSlot, toSlot: number | null = null): Promise<void> {
  const worn = equippedIn(gear)
  return worn ? save(unequipPayload(gear), { code: worn.code, toSlot, wornCode: null }, false) : Promise.resolve()
}

/** Shift-click in the inventory: wears the piece, the one it replaces takes its cell. */
function wearFromSlot(slotIndex: number): Promise<void> {
  const item = clothesFor(props.slots[slotIndex] ?? null)
  return item ? wear(item, slotIndex, false) : Promise.resolve()
}

function onGearClick(gear: GearSlot, e: MouseEvent): void {
  // shift-click always takes the piece off, even with something on the cursor
  if (props.heldCode && props.cursorFromSlot !== null && !e.shiftKey) {
    const held = clothesFor(props.heldCode)
    if (!held) error.value = 'Only clothes can be worn.'
    else if (!fits(gear)) error.value = `${held.name} goes in the ${GEAR_SLOTS.find((g) => g.id === gearSlotOf(held.cosmetic_slot))!.label} slot.`
    else void wear(held, props.cursorFromSlot, true)
    return
  }
  void takeOff(gear)
}

function onGearDragStart(e: DragEvent, gear: GearSlot): void {
  if (!equippedIn(gear) || saving.value) {
    e.preventDefault()
    return
  }
  draggingGear = gear
  e.dataTransfer?.setData('text/plain', `gear:${gear}`)
}

function onGearDragOver(e: DragEvent, gear: GearSlot): void {
  if (draggingGear || !fits(gear)) return
  e.preventDefault()
  hoverGear.value = gear
}

function onGearDrop(e: DragEvent, gear: GearSlot): void {
  hoverGear.value = null
  const from = Number.parseInt(e.dataTransfer?.getData('text/plain') ?? '', 10)
  const item = Number.isFinite(from) ? clothesFor(props.slots[from] ?? null) : null
  if (item && gearSlotOf(item.cosmetic_slot) === gear) void wear(item, from, false)
}

defineExpose({ takeOff, wearFromSlot })

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
    const cosmetics = await fetchCharacterCosmetics()
    state.value = cosmetics
    await showOutfit(cosmetics)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load your outfit.'
  }
})

onUnmounted(() => {
  cancelAnimationFrame(frame)
  if (character) disposeObject3D(character)
  renderer?.dispose()
})
</script>

<template>
  <section class="mb-5 flex items-start gap-3" aria-label="Wardrobe">
    <div class="flex shrink-0 flex-col gap-1.5" aria-label="Equipment">
      <button
        v-for="g in GEAR_SLOTS"
        :key="g.id"
        type="button"
        class="cc-slot h-[69px] w-[69px]"
        :class="[hoverGear === g.id ? 'cc-slot-active' : fits(g.id) ? 'border-sun/70' : '', clothesFor(heldCode) && !fits(g.id) ? 'opacity-40' : '']"
        :title="equippedIn(g.id) ? `${equippedIn(g.id)!.name} (click or drag to the backpack to take off)` : `${g.label}: drop clothes here`"
        :draggable="!!equippedIn(g.id) && !saving"
        :disabled="saving"
        @click="onGearClick(g.id, $event)"
        @dragstart="onGearDragStart($event, g.id)"
        @dragend="draggingGear = null"
        @dragover="onGearDragOver($event, g.id)"
        @dragleave="hoverGear = null"
        @drop.prevent="onGearDrop($event, g.id)"
      >
        <img
          v-if="equippedIn(g.id)"
          :src="equippedIn(g.id)!.preview_image ?? ''"
          :alt="equippedIn(g.id)!.name"
          class="pointer-events-none h-full w-full object-cover"
          draggable="false"
        />
        <span v-else class="font-display text-[11px] uppercase tracking-wide text-ink-500">{{ g.label }}</span>
      </button>
    </div>
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
    <p v-if="error" class="cc-alert cc-alert-error m-0 min-w-0 flex-1 text-xs">{{ error }}</p>
  </section>
</template>
