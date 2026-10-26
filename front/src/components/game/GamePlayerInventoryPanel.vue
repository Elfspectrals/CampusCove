<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  slots: string[]
  selectedHotbarIndex: number
  itemByCode: Record<string, ApartmentInventoryItem>
  cursorItem: { code: string; fromSlot: number } | null
  loading: boolean
  error: string | null
  canEditApartment: boolean
  selectedPlacedObjectId: string
  apartmentObjectIds: string[]
}>()

const emit = defineEmits<{
  close: []
  refresh: []
  cancelCursor: []
  slotPointerDown: [index: number, e: PointerEvent]
  slotPointerUp: [index: number, e: PointerEvent]
  slotDragStart: [index: number, e: DragEvent]
  slotDragOver: [index: number, e: DragEvent]
  slotDrop: [index: number, e: DragEvent]
  slotDragEnd: []
  clearSlot: [index: number]
  pickupSelectedPlacedObject: []
  placedObjectSelected: [objectId: string]
}>()

const ghostX = ref(0)
const ghostY = ref(0)
const focusTrap = ref<HTMLElement | null>(null)

function onOverlayMove(e: MouseEvent): void {
  ghostX.value = e.clientX
  ghostY.value = e.clientY
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (props.cursorItem) emit('cancelCursor')
  else emit('close')
  e.preventDefault()
}

function effectiveCode(raw: string): string {
  if (!raw) return ''
  const it = props.itemByCode[raw]
  return it && it.quantity > 0 ? raw : ''
}

function quantityFor(slotCode: string): number {
  if (!slotCode) return 0
  return props.itemByCode[slotCode]?.quantity ?? 0
}

function onPlacedSelect(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  emit('placedObjectSelected', target.value)
}

function onDragStartInner(index: number, rawCode: string, e: DragEvent): void {
  if (!effectiveCode(rawCode)) {
    e.preventDefault()
    return
  }
  emit('slotDragStart', index, e)
}

function slotRows(): string[][] {
  const g = props.slots.slice(9, 36)
  const rows: string[][] = []
  for (let r = 0; r < 3; r++) {
    rows.push(g.slice(r * 9, r * 9 + 9))
  }
  return rows
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  void nextTick(() => focusTrap.value?.focus())
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
})

function ghostItem(): ApartmentInventoryItem | null {
  const c = props.cursorItem?.code
  return c ? props.itemByCode[c] ?? null : null
}

function ghostQty(): number {
  return props.cursorItem ? quantityFor(props.cursorItem.code) : 0
}
</script>

<template>
  <div
    ref="focusTrap"
    tabindex="-1"
    class="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-ink-950/70 p-3 outline-none backdrop-blur-sm"
    @mousemove="onOverlayMove"
  >
    <div
      v-if="cursorItem"
      class="cc-slot cc-slot-active pointer-events-none fixed z-[49] h-14 w-14 -translate-x-1/2 -translate-y-1/2 shadow-2xl"
      :style="{ left: `${ghostX}px`, top: `${ghostY}px` }"
      aria-hidden="true"
    >
      <img
        v-if="ghostItem()?.preview_image"
        :src="ghostItem()?.preview_image ?? ''"
        :alt="ghostItem()?.name ?? ''"
        class="h-full w-full object-cover opacity-95"
      />
      <span v-if="ghostQty() > 1" class="absolute bottom-0.5 right-1 font-display text-xs text-fog [text-shadow:0_1px_0_rgb(0_0_0)]"
        >×{{ ghostQty() }}</span
      >
    </div>

    <div class="cc-panel relative w-[680px] max-w-full animate-cc-pop overflow-hidden">
      <div class="cc-panel-header bg-ink-950/40">
        <div class="flex items-center gap-3">
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-pool/15 text-pool"><UiIcon name="backpack" :size="22" /></span>
          <div>
            <h2 class="cc-display m-0 text-2xl leading-none">Inventory</h2>
            <p class="m-0 mt-0.5 text-xs font-bold text-mist">Click or drag items between slots</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" :disabled="loading" @click="emit('refresh')">
            <UiIcon name="refresh" :size="16" /> {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
          <button type="button" class="cc-btn cc-btn-coral cc-btn-sm cc-btn-icon" aria-label="Close inventory" @click="emit('close')">
            <UiIcon name="x" :size="16" />
          </button>
        </div>
      </div>

      <div class="p-5">
        <p v-if="cursorItem" class="cc-alert cc-alert-info m-0 mb-4 text-xs">
          <UiIcon name="hand" :size="16" />
          <span>Holding <span class="font-mono">{{ cursorItem.code }}</span> — click a slot to drop it, <span class="cc-keycap">Esc</span> to cancel</span>
        </p>
        <p v-if="error" class="cc-alert cc-alert-error m-0 mb-4 text-xs"><UiIcon name="alert" :size="16" /> {{ error }}</p>

        <div class="cc-eyebrow mb-2">Backpack</div>
        <div class="flex flex-col gap-1.5 overflow-x-auto pb-1">
          <div v-for="(row, rIdx) in slotRows()" :key="'inv-row-' + rIdx" class="flex gap-1.5">
            <div
              v-for="(cell, cIdx) in row"
              :key="'inv-cell-' + rIdx + '-' + cIdx"
              role="presentation"
              class="cc-slot h-14 w-14 shrink-0 select-none"
              @pointerdown="emit('slotPointerDown', 9 + rIdx * 9 + cIdx, $event)"
              @pointerup="emit('slotPointerUp', 9 + rIdx * 9 + cIdx, $event)"
              @dragover="emit('slotDragOver', 9 + rIdx * 9 + cIdx, $event)"
              @drop="emit('slotDrop', 9 + rIdx * 9 + cIdx, $event)"
              @dragend="emit('slotDragEnd')"
              @contextmenu.prevent="emit('clearSlot', 9 + rIdx * 9 + cIdx)"
            >
              <div
                class="relative flex h-full w-full outline-none ring-0"
                tabindex="-1"
                :draggable="!!effectiveCode(cell)"
                @dragstart="onDragStartInner(9 + rIdx * 9 + cIdx, cell, $event)"
              >
                <template v-if="effectiveCode(cell)">
                  <img
                    v-if="itemByCode[effectiveCode(cell)]?.preview_image"
                    :src="itemByCode[effectiveCode(cell)]?.preview_image ?? ''"
                    :alt="itemByCode[effectiveCode(cell)]?.name ?? ''"
                    :title="itemByCode[effectiveCode(cell)]?.name ?? ''"
                    class="pointer-events-none h-full w-full object-cover"
                    draggable="false"
                  />
                  <span
                    v-if="quantityFor(effectiveCode(cell)) > 1"
                    class="pointer-events-none absolute bottom-0.5 right-1 font-display text-xs text-fog [text-shadow:0_1px_0_rgb(0_0_0),0_0_4px_rgb(0_0_0)]"
                  >
                    ×{{ quantityFor(effectiveCode(cell)) }}
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>

        <div class="cc-eyebrow mb-2 mt-5">Hotbar</div>
        <div class="flex gap-1.5 overflow-x-auto rounded-2xl bg-ink-950/50 p-1.5">
          <div
            v-for="(rawCode, index) in slots.slice(0, 9)"
            :key="'pan-hb-' + index"
            role="presentation"
            class="cc-slot h-14 w-14 shrink-0 select-none"
            :class="selectedHotbarIndex === index ? 'cc-slot-active' : ''"
            @pointerdown="emit('slotPointerDown', index, $event)"
            @pointerup="emit('slotPointerUp', index, $event)"
            @dragover="emit('slotDragOver', index, $event)"
            @drop="emit('slotDrop', index, $event)"
            @dragend="emit('slotDragEnd')"
            @contextmenu.prevent="emit('clearSlot', index)"
          >
            <div
              class="relative flex h-full w-full outline-none ring-0"
              tabindex="-1"
              :draggable="!!effectiveCode(rawCode)"
              @dragstart="onDragStartInner(index, rawCode, $event)"
            >
              <span class="pointer-events-none absolute left-1 top-0.5 z-[1] font-display text-[11px] text-fog/80 [text-shadow:0_1px_0_rgb(0_0_0)]">{{ index + 1 }}</span>
              <template v-if="effectiveCode(rawCode)">
                <img
                  v-if="itemByCode[effectiveCode(rawCode)]?.preview_image"
                  :src="itemByCode[effectiveCode(rawCode)]?.preview_image ?? ''"
                  :alt="itemByCode[effectiveCode(rawCode)]?.name ?? ''"
                  :title="itemByCode[effectiveCode(rawCode)]?.name ?? ''"
                  class="pointer-events-none h-full w-full object-cover"
                  draggable="false"
                />
                <span
                  v-if="quantityFor(effectiveCode(rawCode)) > 1"
                  class="pointer-events-none absolute bottom-0.5 right-1 font-display text-xs text-fog [text-shadow:0_1px_0_rgb(0_0_0),0_0_4px_rgb(0_0_0)]"
                  >×{{ quantityFor(effectiveCode(rawCode)) }}</span
                >
              </template>
            </div>
          </div>
        </div>

        <div v-if="canEditApartment" class="mt-5 rounded-2xl border-2 border-ink-600/50 bg-ink-950/40 p-4">
          <div class="cc-eyebrow mb-2">Placed objects</div>
          <div class="flex flex-col gap-2 sm:flex-row">
            <select class="cc-input cc-input-sm flex-1" :value="selectedPlacedObjectId" @change="onPlacedSelect">
              <option value="">Select placed object</option>
              <option v-for="objectId in apartmentObjectIds" :key="'placed-' + objectId" :value="objectId">
                {{ objectId }}
              </option>
            </select>
            <button
              type="button"
              class="cc-btn cc-btn-pool cc-btn-sm"
              :disabled="!selectedPlacedObjectId"
              @click="emit('pickupSelectedPlacedObject')"
            >
              <UiIcon name="hand" :size="16" /> Pick up
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
