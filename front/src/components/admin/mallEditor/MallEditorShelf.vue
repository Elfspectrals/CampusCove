<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'
import { itemModelUrl, type ShelfProp, type ShelfSlotFill, type Vec3 } from '../../../game/mallTemplates/mallTemplate.ts'
import { modelSize } from '../../../game/mallTemplates/templateProps'
import {
  MAX_SHELF_LENGTH,
  MAX_SHELF_SLOTS,
  MIN_SHELF_LENGTH,
  SHELF_ARRANGES,
  shelfFaces,
  shelfMaxLevels,
  slotBoxes,
  slotCapacity,
  slotKey,
  type ShelfArrange,
  type ShelfType,
  type SlotBox,
} from '../../../game/shelves/shelves.ts'
import EditorSearchSelect, { type SelectOption } from './EditorSearchSelect.vue'

export interface ShelfItem {
  code: string
  key: string
  label: string
  group: string
  preview: string | null
  price: number
}

type Shape = Pick<ShelfProp, 'shelf' | 'length' | 'levels' | 'slots'>

const props = defineProps<{ shelf: ShelfProp; items: ShelfItem[] }>()
const emit = defineEmits<{ change: [shelf: ShelfProp] }>()

const TYPES: SelectOption[] = [
  { value: 'gondola', label: 'Gondola' },
  { value: 'wall', label: 'Wall shelf' },
  { value: 'fridge', label: 'Fridge' },
  { value: 'chiller', label: 'Chiller' },
]
const ARRANGE_LABELS: Record<ShelfArrange, string> = { rows: 'Neat rows', messy: 'Messy', stack: 'Stacked', front: 'Front row' }
const ARRANGES: SelectOption[] = SHELF_ARRANGES.map((value) => ({ value, label: ARRANGE_LABELS[value] }))

const selected = ref<string | null>(null)
const sizes = ref<Record<string, Vec3>>({})
const notice = ref<string | null>(null)

const itemOptions = computed<SelectOption[]>(() => props.items.map((i) => ({ value: i.code, label: i.label, group: i.group, preview: i.preview })))
const boxes = computed(() => new Map(slotBoxes(props.shelf).map((b) => [b.key, b])))
const grid = computed(() => {
  const faces = shelfFaces(props.shelf.shelf)
  return Array.from({ length: faces }, (_, face) => ({
    face,
    label: faces === 1 ? 'Shelves' : face === 0 ? 'Front face' : 'Back face',
    levels: Array.from({ length: props.shelf.levels }, (_, i) => {
      const level = props.shelf.levels - 1 - i
      return Array.from({ length: props.shelf.slots }, (_, slot) => {
        const key = slotKey(face, level, slot)
        const fill = props.shelf.fill[key] ?? null
        return { key, fill, preview: fill ? previewOf(fill.code) : null }
      })
    }),
  }))
})
const selectedBox = computed(() => (selected.value ? boxes.value.get(selected.value) ?? null : null))
const selectedFill = computed(() => (selected.value ? props.shelf.fill[selected.value] ?? null : null))
const selectedCapacity = computed(() => {
  const fill = selectedFill.value
  const size = fill && sizes.value[fill.code]
  return fill && size && selectedBox.value ? slotCapacity(selectedBox.value.size, size, fill.arrange) : null
})

watch(() => props.shelf.id, () => {
  selected.value = null
  notice.value = null
})

watch(
  () => Object.values(props.shelf.fill).map((f) => f.code),
  (codes) => {
    for (const code of codes) sizeOf(code).catch(showError)
  },
  { immediate: true },
)

async function sizeOf(code: string): Promise<Vec3> {
  const known = sizes.value[code]
  if (known) return known
  const item = props.items.find((i) => i.code === code)
  const fill = Object.values(props.shelf.fill).find((f) => f.code === code)
  const key = item?.key ?? fill?.key
  if (!key) throw new Error(`${code} is not in the shop catalogue`)
  const size = await modelSize(itemModelUrl({ key, code }))
  sizes.value = { ...sizes.value, [code]: size }
  return size
}

function showError(error: unknown): void {
  notice.value = error instanceof Error ? error.message : String(error)
}

function wholeIn(value: string, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(Number(value)) || min))
}

function fitted(fill: ShelfSlotFill, box: SlotBox): ShelfSlotFill {
  const size = sizes.value[fill.code]
  return size ? { ...fill, count: Math.max(1, Math.min(fill.count, slotCapacity(box.size, size, fill.arrange))) } : fill
}

function setShape(patch: Partial<Shape>): void {
  const shape = { ...props.shelf, ...patch }
  const next = { ...shape, levels: Math.min(shape.levels, shelfMaxLevels(shape.shelf)) }
  const kept = new Map(slotBoxes(next).map((b) => [b.key, b]))
  const fill = Object.fromEntries(Object.entries(next.fill).flatMap(([key, f]) => {
    const box = kept.get(key)
    return box ? [[key, fitted(f, box)] as const] : []
  }))
  emit('change', { ...next, fill })
}

function setFill(key: string, fill: ShelfSlotFill | null): void {
  const { [key]: _, ...rest } = props.shelf.fill
  emit('change', { ...props.shelf, fill: fill ? { ...rest, [key]: fill } : rest })
}

async function setItem(code: string): Promise<void> {
  const key = selected.value
  const box = selectedBox.value
  const item = props.items.find((i) => i.code === code)
  if (!key || !box || !item) return
  notice.value = null
  const arrange = selectedFill.value?.arrange ?? 'rows'
  const size = await sizeOf(code).catch(showError)
  if (!size) return
  const capacity = slotCapacity(box.size, size, arrange)
  if (capacity === 0) {
    notice.value = `${item.label} is too big for this slot: give the shelf fewer levels or slots.`
    return
  }
  setFill(key, { code, key: item.key, price: item.price, count: capacity, arrange })
}

function patchFill(patch: Partial<ShelfSlotFill>): void {
  const key = selected.value
  const fill = selectedFill.value
  const box = selectedBox.value
  if (key && fill && box) setFill(key, fitted({ ...fill, ...patch }, box))
}

function previewOf(code: string): string | null {
  return props.items.find((i) => i.code === code)?.preview ?? null
}

function pick(key: string): void {
  selected.value = key
  notice.value = null
}
</script>

<template>
  <div class="flex flex-col gap-1.5 rounded-lg bg-ink-950/50 p-2">
    <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span class="text-xs text-mist">Type</span>
      <EditorSearchSelect :model-value="shelf.shelf" :options="TYPES" :searchable="false" @update:model-value="setShape({ shelf: $event as ShelfType })" />
    </div>
    <div class="grid grid-cols-3 gap-1 text-[10px] text-mist">
      <label class="flex flex-col">Length m<input type="number" step="1" :min="MIN_SHELF_LENGTH" :max="MAX_SHELF_LENGTH" class="cc-input px-1 py-0.5 text-xs" :value="shelf.length" @change="setShape({ length: wholeIn(($event.target as HTMLInputElement).value, MIN_SHELF_LENGTH, MAX_SHELF_LENGTH) })" /></label>
      <label class="flex flex-col">Levels<input type="number" step="1" min="1" :max="shelfMaxLevels(shelf.shelf)" class="cc-input px-1 py-0.5 text-xs" :value="shelf.levels" :disabled="shelfMaxLevels(shelf.shelf) === 1" @change="setShape({ levels: wholeIn(($event.target as HTMLInputElement).value, 1, shelfMaxLevels(shelf.shelf)) })" /></label>
      <label class="flex flex-col">Slots / level<input type="number" step="1" min="1" :max="MAX_SHELF_SLOTS" class="cc-input px-1 py-0.5 text-xs" :value="shelf.slots" @change="setShape({ slots: wholeIn(($event.target as HTMLInputElement).value, 1, MAX_SHELF_SLOTS) })" /></label>
    </div>
    <div v-for="{ face, label, levels } in grid" :key="face" class="flex flex-col gap-1">
      <p class="m-0 mt-1 text-[11px] font-extrabold uppercase text-mist">{{ label }}</p>
      <div v-for="(cells, row) in levels" :key="row" class="grid gap-1" :style="{ gridTemplateColumns: `repeat(${shelf.slots}, minmax(0, 1fr))` }">
        <button
          v-for="cell in cells"
          :key="cell.key"
          type="button"
          class="flex h-9 items-center justify-center overflow-hidden rounded-md bg-white/5 text-mist hover:bg-white/10"
          :class="selected === cell.key ? 'ring-2 ring-pool' : ''"
          :title="cell.fill?.code ?? 'Empty: shows a coloured cube'"
          @click="pick(cell.key)"
        >
          <img v-if="cell.preview" :src="cell.preview" alt="" class="h-full w-full object-contain" />
          <span v-else-if="cell.fill" class="text-[10px] font-bold text-fog">×{{ cell.fill.count }}</span>
          <UiIcon v-else name="plus" :size="12" />
        </button>
      </div>
    </div>
    <div v-if="selected && selectedBox" class="flex flex-col gap-1.5 border-t border-ink-700/70 pt-1.5">
      <div class="flex items-center gap-2">
        <span class="flex-1 text-xs text-mist">Slot <span class="font-mono text-fog">{{ selected }}</span></span>
        <button v-if="selectedFill" type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2" title="Empty this slot" @click="setFill(selected, null)">
          <UiIcon name="trash" :size="12" /> Clear
        </button>
      </div>
      <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
        <span class="text-xs text-mist">Item</span>
        <EditorSearchSelect :model-value="selectedFill?.code ?? ''" :options="itemOptions" placeholder="Pick an item" @update:model-value="setItem" />
      </div>
      <template v-if="selectedFill">
        <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
          <span class="text-xs text-mist">Arrangement</span>
          <EditorSearchSelect :model-value="selectedFill.arrange" :options="ARRANGES" :searchable="false" @update:model-value="patchFill({ arrange: $event as ShelfArrange })" />
        </div>
        <label class="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs text-mist">
          Copies{{ selectedCapacity !== null ? ` (max ${selectedCapacity})` : '' }}
          <input type="number" min="1" step="1" :max="selectedCapacity ?? undefined" class="cc-input py-1 text-sm" :value="selectedFill.count" @change="patchFill({ count: wholeIn(($event.target as HTMLInputElement).value, 1, selectedCapacity ?? selectedFill.count) })" />
        </label>
        <label class="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs text-mist">
          Price (coins)
          <input type="number" min="1" step="1" class="cc-input py-1 text-sm" :value="selectedFill.price" @change="patchFill({ price: Number(($event.target as HTMLInputElement).value) })" />
        </label>
      </template>
      <p v-if="notice" class="m-0 text-xs text-coral">{{ notice }}</p>
    </div>
    <p v-else class="m-0 text-[11px] text-mist">Click a slot to fill it. An empty slot shows a coloured cube.</p>
  </div>
</template>
