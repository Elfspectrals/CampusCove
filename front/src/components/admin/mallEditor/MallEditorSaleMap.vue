<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialogFocus } from '../../../composables/useDialogFocus'
import UiIcon from '../../ui/UiIcon.vue'
import EditorSearchSelect, { type SelectOption } from './EditorSearchSelect.vue'
import { APPLE_SALE, PICKS_PER_HOUR, dayCurve, type SaleCurve } from '../../../game/economy/sharemath.ts'
import type { NpcProp, TemplateProp } from '../../../game/mallTemplates/mallTemplate.ts'
import type { WorldBounds } from '../../../game/world/worldManifest'
import type { WorldMapImage } from '../../../game/world/minimap'
import { SALE_ROLES, type SaleArea, type SaleOffer, type SaleRole } from '../../../game/zoneDecor/zoneDecor.ts'

const props = defineProps<{
  zoneKey: string
  bounds: WorldBounds
  image: WorldMapImage | null
  props: readonly TemplateProp[]
  areas: SaleArea[]
  itemOptions: SelectOption[]
  shopPrices: Record<string, number>
  validate: (areas: SaleArea[]) => string | null
}>()

const emit = defineEmits<{ close: []; change: [areas: SaleArea[]] }>()

const ROLE_COLOR: Record<SaleRole, string> = { seller: '#f2506f', buyer: '#1a98c8' }
const ROLE_OPTIONS: SelectOption[] = SALE_ROLES.map((role) => ({ value: role, label: role === 'seller' ? 'Seller (sells the cart)' : 'Buyer (buys from players)' }))
const APPLE_COLOR = '#1a98c8'
const OFFER_COLOR = '#f2506f'
const CHART = { width: 320, height: 170, left: 40, right: 56, top: 10, bottom: 24 }
const CHART_HOURS = 8
const CHART_STEPS = 32
const NEW_OFFER: SaleOffer = { code: '', price: 3, quota: 100, overPrice: 1 }

const selectedId = ref<string | null>(props.areas[0]?.id ?? null)
const drawing = ref<'new' | 'redraw' | null>(null)
const dragFrom = ref<{ x: number; z: number } | null>(null)
const dragTo = ref<{ x: number; z: number } | null>(null)
const chartOffer = ref(0)
const hoverStep = ref<number | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)

const selected = computed(() => props.areas.find((a) => a.id === selectedId.value) ?? null)
const npcs = computed(() => props.props.filter((p): p is NpcProp => p.kind === 'npc'))
const forSale = computed(() => props.props.filter((p) => p.kind === 'item' && p.forSale))
const problem = computed(() => props.validate(props.areas))
const draft = computed(() => (dragFrom.value && dragTo.value ? rectOf(dragFrom.value, dragTo.value) : null))

function inside(position: readonly number[], bounds: WorldBounds): boolean {
  return position[0]! >= bounds.minX && position[0]! <= bounds.maxX && position[2]! >= bounds.minZ && position[2]! <= bounds.maxZ
}

const npcOptions = computed<SelectOption[]>(() =>
  npcs.value.map((npc) => ({ value: npc.id, label: npc.id, group: selected.value && inside(npc.position, selected.value.bounds) ? 'In this area' : 'Elsewhere in the zone' })),
)

const soldHere = computed(() => (selected.value ? forSale.value.filter((p) => inside(p.position, selected.value!.bounds)) : []))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}

function rectOf(a: { x: number; z: number }, b: { x: number; z: number }): WorldBounds {
  return { minX: round(Math.min(a.x, b.x)), maxX: round(Math.max(a.x, b.x)), minZ: round(Math.min(a.z, b.z)), maxZ: round(Math.max(a.z, b.z)) }
}

function mapPoint(event: PointerEvent): { x: number; z: number } | null {
  const matrix = svgEl.value?.getScreenCTM()
  if (!matrix) return null
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: clamp(point.x, props.bounds.minX, props.bounds.maxX), z: clamp(point.y, props.bounds.minZ, props.bounds.maxZ) }
}

function startDraw(event: PointerEvent): void {
  if (!drawing.value) return
  dragFrom.value = mapPoint(event)
  dragTo.value = dragFrom.value
  svgEl.value?.setPointerCapture(event.pointerId)
}

function moveDraw(event: PointerEvent): void {
  if (dragFrom.value) dragTo.value = mapPoint(event)
}

function nextId(): string {
  let n = props.areas.length + 1
  while (props.areas.some((a) => a.id === `area_${n}`)) n++
  return `area_${n}`
}

function endDraw(): void {
  const rect = draft.value
  const mode = drawing.value
  dragFrom.value = null
  dragTo.value = null
  drawing.value = null
  if (!rect || rect.maxX - rect.minX < 1 || rect.maxZ - rect.minZ < 1) return
  if (mode === 'redraw' && selected.value) {
    update({ ...selected.value, bounds: rect })
    return
  }
  const id = nextId()
  const npc = npcs.value.find((p) => inside(p.position, rect))
  emit('change', [...props.areas, { id, name: `Area ${props.areas.length + 1}`, role: 'seller', npc: npc?.id ?? '', bounds: rect, offers: [] }])
  selectedId.value = id
}

function update(area: SaleArea): void {
  emit('change', props.areas.map((a) => (a.id === area.id ? area : a)))
}

function setRole(role: string): void {
  if (!selected.value) return
  const next = role as SaleRole
  update({ ...selected.value, role: next, offers: next === 'buyer' ? [{ ...NEW_OFFER }] : [] })
  chartOffer.value = 0
}

function removeArea(): void {
  if (!selected.value) return
  emit('change', props.areas.filter((a) => a.id !== selectedId.value))
  selectedId.value = null
}

function setOffer(index: number, patch: Partial<SaleOffer>): void {
  if (!selected.value) return
  update({ ...selected.value, offers: selected.value.offers.map((o, i) => (i === index ? { ...o, ...patch } : o)) })
}

function whole(value: string): number {
  return Number(value)
}

function addOffer(): void {
  if (!selected.value) return
  update({ ...selected.value, offers: [...selected.value.offers, { ...NEW_OFFER }] })
  chartOffer.value = selected.value.offers.length
}

function removeOffer(index: number): void {
  if (!selected.value) return
  update({ ...selected.value, offers: selected.value.offers.filter((_, i) => i !== index) })
  chartOffer.value = 0
}

const charted = computed<SaleOffer | null>(() => (selected.value?.role === 'buyer' ? (selected.value.offers[chartOffer.value] ?? null) : null))

function curve(sale: SaleCurve): Array<[number, number]> {
  return dayCurve(sale, PICKS_PER_HOUR, CHART_HOURS, CHART_STEPS)
}

const chart = computed(() => {
  const offer = charted.value
  if (!offer) return null
  const apples = curve(APPLE_SALE)
  const sold = curve(offer)
  const appleEnd = apples[apples.length - 1]![1]
  const soldEnd = sold[sold.length - 1]![1]
  const top = Math.max(1, appleEnd, soldEnd)
  const plotW = CHART.width - CHART.left - CHART.right
  const plotH = CHART.height - CHART.top - CHART.bottom
  const x = (hours: number) => CHART.left + (hours / CHART_HOURS) * plotW
  const y = (coins: number) => CHART.top + plotH - (coins / top) * plotH
  const path = (points: Array<[number, number]>) => points.map(([h, c], i) => `${i ? 'L' : 'M'}${x(h).toFixed(1)},${y(c).toFixed(1)}`).join(' ')
  return {
    apples,
    sold,
    appleEnd,
    soldEnd,
    top,
    x,
    y,
    applePath: path(apples),
    offerPath: path(sold),
    xTicks: [0, 2, 4, 6, 8],
    yTicks: [0, Math.round(top / 2), top],
  }
})

const warnings = computed(() => {
  const offer = charted.value
  if (!offer) return []
  const shop = props.shopPrices[offer.code]
  const list: string[] = []
  if (shop !== undefined && offer.price >= shop) list.push(`A shop sells ${offer.code} for ${shop} coins: buying it there and selling it here makes free coins.`)
  const hourly = offer.price * Math.min(PICKS_PER_HOUR, Math.max(offer.quota, 1))
  const appleHourly = APPLE_SALE.price * Math.min(PICKS_PER_HOUR, APPLE_SALE.quota)
  if (hourly > appleHourly * 1.5) list.push(`At full price the first hour pays ${hourly} coins, ${(hourly / appleHourly).toFixed(1)}× apple picking (${appleHourly}).`)
  return list
})

function onChartMove(event: PointerEvent): void {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
  const ratio = ((event.clientX - rect.left) / rect.width) * CHART.width
  const step = Math.round(((ratio - CHART.left) / (CHART.width - CHART.left - CHART.right)) * CHART_STEPS)
  hoverStep.value = step >= 0 && step <= CHART_STEPS ? step : null
}

const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => (drawing.value ? (drawing.value = null) : emit('close')) })
</script>

<template>
  <div ref="dialogEl" class="cc-backdrop" role="dialog" aria-modal="true" aria-labelledby="sale-map-title" @click.self="emit('close')" @keydown.stop>
    <div class="cc-modal flex max-h-[92vh] w-[min(1280px,96vw)] max-w-none flex-col gap-3 overflow-hidden">
      <header class="flex items-center gap-3 rounded-xl bg-pool/80 px-4 py-2 text-white">
        <h2 id="sale-map-title" class="cc-display m-0 flex-1 text-base tracking-[0.2em] sm:text-xl">SELLERS & BUYERS · {{ zoneKey.toUpperCase() }}</h2>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost text-white" :class="drawing === 'new' ? 'bg-white/20' : ''" @click="drawing = drawing === 'new' ? null : 'new'">
          <UiIcon name="plus" :size="16" /> New area
        </button>
        <button type="button" title="Close (Esc)" aria-label="Close the map" @click="emit('close')"><UiIcon name="x" :size="20" /></button>
      </header>
      <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:flex-row">
        <div class="relative min-h-[45vh] flex-1 lg:min-h-0">
          <svg
            ref="svgEl"
            :viewBox="`${bounds.minX} ${bounds.minZ} ${bounds.maxX - bounds.minX} ${bounds.maxZ - bounds.minZ}`"
            :class="['h-full w-full rounded-xl bg-[#3d5a3a]', drawing ? 'cursor-crosshair' : '']"
            preserveAspectRatio="xMidYMid meet"
            @pointerdown="startDraw"
            @pointermove="moveDraw"
            @pointerup="endDraw"
          >
            <image v-if="image" :href="image.url" :x="image.area.minX" :y="image.area.minZ" :width="image.area.maxX - image.area.minX" :height="image.area.maxZ - image.area.minZ" preserveAspectRatio="none" />
            <g v-for="area in areas" :key="area.id" class="cursor-pointer" @click="drawing ? undefined : (selectedId = area.id)">
              <rect
                :x="area.bounds.minX"
                :y="area.bounds.minZ"
                :width="area.bounds.maxX - area.bounds.minX"
                :height="area.bounds.maxZ - area.bounds.minZ"
                :fill="ROLE_COLOR[area.role]"
                fill-opacity="0.28"
                :stroke="ROLE_COLOR[area.role]"
                :stroke-width="area.id === selectedId ? 0.5 : 0.25"
              />
              <text :x="area.bounds.minX + 0.4" :y="area.bounds.minZ + 1.4" class="pointer-events-none fill-white text-[1.2px] font-bold">{{ area.name }}</text>
            </g>
            <rect v-if="draft" :x="draft.minX" :y="draft.minZ" :width="draft.maxX - draft.minX" :height="draft.maxZ - draft.minZ" fill="#ffffff" fill-opacity="0.2" stroke="#ffffff" stroke-width="0.25" stroke-dasharray="0.6 0.4" />
            <g v-for="item in forSale" :key="item.id" class="pointer-events-none">
              <circle :cx="item.position[0]" :cy="item.position[2]" r="0.35" fill="#ffca3a" stroke="#080a20" stroke-width="0.1" />
            </g>
            <g v-for="npc in npcs" :key="npc.id" class="pointer-events-none">
              <circle :cx="npc.position[0]" :cy="npc.position[2]" r="0.55" fill="#ffffff" stroke="#080a20" stroke-width="0.15" />
              <text :x="npc.position[0]" :y="npc.position[2] + 1.5" text-anchor="middle" class="fill-white text-[1px] font-bold">{{ npc.id }}</text>
            </g>
          </svg>
          <p v-if="drawing" class="absolute left-3 top-3 m-0 rounded-lg bg-ink-950/80 px-3 py-1.5 text-xs font-bold text-fog">Drag on the map to {{ drawing === 'new' ? 'draw a new area' : 'redraw this area' }} · Esc cancels</p>
        </div>
        <aside class="flex shrink-0 flex-col gap-3 text-sm lg:w-[360px] lg:overflow-y-auto">
          <section class="cc-panel-flat flex flex-col gap-1 p-3">
            <p class="cc-eyebrow m-0 mb-1 text-mist">Areas</p>
            <p v-if="areas.length === 0" class="m-0 text-xs text-mist">No area yet: click New area and drag on the map.</p>
            <button
              v-for="area in areas"
              :key="area.id"
              type="button"
              :class="['flex items-center gap-2 rounded-lg px-2 py-1 text-left font-bold', area.id === selectedId ? 'bg-pool/20 text-fog' : 'text-mist hover:bg-white/5']"
              @click="selectedId = area.id"
            >
              <span class="h-3 w-3 shrink-0 rounded" :style="{ background: ROLE_COLOR[area.role] }" />
              <span class="flex-1 truncate">{{ area.name }}</span>
              <span class="text-xs opacity-70">{{ area.role }} · {{ area.npc || 'no NPC' }}</span>
            </button>
          </section>
          <section v-if="selected" class="cc-panel-flat flex flex-col gap-2 p-3">
            <label class="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-mist">
              Name
              <input class="cc-input py-1 text-sm" :value="selected.name" @change="update({ ...selected, name: ($event.target as HTMLInputElement).value })" />
            </label>
            <div class="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-mist">
              Role
              <EditorSearchSelect :model-value="selected.role" :options="ROLE_OPTIONS" :searchable="false" @update:model-value="setRole" />
            </div>
            <div class="grid grid-cols-[4.5rem_1fr] items-center gap-2 text-xs text-mist">
              NPC
              <EditorSearchSelect :model-value="selected.npc" :options="npcOptions" placeholder="Pick an NPC…" @update:model-value="update({ ...selected, npc: $event })" />
            </div>
            <div class="flex gap-2">
              <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost flex-1" @click="drawing = 'redraw'"><UiIcon name="edit" :size="14" /> Redraw</button>
              <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost flex-1 text-coral" @click="removeArea"><UiIcon name="trash" :size="14" /> Delete</button>
            </div>
            <p v-if="selected.role === 'seller'" class="m-0 text-xs text-mist">
              Sells {{ soldHere.length }} item{{ soldHere.length === 1 ? '' : 's' }} for sale in this area<template v-if="soldHere.length">: {{ soldHere.map((p) => (p.kind === 'item' ? `${p.code} (${p.price ?? '?'})` : '')).join(', ') }}</template>.
            </p>
            <template v-else>
              <div class="grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem_1.25rem] items-center gap-1 text-[11px] font-extrabold uppercase text-mist">
                <span>Buys</span><span>Price</span><span>Per day</span><span>Then</span><span />
              </div>
              <div
                v-for="(offer, i) in selected.offers"
                :key="i"
                :class="['grid grid-cols-[1fr_3.5rem_3.5rem_3.5rem_1.25rem] items-center gap-1 rounded-lg', i === chartOffer ? 'bg-pool/10' : '']"
                @click="chartOffer = i"
              >
                <EditorSearchSelect :model-value="offer.code" :options="itemOptions" placeholder="Item…" @update:model-value="setOffer(i, { code: $event })" />
                <input type="number" min="1" step="1" class="cc-input px-1 py-1 text-xs" :value="offer.price" aria-label="Price at full rate" @change="setOffer(i, { price: whole(($event.target as HTMLInputElement).value) })" />
                <input type="number" min="0" step="1" class="cc-input px-1 py-1 text-xs" :value="offer.quota" aria-label="Items per player per day at full price" @change="setOffer(i, { quota: whole(($event.target as HTMLInputElement).value) })" />
                <input type="number" min="0" step="1" class="cc-input px-1 py-1 text-xs" :value="offer.overPrice" aria-label="Price after the daily quota" @change="setOffer(i, { overPrice: whole(($event.target as HTMLInputElement).value) })" />
                <button type="button" title="Remove" aria-label="Remove this item" class="text-mist hover:text-red-400" @click.stop="removeOffer(i)"><UiIcon name="trash" :size="14" /></button>
              </div>
              <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="addOffer"><UiIcon name="plus" :size="14" /> Add item</button>
              <figure v-if="chart && charted" class="m-0 flex flex-col gap-1">
                <figcaption class="text-xs font-bold text-fog">Coins in a day, selling {{ charted.code || 'this item' }} as fast as apples are picked (1 every 3 s)</figcaption>
                <div class="flex gap-3 text-xs text-mist">
                  <span class="flex items-center gap-1"><span class="h-0.5 w-4" :style="{ background: OFFER_COLOR }" />This offer</span>
                  <span class="flex items-center gap-1"><span class="h-0.5 w-4" :style="{ background: APPLE_COLOR }" />Apple picking</span>
                </div>
                <svg :viewBox="`0 0 ${CHART.width} ${CHART.height}`" class="w-full" role="img" :aria-label="`Coins over ${CHART_HOURS} hours: this offer ${chart.soldEnd}, apple picking ${chart.appleEnd}`" @pointermove="onChartMove" @pointerleave="hoverStep = null">
                  <g v-for="tick in chart.yTicks" :key="`y${tick}`">
                    <line :x1="CHART.left" :x2="CHART.width - CHART.right" :y1="chart.y(tick)" :y2="chart.y(tick)" stroke="rgb(var(--cc-mist) / 0.15)" />
                    <text :x="CHART.left - 4" :y="chart.y(tick)" text-anchor="end" dominant-baseline="middle" class="fill-mist text-[9px]">{{ tick }}</text>
                  </g>
                  <text v-for="tick in chart.xTicks" :key="`x${tick}`" :x="chart.x(tick)" :y="CHART.height - 8" text-anchor="middle" class="fill-mist text-[9px]">{{ tick }} h</text>
                  <path :d="chart.applePath" fill="none" :stroke="APPLE_COLOR" stroke-width="2" stroke-linejoin="round" />
                  <path :d="chart.offerPath" fill="none" :stroke="OFFER_COLOR" stroke-width="2" stroke-linejoin="round" />
                  <text :x="chart.x(CHART_HOURS) + 4" :y="chart.y(chart.soldEnd)" dominant-baseline="middle" class="fill-fog text-[9px] font-bold">{{ chart.soldEnd }}</text>
                  <text :x="chart.x(CHART_HOURS) + 4" :y="chart.y(chart.appleEnd) + (Math.abs(chart.y(chart.appleEnd) - chart.y(chart.soldEnd)) < 10 ? 10 : 0)" dominant-baseline="middle" class="fill-mist text-[9px]">{{ chart.appleEnd }}</text>
                  <g v-if="hoverStep !== null">
                    <line :x1="chart.x(chart.sold[hoverStep]![0])" :x2="chart.x(chart.sold[hoverStep]![0])" :y1="CHART.top" :y2="CHART.height - CHART.bottom" stroke="rgb(var(--cc-fog) / 0.5)" />
                    <circle :cx="chart.x(chart.sold[hoverStep]![0])" :cy="chart.y(chart.sold[hoverStep]![1])" r="4" :fill="OFFER_COLOR" stroke="#080a20" stroke-width="2" />
                    <circle :cx="chart.x(chart.apples[hoverStep]![0])" :cy="chart.y(chart.apples[hoverStep]![1])" r="4" :fill="APPLE_COLOR" stroke="#080a20" stroke-width="2" />
                  </g>
                </svg>
                <p class="m-0 h-4 text-xs text-fog">
                  <template v-if="hoverStep !== null">{{ chart.sold[hoverStep]![0] }} h · this offer {{ chart.sold[hoverStep]![1] }} coins · apples {{ chart.apples[hoverStep]![1] }} coins</template>
                </p>
                <p v-for="warning in warnings" :key="warning" class="m-0 flex items-start gap-1.5 text-xs font-bold text-sun"><UiIcon name="alert" :size="14" class="shrink-0" />{{ warning }}</p>
              </figure>
            </template>
          </section>
          <p :class="['m-0 flex items-start gap-1.5 text-xs font-bold', problem ? 'text-coral' : 'text-mint']">
            <UiIcon :name="problem ? 'alert' : 'check'" :size="14" class="shrink-0" />{{ problem ?? 'Every area is valid. Save the zone to keep them.' }}
          </p>
        </aside>
      </div>
    </div>
  </div>
</template>
