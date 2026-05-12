<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'

const props = defineProps<{
  slots: string[]
  selectedHotbarIndex: number
  itemByCode: Record<string, ApartmentInventoryItem>
  cursorItem: { code: string; fromSlot: number } | null
  loading: boolean
  error: string | null
  currentRoomLabel: 'city' | 'apartment'
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
    class="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-black/70 outline-none"
    @mousemove="onOverlayMove"
  >
    <div
      v-if="cursorItem"
      class="pointer-events-none fixed z-[49] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-campus-accent bg-black/80 shadow-lg ring-2 ring-campus-accent/50"
      :style="{ left: `${ghostX}px`, top: `${ghostY}px` }"
      aria-hidden="true"
    >
      <img
        v-if="ghostItem()?.preview_image"
        :src="ghostItem()?.preview_image ?? ''"
        :alt="ghostItem()?.name ?? ''"
        class="h-full w-full rounded-md object-cover opacity-95"
      />
      <span v-if="ghostQty() > 1" class="absolute bottom-0.5 right-1 text-[11px] font-bold text-white"
        >×{{ ghostQty() }}</span
      >
    </div>

    <div class="relative w-[640px] max-w-[90vw] rounded-lg border border-white/20 bg-black/85 p-6 text-white">
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-lg font-semibold tracking-wide">Inventory</h2>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded border border-white/25 px-2 py-1 text-xs uppercase tracking-wide hover:border-campus-accent hover:text-campus-accent disabled:opacity-50"
            :disabled="loading"
            @click="emit('refresh')"
          >
            {{ loading ? 'Loading…' : 'Refresh' }}
          </button>
          <button
            type="button"
            class="rounded border border-white/25 px-2 py-1 text-xs uppercase tracking-wide hover:border-rose-300 hover:text-rose-200"
            aria-label="Close inventory"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>
      </div>
      <p v-if="cursorItem" class="mt-2 text-center text-xs text-white/70">
        Holding: {{ cursorItem.code }} — click a slot to place,
        <span class="font-semibold text-campus-accent">Esc</span> to cancel picking
      </p>
      <p v-if="error" class="mt-2 text-xs text-rose-300">{{ error }}</p>

      <div class="my-4 border-t border-white/15 pt-4">
        <div class="mb-2 text-[11px] uppercase tracking-wide text-white/70">Inventory (click / drag slots)</div>
        <div class="flex flex-col gap-2">
          <div v-for="(row, rIdx) in slotRows()" :key="'inv-row-' + rIdx" class="flex gap-1">
            <div
              v-for="(cell, cIdx) in row"
              :key="'inv-cell-' + rIdx + '-' + cIdx"
              role="presentation"
              class="relative h-14 w-14 shrink-0 select-none rounded-md border border-white/20 transition-colors hover:border-white/40"
              @pointerdown="emit('slotPointerDown', 9 + rIdx * 9 + cIdx, $event)"
              @pointerup="emit('slotPointerUp', 9 + rIdx * 9 + cIdx, $event)"
              @dragover="emit('slotDragOver', 9 + rIdx * 9 + cIdx, $event)"
              @drop="emit('slotDrop', 9 + rIdx * 9 + cIdx, $event)"
              @dragend="emit('slotDragEnd')"
              @contextmenu.prevent="emit('clearSlot', 9 + rIdx * 9 + cIdx)"
            >
              <div
                class="relative flex h-full w-full rounded-md outline-none ring-0"
                tabindex="-1"
                :draggable="!!effectiveCode(cell)"
                @dragstart="onDragStartInner(9 + rIdx * 9 + cIdx, cell, $event)"
              >
                <template v-if="effectiveCode(cell)">
                  <img
                    v-if="itemByCode[effectiveCode(cell)]?.preview_image"
                    :src="itemByCode[effectiveCode(cell)]?.preview_image ?? ''"
                    :alt="itemByCode[effectiveCode(cell)]?.name ?? ''"
                    class="pointer-events-none h-full w-full rounded-md object-cover"
                    draggable="false"
                  />
                  <span
                    v-if="quantityFor(effectiveCode(cell)) > 1"
                    class="pointer-events-none absolute bottom-0.5 right-1 text-[11px] font-bold text-white"
                  >
                    ×{{ quantityFor(effectiveCode(cell)) }}
                  </span>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-white/15 pb-4 pt-4">
        <div class="mb-2 text-[11px] uppercase tracking-wide text-white/70">Hotbar</div>
        <div class="flex gap-1">
          <div
            v-for="(rawCode, index) in slots.slice(0, 9)"
            :key="'pan-hb-' + index"
            role="presentation"
            class="relative h-14 w-14 shrink-0 select-none rounded-md border transition-colors"
            :class="
              selectedHotbarIndex === index ? 'border-campus-accent ring-2 ring-campus-accent/60' : 'border-white/20'
            "
            @pointerdown="emit('slotPointerDown', index, $event)"
            @pointerup="emit('slotPointerUp', index, $event)"
            @dragover="emit('slotDragOver', index, $event)"
            @drop="emit('slotDrop', index, $event)"
            @dragend="emit('slotDragEnd')"
            @contextmenu.prevent="emit('clearSlot', index)"
          >
            <div
              class="relative flex h-full w-full rounded-md outline-none ring-0"
              tabindex="-1"
              :draggable="!!effectiveCode(rawCode)"
              @dragstart="onDragStartInner(index, rawCode, $event)"
            >
              <span
                class="pointer-events-none absolute left-0.5 top-0.5 z-[1] rounded bg-black/55 px-[3px] text-[10px] text-white/70"
                >{{ index + 1 }}</span
              >
              <template v-if="effectiveCode(rawCode)">
                <img
                  v-if="itemByCode[effectiveCode(rawCode)]?.preview_image"
                  :src="itemByCode[effectiveCode(rawCode)]?.preview_image ?? ''"
                  :alt="itemByCode[effectiveCode(rawCode)]?.name ?? ''"
                  class="pointer-events-none h-full w-full rounded-md object-cover"
                  draggable="false"
                />
                <span
                  v-if="quantityFor(effectiveCode(rawCode)) > 1"
                  class="pointer-events-none absolute bottom-0.5 right-1 text-[11px] font-bold text-white"
                  >×{{ quantityFor(effectiveCode(rawCode)) }}</span
                >
              </template>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="currentRoomLabel === 'apartment'"
        class="mt-4 border-t border-white/15 pt-4 text-xs text-white/85"
      >
        <div class="mb-2 text-[11px] uppercase tracking-wide text-white/70">Placed objects</div>
        <select
          class="mb-2 w-full rounded border border-white/25 bg-black/50 px-2 py-1.5 text-xs text-white"
          :value="selectedPlacedObjectId"
          @change="onPlacedSelect"
        >
          <option value="">Select placed object</option>
          <option v-for="objectId in apartmentObjectIds" :key="'placed-' + objectId" :value="objectId">
            {{ objectId }}
          </option>
        </select>
        <button
          type="button"
          class="w-full rounded border border-white/30 bg-black/35 px-2 py-2 text-xs font-semibold hover:border-campus-accent hover:text-campus-accent disabled:opacity-50"
          :disabled="!selectedPlacedObjectId"
          @click="emit('pickupSelectedPlacedObject')"
        >
          Pickup selected object
        </button>
      </div>
    </div>
  </div>
</template>
