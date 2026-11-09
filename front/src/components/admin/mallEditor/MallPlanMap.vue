<script setup lang="ts">
import { computed, ref } from 'vue'
import { samePreset, type CellPreset, type MallCell, type TemplateAssignments } from '../../../game/mallTemplates/mallTemplate.ts'

const props = defineProps<{
  cells: MallCell[]
  assignments: TemplateAssignments
  preset: CellPreset | null
  templateKey: string
  selectedId: string | null
}>()

const emit = defineEmits<{ select: [cell: MallCell] }>()

type CellState = 'fits' | 'free' | 'mine' | 'taken' | 'closed'

const STATE_CLASS: Record<CellState, string> = {
  fits: 'fill-mint/70 hover:fill-mint cursor-pointer',
  free: 'fill-ink-500/60 hover:fill-ink-500 cursor-pointer',
  mine: 'fill-sun/80 hover:fill-sun cursor-pointer',
  taken: 'fill-pool/60 hover:fill-pool/80 cursor-pointer',
  closed: 'fill-ink-800',
}

const LEGEND: Array<[CellState, string]> = [
  ['fits', 'Free, this size'],
  ['free', 'Free, other size'],
  ['mine', 'Holds this template'],
  ['taken', 'Holds another template'],
  ['closed', 'Open store or passage'],
]

const level = ref(0)
const levels = computed(() => [...new Set(props.cells.map((c) => c.level))].sort())
const shown = computed(() => props.cells.filter((c) => c.level === level.value))

const viewBox = computed(() => {
  const xs = shown.value.flatMap((c) => [c.bounds.minX, c.bounds.maxX])
  const zs = shown.value.flatMap((c) => [c.bounds.minZ, c.bounds.maxZ])
  const margin = 4
  return `${Math.min(...xs) - margin} ${Math.min(...zs) - margin} ${Math.max(...xs) - Math.min(...xs) + margin * 2} ${Math.max(...zs) - Math.min(...zs) + margin * 2}`
})

function stateOf(cell: MallCell): CellState {
  if (cell.status !== 'planned') return 'closed'
  const held = props.assignments.cells[cell.id]
  if (held !== undefined) return held === props.templateKey ? 'mine' : 'taken'
  return props.preset && samePreset(cell, props.preset) ? 'fits' : 'free'
}

function titleOf(cell: MallCell): string {
  const held = props.assignments.cells[cell.id]
  return `${cell.id} · ${cell.name} · ${cell.width} × ${cell.depth} m${held ? ` · ${held}` : ''}${cell.status !== 'planned' ? ` · ${cell.status}` : ''}`
}

function pick(cell: MallCell): void {
  if (stateOf(cell) !== 'closed') emit('select', cell)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center gap-2 text-xs font-bold text-mist">
      <button
        v-for="l in levels"
        :key="l"
        type="button"
        :class="['cc-btn cc-btn-sm', level === l ? 'cc-btn-sun' : 'cc-btn-ghost']"
        @click="level = l"
      >
        {{ l === 0 ? 'Ground floor' : `Level ${l}` }}
      </button>
      <span v-for="[state, label] in LEGEND" :key="state" class="flex items-center gap-1">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" :class="STATE_CLASS[state]" /></svg>
        {{ label }}
      </span>
    </div>
    <svg :viewBox="viewBox" class="max-h-80 w-full rounded-xl bg-ink-950/70" preserveAspectRatio="xMidYMid meet">
      <g v-for="cell in shown" :key="cell.id" @click="pick(cell)">
        <rect
          :x="cell.bounds.minX"
          :y="cell.bounds.minZ"
          :width="cell.bounds.maxX - cell.bounds.minX"
          :height="cell.bounds.maxZ - cell.bounds.minZ"
          :class="[STATE_CLASS[stateOf(cell)], cell.id === selectedId ? 'stroke-fog' : 'stroke-ink-950']"
          :stroke-width="cell.id === selectedId ? 0.8 : 0.3"
        >
          <title>{{ titleOf(cell) }}</title>
        </rect>
        <text
          v-if="cell.bounds.maxX - cell.bounds.minX > 4 && cell.bounds.maxZ - cell.bounds.minZ > 4"
          :x="(cell.bounds.minX + cell.bounds.maxX) / 2"
          :y="(cell.bounds.minZ + cell.bounds.maxZ) / 2"
          text-anchor="middle"
          dominant-baseline="middle"
          class="pointer-events-none fill-ink-950 text-[2.4px] font-bold"
        >
          {{ cell.id }}
        </text>
      </g>
    </svg>
  </div>
</template>
