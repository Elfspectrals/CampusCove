<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import EditorSearchSelect from '../mallEditor/EditorSearchSelect.vue'
import { MAX_POINT_DISTANCE, npcStateId, type FreeNpc, type NpcBehaviorFile } from '../../../game/npcBehavior/npcBehavior'
import { areaRadii } from '../../../game/npcBehavior/npcTreeEdit'
import type { ZoneNpcs } from '../../../composables/useNpcBehaviorEditor'
import type { Vec3 } from '../../../game/mallTemplates/mallTemplate'

const props = defineProps<{ zones: ZoneNpcs[]; file: NpcBehaviorFile }>()
const emit = defineEmits<{
  assign: [zone: string, npc: FreeNpc, tree: string]
  placePoint: [zone: string, npc: string, point: string, at: Vec3]
  openTree: [key: string]
}>()

const SPANS = [20, 40, 60] as const
const picked = ref<{ zone: string; npc: string } | null>(null)
const activePoint = ref('')
const span = ref<(typeof SPANS)[number]>(40)

const treeOptions = computed(() => [{ value: '', label: 'No tree (stands still)' }, ...Object.entries(props.file.trees).map(([key, t]) => ({ value: key, label: `${t.name} · ${key}` }))])
const zone = computed(() => props.zones.find((z) => z.zone === picked.value?.zone) ?? null)
const npc = computed(() => zone.value?.npcs.find((n) => n.id === picked.value?.npc) ?? null)
const assignment = computed(() => (picked.value ? (props.file.npcs.find((a) => a.zone === picked.value!.zone && a.npc === picked.value!.npc) ?? null) : null))
const tree = computed(() => (assignment.value ? props.file.trees[assignment.value.tree] : undefined))
const points = computed(() => Object.entries(assignment.value?.points ?? {}))
const radii = computed(() => [...new Set(tree.value ? areaRadii(tree.value.root) : [])])

const view = computed(() => {
  const [x, , z] = npc.value?.position ?? [0, 0, 0]
  return { x: x - span.value, z: z - span.value, size: span.value * 2 }
})
const gridLines = computed(() => {
  const step = 5
  const from = (start: number) => {
    const lines: number[] = []
    for (let v = Math.ceil(start / step) * step; v <= start + view.value.size; v += step) lines.push(v)
    return lines
  }
  return { xs: from(view.value.x), zs: from(view.value.z) }
})

watch(points, (list) => {
  if (!list.some(([k]) => k === activePoint.value)) activePoint.value = list[0]?.[0] ?? ''
})

function treeOf(zoneKey: string, npcId: string): string {
  return props.file.npcs.find((a) => a.zone === zoneKey && a.npc === npcId)?.tree ?? ''
}

function select(zoneKey: string, npcId: string): void {
  picked.value = { zone: zoneKey, npc: npcId }
}

function onMapClick(event: MouseEvent): void {
  const svg = event.currentTarget as SVGSVGElement
  const ctm = svg.getScreenCTM()
  if (!ctm || !npc.value || !picked.value || !activePoint.value) return
  const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse())
  const [hx, hy, hz] = npc.value.position
  const dx = p.x - hx
  const dz = p.y - hz
  const d = Math.hypot(dx, dz)
  const k = d > MAX_POINT_DISTANCE ? MAX_POINT_DISTANCE / d : 1
  const round = (v: number) => Math.round(v * 10) / 10
  emit('placePoint', picked.value.zone, picked.value.npc, activePoint.value, [round(hx + dx * k), hy, round(hz + dz * k)])
}
</script>

<template>
  <div class="flex min-h-0 flex-1 gap-2">
    <section class="cc-panel-flat flex w-[360px] min-w-0 shrink-0 flex-col overflow-hidden">
      <header class="border-b-2 border-ink-600/50 px-3 py-2">
        <span class="cc-eyebrow m-0 text-mist">Zone NPCs</span>
        <p class="m-0 mt-1 text-xs text-mist">Sellers, buyers and staff keep their own behaviour and are not listed.</p>
      </header>
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
        <div v-for="z in zones" :key="z.zone" class="flex flex-col gap-1">
          <p class="cc-eyebrow m-0 px-1 text-mist">{{ z.zone }}</p>
          <div
            v-for="n in z.npcs"
            :key="n.id"
            :class="['flex items-center gap-2 rounded-xl px-2 py-1.5', picked?.zone === z.zone && picked.npc === n.id ? 'bg-sun/15 ring-2 ring-sun/60' : 'bg-ink-950/40']"
          >
            <button type="button" class="flex min-w-0 flex-1 items-center gap-2 text-left" @click="select(z.zone, n.id)">
              <span class="h-4 w-4 shrink-0 rounded-full border border-ink-950" :style="{ background: n.body ?? '#c8946a' }" />
              <span class="truncate font-mono text-sm font-bold">{{ n.id }}</span>
            </button>
            <EditorSearchSelect
              class="w-40"
              :model-value="treeOf(z.zone, n.id)"
              :options="treeOptions"
              :searchable="false"
              @update:model-value="(key: string) => { emit('assign', z.zone, n, key); select(z.zone, n.id) }"
            />
          </div>
        </div>
        <p v-if="zones.length === 0" class="m-0 text-xs text-mist">No free NPC in the zones. Add one with the zone editor first.</p>
      </div>
    </section>

    <section class="cc-panel-flat flex min-w-0 flex-1 flex-col overflow-hidden">
      <header class="flex flex-wrap items-center gap-2 border-b-2 border-ink-600/50 px-3 py-2">
        <span class="cc-eyebrow m-0 text-mist">Points</span>
        <template v-if="npc && picked">
          <span class="font-mono text-xs font-bold">{{ npcStateId(picked.zone, picked.npc) }}</span>
          <button v-if="assignment" type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2" @click="emit('openTree', assignment.tree)">Open tree</button>
          <div class="ml-auto flex items-center gap-1 text-xs font-bold">
            <span class="text-mist">View</span>
            <button v-for="s in SPANS" :key="s" type="button" :class="['cc-btn cc-btn-sm px-2', span === s ? 'cc-btn-sun' : 'cc-btn-ghost']" @click="span = s">± {{ s }} m</button>
          </div>
        </template>
      </header>
      <p v-if="!npc" class="m-0 p-3 text-xs text-mist">Pick an NPC on the left.</p>
      <p v-else-if="!assignment" class="m-0 p-3 text-xs text-mist">This NPC stands still. Give it a tree to place its points.</p>
      <div v-else class="flex min-h-0 flex-1 gap-2 p-2">
        <div class="flex w-44 shrink-0 flex-col gap-1">
          <p v-if="points.length === 0" class="m-0 text-xs text-mist">The tree "{{ tree?.name }}" uses no point of its own: only home and target.</p>
          <button
            v-for="[key, at] in points"
            :key="key"
            type="button"
            :class="['flex flex-col rounded-xl px-2 py-1.5 text-left', activePoint === key ? 'bg-pool/25 ring-2 ring-pool' : 'bg-ink-950/40']"
            @click="activePoint = key"
          >
            <span class="font-mono text-sm font-bold">{{ key }}</span>
            <span class="font-mono text-[11px] text-mist">{{ at[0] }}, {{ at[1] }}, {{ at[2] }}</span>
          </button>
          <p v-if="points.length" class="m-0 mt-1 text-xs text-mist">Click the map to put the selected point there. NPCs walk in a straight line: keep the way clear.</p>
        </div>
        <div class="relative min-h-0 min-w-0 flex-1">
          <svg
            class="absolute inset-0 h-full w-full cursor-crosshair rounded-xl bg-ink-950"
            :viewBox="`${view.x} ${view.z} ${view.size} ${view.size}`"
            preserveAspectRatio="xMidYMid meet"
            @click="onMapClick"
          >
            <line v-for="x in gridLines.xs" :key="`x${x}`" :x1="x" :x2="x" :y1="view.z" :y2="view.z + view.size" stroke="rgb(255 255 255 / 0.06)" :stroke-width="view.size / 400" />
            <line v-for="z in gridLines.zs" :key="`z${z}`" :y1="z" :y2="z" :x1="view.x" :x2="view.x + view.size" stroke="rgb(255 255 255 / 0.06)" :stroke-width="view.size / 400" />
            <circle :cx="npc.position[0]" :cy="npc.position[2]" :r="MAX_POINT_DISTANCE" fill="none" stroke="rgb(255 255 255 / 0.15)" :stroke-width="view.size / 300" stroke-dasharray="1 1" />
            <circle v-for="r in radii" :key="`r${r}`" :cx="npc.position[0]" :cy="npc.position[2]" :r="r" fill="rgb(47 122 100 / 0.15)" stroke="#2f7a64" :stroke-width="view.size / 300" />
            <circle v-for="(p, i) in zone!.plants" :key="`plant${i}`" :cx="p[0]" :cy="p[2]" :r="view.size / 260" fill="#6fbf5a" />
            <circle v-for="p in zone!.props" :key="p.id" :cx="p.position[0]" :cy="p.position[2]" :r="view.size / 160" :fill="p.kind === 'npc' ? '#d9a35c' : 'rgb(255 255 255 / 0.3)'">
              <title>{{ p.id }} · {{ p.kind }}</title>
            </circle>
            <line
              v-for="[key, at] in points"
              :key="`l${key}`"
              :x1="npc.position[0]"
              :y1="npc.position[2]"
              :x2="at[0]"
              :y2="at[2]"
              stroke="#5b8fd9"
              :stroke-width="view.size / 250"
              stroke-dasharray="1.5 1"
            />
            <circle :cx="npc.position[0]" :cy="npc.position[2]" :r="view.size / 70" fill="#ffcc33" stroke="#0a0e17" :stroke-width="view.size / 400" />
            <text :x="npc.position[0]" :y="npc.position[2] - view.size / 40" :font-size="view.size / 40" fill="#ffcc33" text-anchor="middle" font-weight="700">home</text>
            <g v-for="[key, at] in points" :key="`p${key}`">
              <circle :cx="at[0]" :cy="at[2]" :r="view.size / 80" :fill="activePoint === key ? '#7fb2ff' : '#2e5f9e'" stroke="#0a0e17" :stroke-width="view.size / 400" />
              <text :x="at[0]" :y="at[2] - view.size / 45" :font-size="view.size / 45" fill="#cfe0ff" text-anchor="middle" font-weight="700">{{ key }}</text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  </div>
</template>
