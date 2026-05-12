<script setup lang="ts">
import type { ApartmentInventoryItem } from '../../types/gameRealtime'

defineProps<{
  slots: string[]
  selectedHotbarIndex: number
  itemByCode: Record<string, ApartmentInventoryItem>
}>()

const emit = defineEmits<{
  selectSlot: [index: number]
  dragStart: [index: number, e: DragEvent]
  dragOver: [index: number, e: DragEvent]
  drop: [index: number, e: DragEvent]
  dragEnd: []
  pointerDown: [index: number, e: PointerEvent]
  pointerUp: [index: number, e: PointerEvent]
  clearSlot: [index: number]
}>()

function effectiveCode(raw: string, itemByCode: Record<string, ApartmentInventoryItem>): string {
  if (!raw) return ''
  const it = itemByCode[raw]
  return it && it.quantity > 0 ? raw : ''
}

function quantityFor(slotCode: string, itemByCode: Record<string, ApartmentInventoryItem>): number {
  if (!slotCode) return 0
  return itemByCode[slotCode]?.quantity ?? 0
}

function onDragStartInner(index: number, rawCode: string, itemByCode: Record<string, ApartmentInventoryItem>, e: DragEvent) {
  if (!effectiveCode(rawCode, itemByCode)) {
    e.preventDefault()
    return
  }
  emit('dragStart', index, e)
}
</script>

<template>
  <div
    class="pointer-events-auto absolute bottom-4 left-1/2 z-20 flex max-w-[95vw] -translate-x-1/2 gap-1 rounded-md border border-white/25 bg-black/55 p-1 backdrop-blur-sm"
  >
    <div
      v-for="(rawCode, index) in slots.slice(0, 9)"
      :key="'hb-' + index"
      role="presentation"
      class="relative h-14 w-14 shrink-0 select-none rounded-md border transition-colors"
      :class="
        selectedHotbarIndex === index ? 'border-campus-accent ring-2 ring-campus-accent/60' : 'border-white/20'
      "
      @pointerdown="emit('pointerDown', index, $event)"
      @pointerup="emit('pointerUp', index, $event)"
      @dragover="emit('dragOver', index, $event)"
      @drop="emit('drop', index, $event)"
      @dragend="emit('dragEnd')"
      @contextmenu.prevent="emit('clearSlot', index)"
    >
      <div
        class="relative flex h-full w-full cursor-pointer items-stretch rounded-md outline-none ring-0 focus:outline-none"
        :draggable="!!effectiveCode(rawCode, itemByCode)"
        tabindex="-1"
        @click.stop="emit('selectSlot', index)"
        @dragstart="onDragStartInner(index, rawCode, itemByCode, $event)"
      >
        <template v-if="effectiveCode(rawCode, itemByCode)">
          <span
            class="pointer-events-none absolute left-0.5 top-0.5 z-[1] rounded bg-black/55 px-[3px] text-[10px] text-white/70"
            >{{ index + 1 }}</span
          >
          <img
            v-if="itemByCode[effectiveCode(rawCode, itemByCode)]?.preview_image"
            :src="itemByCode[effectiveCode(rawCode, itemByCode)]?.preview_image ?? ''"
            :alt="itemByCode[effectiveCode(rawCode, itemByCode)]?.name ?? ''"
            class="pointer-events-none h-full w-full rounded-md object-cover"
            draggable="false"
          />
          <span
            v-if="quantityFor(effectiveCode(rawCode, itemByCode), itemByCode) > 1"
            class="pointer-events-none absolute bottom-0.5 right-1 text-[11px] font-bold text-white"
          >
            ×{{ quantityFor(effectiveCode(rawCode, itemByCode), itemByCode) }}
          </span>
        </template>
        <template v-else>
          <span class="pointer-events-none absolute left-0.5 top-0.5 rounded bg-black/35 px-[3px] text-[10px] text-white/70">{{
            index + 1
          }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
