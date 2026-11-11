<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDialogFocus } from '../../../composables/useDialogFocus'
import UiIcon from '../../ui/UiIcon.vue'
import { samePreset, type CellPreset, type MallCell, type TemplateAssignments } from '../../../game/mallTemplates/mallTemplate.ts'

export interface MallPlaza {
  id: string
  name: string
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  floors: number
  outdoor: boolean
}

export interface MallStoreMark {
  key: string
  name: string
  position: [number, number, number]
  cell?: string
}

const props = defineProps<{
  cells: MallCell[]
  plazas: MallPlaza[]
  stores: MallStoreMark[]
  assignments: TemplateAssignments
  preset: CellPreset | null
  templateKey: string
  hasProps: boolean
  canAssign: boolean
  canWrite: boolean
  selectedId: string | null
  shopsOnly?: boolean
}>()

const emit = defineEmits<{ close: []; use: [cell: MallCell]; assign: [cell: MallCell]; clear: [cell: MallCell]; openShop: [key: string] }>()

const FREE_COLOR = '#2fb457'
const TAKEN_COLOR = '#e0483e'
const PLAZA_COLOR = '#d9dde6'
const PARK_COLOR = '#bfe3cc'
const PLAZA_LABEL_COLOR = '#6b7385'
const ANCHOR_COLOR = '#5b6478'
const MARGIN = 6

const level = ref(0)
const picked = ref<MallCell | null>(props.cells.find((c) => c.id === props.selectedId) ?? null)
const pickedStore = ref<MallStoreMark | null>(null)
if (picked.value) level.value = picked.value.level

const levels = computed(() => [...new Set(props.cells.map((c) => c.level))].sort((a, b) => a - b))
const shown = computed(() => props.cells.filter((c) => c.level === level.value))
const shownPlazas = computed(() => props.plazas.filter((p) => p.floors > level.value || (p.outdoor && level.value === 0)))
const anchors = computed(() => (level.value === 0 ? props.stores.filter((s) => props.shopsOnly || !s.cell) : []))

const frame = computed(() => {
  const xs = [...shown.value.flatMap((c) => [c.bounds.minX, c.bounds.maxX]), ...shownPlazas.value.flatMap((p) => [p.bounds.minX, p.bounds.maxX])]
  const zs = [...shown.value.flatMap((c) => [c.bounds.minZ, c.bounds.maxZ]), ...shownPlazas.value.flatMap((p) => [p.bounds.minZ, p.bounds.maxZ])]
  const minX = Math.min(...xs) - MARGIN
  const minZ = Math.min(...zs) - MARGIN
  return { minX, minZ, width: Math.max(...xs) - minX + MARGIN, height: Math.max(...zs) - minZ + MARGIN }
})

function isUpright(plaza: MallPlaza): boolean {
  return plaza.bounds.maxZ - plaza.bounds.minZ > (plaza.bounds.maxX - plaza.bounds.minX) * 1.5
}

function cellColor(cell: MallCell): string {
  return isClosed(cell) || held(cell) ? TAKEN_COLOR : FREE_COLOR
}

function isClosed(cell: MallCell): boolean {
  return cell.status !== 'planned'
}

function held(cell: MallCell): string | undefined {
  return props.assignments.cells[cell.id]
}

function fits(cell: MallCell): boolean {
  return !!props.preset && samePreset(cell, props.preset)
}

function cellOpacity(cell: MallCell): number {
  return props.hasProps && !isClosed(cell) && !held(cell) && !fits(cell) ? 0.35 : 1
}

function width(cell: MallCell): number {
  return cell.bounds.maxX - cell.bounds.minX
}

function height(cell: MallCell): number {
  return cell.bounds.maxZ - cell.bounds.minZ
}

function statusText(cell: MallCell): string {
  if (cell.status === 'passage') return 'Staff passage'
  if (cell.status === 'construction') return 'Under construction'
  if (cell.status === 'open') return 'Open store'
  const holder = held(cell)
  if (holder) return holder === props.templateKey ? 'Holds this template' : `Holds ${holder}`
  return 'Free'
}

function pick(cell: MallCell): void {
  if (props.shopsOnly || isClosed(cell)) return
  picked.value = cell
  pickedStore.value = null
}

function pickStore(store: MallStoreMark): void {
  pickedStore.value = store
  picked.value = null
}

const pickedHeld = computed(() => (picked.value ? held(picked.value) : undefined))
const pickedFits = computed(() => !!picked.value && fits(picked.value))

const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => emit('close') })

watch(level, () => {
  if (picked.value && picked.value.level !== level.value) picked.value = null
})

</script>

<template>
  <div ref="dialogEl" class="cc-backdrop" role="dialog" aria-modal="true" aria-labelledby="mall-map-title" @click.self="emit('close')" @keydown.stop>
    <div class="cc-modal flex max-h-[92vh] w-[min(1200px,96vw)] max-w-none flex-col gap-3 overflow-hidden">
      <header class="flex items-center gap-3 rounded-xl bg-pool/80 px-4 py-2 text-white">
        <button type="button" class="disabled:opacity-30" aria-label="Floor below" :disabled="level === levels[0]" @click="level = levels[levels.indexOf(level) - 1]!">
          <UiIcon name="chevron-left" :size="22" />
        </button>
        <h2 id="mall-map-title" class="cc-display m-0 flex-1 text-center text-base tracking-[0.2em] sm:text-xl">COVE PARKVIEW MALL · {{ level === 0 ? 'GROUND FLOOR' : `FLOOR ${level}` }}</h2>
        <button type="button" class="disabled:opacity-30" aria-label="Floor above" :disabled="level === levels[levels.length - 1]" @click="level = levels[levels.indexOf(level) + 1]!">
          <UiIcon name="chevron-right" :size="22" />
        </button>
        <button type="button" class="ml-2" title="Close (Esc)" aria-label="Close the map" @click="emit('close')"><UiIcon name="x" :size="20" /></button>
      </header>
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row">
        <svg :viewBox="`${frame.minX} ${frame.minZ} ${frame.width} ${frame.height}`" class="min-h-[45vh] w-full flex-1 rounded-xl bg-[#eef0f4] lg:min-h-0" preserveAspectRatio="xMidYMid meet">
          <g v-for="plaza in shownPlazas" :key="plaza.id">
            <rect
              :x="plaza.bounds.minX"
              :y="plaza.bounds.minZ"
              :width="plaza.bounds.maxX - plaza.bounds.minX"
              :height="plaza.bounds.maxZ - plaza.bounds.minZ"
              :fill="plaza.outdoor ? PARK_COLOR : PLAZA_COLOR"
              fill-opacity="0.6"
            />
            <text
              :x="(plaza.bounds.minX + plaza.bounds.maxX) / 2"
              :y="(plaza.bounds.minZ + plaza.bounds.maxZ) / 2"
              :transform="isUpright(plaza) ? `rotate(-90 ${(plaza.bounds.minX + plaza.bounds.maxX) / 2} ${(plaza.bounds.minZ + plaza.bounds.maxZ) / 2})` : undefined"
              text-anchor="middle"
              dominant-baseline="middle"
              :fill="PLAZA_LABEL_COLOR"
              class="pointer-events-none text-[3px] font-extrabold uppercase tracking-[0.2em]"
            >
              {{ plaza.name }}
            </text>
          </g>
          <g v-for="cell in shown" :key="cell.id" :class="isClosed(cell) ? '' : 'cursor-pointer'" @click="pick(cell)">
            <rect
              :x="cell.bounds.minX + 0.25"
              :y="cell.bounds.minZ + 0.25"
              :width="width(cell) - 0.5"
              :height="height(cell) - 0.5"
              rx="0.6"
              :fill="cellColor(cell)"
              :fill-opacity="cellOpacity(cell)"
              :stroke="cell.id === picked?.id ? '#0b0e2a' : held(cell) === templateKey && templateKey ? '#ffd23f' : 'none'"
              :stroke-width="cell.id === picked?.id ? 0.9 : 0.6"
            >
              <title>{{ cell.id }} · {{ cell.name }} · {{ cell.width }} × {{ cell.depth }} m · {{ statusText(cell) }}</title>
            </rect>
            <text
              v-if="width(cell) > 3 && height(cell) > 3"
              :x="(cell.bounds.minX + cell.bounds.maxX) / 2"
              :y="(cell.bounds.minZ + cell.bounds.maxZ) / 2 - (held(cell) ? 1.2 : 0)"
              text-anchor="middle"
              dominant-baseline="middle"
              class="pointer-events-none fill-white text-[2.6px] font-bold"
            >
              {{ cell.id }}
            </text>
            <text
              v-if="held(cell) && width(cell) > 3 && height(cell) > 3"
              :x="(cell.bounds.minX + cell.bounds.maxX) / 2"
              :y="(cell.bounds.minZ + cell.bounds.maxZ) / 2 + 1.6"
              text-anchor="middle"
              dominant-baseline="middle"
              class="pointer-events-none fill-white text-[1.7px] font-bold"
            >
              {{ held(cell) }}
            </text>
          </g>
          <g v-for="store in anchors" :key="store.key" class="cursor-pointer" @click="pickStore(store)">
            <title>{{ store.name }} · walk-in shop, opens in its own zone</title>
            <circle
              :cx="store.position[0]"
              :cy="store.position[2]"
              r="2.2"
              :fill="ANCHOR_COLOR"
              :stroke="store.key === pickedStore?.key ? '#ffd23f' : 'none'"
              stroke-width="0.8"
            />
            <text :x="store.position[0]" :y="store.position[2] + 4.5" text-anchor="middle" class="pointer-events-none fill-[#3a4256] text-[2.6px] font-bold">{{ store.name }}</text>
          </g>
        </svg>
        <aside class="flex shrink-0 flex-col gap-3 text-sm lg:w-64 lg:overflow-y-auto">
          <section v-if="!shopsOnly" class="cc-panel-flat p-3">
            <p class="cc-eyebrow m-0 mb-2 text-mist">Cells</p>
            <p class="m-0 flex items-center gap-2 py-0.5 font-bold"><span class="h-3 w-3 rounded" :style="{ background: FREE_COLOR }" />Free</p>
            <p class="m-0 flex items-center gap-2 py-0.5 font-bold"><span class="h-3 w-3 rounded" :style="{ background: TAKEN_COLOR }" />Occupied</p>
            <p class="m-0 flex items-center gap-2 py-0.5 text-xs text-mist"><span class="h-3 w-3 rounded border-2 border-sun" />Holds this template</p>
            <p v-if="hasProps" class="m-0 py-0.5 text-xs text-mist">Faded: another size than the props are laid out for.</p>
          </section>
          <section v-if="pickedStore" class="cc-panel-flat flex flex-col gap-2 p-3">
            <p class="cc-eyebrow m-0 text-mist">Shop</p>
            <p class="m-0 text-base font-extrabold">{{ pickedStore.name }}</p>
            <p class="m-0 text-mist">Walk-in shop · own zone</p>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-sun" @click="emit('openShop', pickedStore.key)">Open shop editor</button>
          </section>
          <section v-else-if="picked" class="cc-panel-flat flex flex-col gap-2 p-3">
            <p class="cc-eyebrow m-0 text-mist">Cell {{ picked.id }}</p>
            <p class="m-0 text-base font-extrabold">{{ picked.name }}</p>
            <p class="m-0 text-mist">{{ picked.width }} × {{ picked.depth }} m · {{ picked.level === 0 ? 'ground floor' : `floor ${picked.level}` }}</p>
            <p class="m-0 font-bold">{{ statusText(picked) }}</p>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="emit('use', picked)">Build for this cell</button>
            <button v-if="canWrite && pickedHeld === templateKey && templateKey" type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="emit('clear', picked)">Clear this cell</button>
            <button
              v-else-if="canWrite && !pickedHeld"
              type="button"
              class="cc-btn cc-btn-sm cc-btn-sun"
              :disabled="!canAssign || !pickedFits"
              :title="!pickedFits ? 'Build for this cell first: the template is another size' : !canAssign ? 'Name and save the template first' : ''"
              @click="emit('assign', picked)"
            >
              Assign {{ templateKey || 'template' }} here
            </button>
          </section>
          <p v-else class="m-0 text-mist">{{ shopsOnly ? 'Click a walk-in shop to open its editor.' : 'Click a shop to see it.' }}</p>
        </aside>
      </div>
    </div>
  </div>
</template>
