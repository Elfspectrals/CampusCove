<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Pane } from 'tweakpane'
import UiIcon from '../../ui/UiIcon.vue'
import type { MaterialSlot } from '../../../game/mallTemplates/templateProps'
import { WEAR_SLOTS, type WearSlot } from '../../../avatar/modularCharacterLogic'
import {
  CEILING_HEIGHT,
  SURFACES,
  usableArea,
  type CellPreset,
  type MallTemplate,
  type MannequinPiece,
  type MaterialLook,
  type NpcPose,
  type OutfitPiece,
  type Surface,
  type TemplateProp,
  type TexturePart,
  withSale,
} from '../../../game/mallTemplates/mallTemplate.ts'
import type { WorldBounds } from '../../../game/world/worldManifest'
import EditorColorPicker from './EditorColorPicker.vue'
import EditorLookEditor from './EditorLookEditor.vue'
import EditorSearchSelect, { type SelectOption } from './EditorSearchSelect.vue'

const props = defineProps<{
  prop: TemplateProp | null
  decorOptions: SelectOption[]
  wear: Record<WearSlot, string[]>
  vendorTaken: boolean
  preset: CellPreset
  bounds?: WorldBounds
  cropOptions?: SelectOption[]
  saleCodes: Record<string, string>
  wearSaleCodes: Record<string, string>
  surfaces: MallTemplate['surfaces']
  textureOptions: SelectOption[]
  materialOptions: SelectOption[]
  materialSlots: MaterialSlot[]
  textureParts: Record<string, TexturePart[]>
  ownParts: Record<string, TexturePart[]>
  collapsed: boolean
}>()

const emit = defineEmits<{ change: [prop: TemplateProp]; surfaces: [surfaces: NonNullable<MallTemplate['surfaces']>]; remove: [id: string]; toggle: [] }>()

const NO_PIECE = ''
const SURFACE_LABELS: Record<Surface, string> = { left: 'Left wall', right: 'Right wall', back: 'Back wall', floor: 'Floor', ceiling: 'Ceiling' }
const PATTERNS: SelectOption[] = [
  { value: 'rows', label: 'Rows' },
  { value: 'staggered', label: 'Staggered' },
  { value: 'scattered', label: 'Scattered' },
]
const POSES: SelectOption[] = [
  { value: 'idle', label: 'Standing' },
  { value: 'sit', label: 'Sitting' },
]

interface Numbers {
  location: { x: number; y: number; z: number }
  rotation: number
  scale: { x: number; y: number; z: number }
  width: number
  depth: number
  columns: number
  rows: number
  intensity: number
  range: number
  angle: number
  pitch: number
}

const containerRef = ref<HTMLElement | null>(null)
let pane: Pane | null = null
let numbers: Numbers | null = null
let syncing = false

function round(value: number): number {
  return Number(value.toFixed(4))
}

function numbersOf(prop: TemplateProp): Numbers {
  return {
    location: { x: prop.position[0], y: prop.position[1], z: prop.position[2] },
    rotation: Number(((prop.yaw * 180) / Math.PI).toFixed(2)),
    scale: { x: prop.scale[0], y: prop.scale[1], z: prop.scale[2] },
    width: prop.kind === 'field' ? prop.size[0] : 1,
    depth: prop.kind === 'field' ? prop.size[1] : 1,
    columns: prop.kind === 'item' ? (prop.stack?.[0] ?? 1) : 1,
    rows: prop.kind === 'item' ? (prop.stack?.[1] ?? 1) : 1,
    intensity: prop.kind === 'light' ? prop.intensity : 1,
    range: prop.kind === 'light' ? prop.range : 1,
    angle: prop.kind === 'light' ? round(((prop.angle ?? 0) * 180) / Math.PI) : 0,
    pitch: prop.kind === 'light' ? round(((prop.pitch ?? 0) * 180) / Math.PI) : 0,
  }
}

function withNumbers(source: TemplateProp, n: Numbers): TemplateProp {
  const base = {
    ...source,
    position: [round(n.location.x), round(Math.max(0, n.location.y)), round(n.location.z)] as [number, number, number],
    yaw: round((n.rotation * Math.PI) / 180),
    scale: [round(n.scale.x), round(n.scale.y), round(n.scale.z)] as [number, number, number],
  }
  if (base.kind === 'item' && base.forSale) {
    const { stack: _, ...rest } = base
    return n.columns > 1 || n.rows > 1 ? { ...rest, stack: [n.columns, n.rows] } : rest
  }
  if (base.kind === 'field') return { ...base, scale: [1, 1, 1], size: [round(n.width), round(n.depth)] }
  if (base.kind === 'light') {
    const lamp = { ...base, intensity: round(n.intensity), range: round(n.range) }
    return base.light === 'spot' ? { ...lamp, angle: round((n.angle * Math.PI) / 180), pitch: round((n.pitch * Math.PI) / 180) } : lamp
  }
  return base
}

function build(): void {
  pane?.dispose()
  pane = null
  numbers = null
  const prop = props.prop
  if (!prop || !containerRef.value) return
  numbers = numbersOf(prop)
  pane = new Pane({ container: containerRef.value, title: 'Transform' })
  pane.on('change', () => {
    if (!syncing && numbers && props.prop) emit('change', withNumbers(props.prop, numbers))
  })
  const { halfWidth, minZ } = usableArea(props.preset)
  const fine = { keyScale: 0.05, pointerScale: 0.01 }
  pane.addBinding(numbers, 'location', props.bounds
    ? { label: 'Location', x: { min: props.bounds.minX, max: props.bounds.maxX, ...fine }, y: fine, z: { min: props.bounds.minZ, max: props.bounds.maxZ, ...fine } }
    : {
        label: 'Location',
        x: { min: -halfWidth, max: halfWidth, ...fine },
        y: { min: 0, ...(prop.kind === 'light' ? { max: CEILING_HEIGHT } : {}), ...fine },
        z: { min: minZ, max: 0, ...fine },
      })
  pane.addBinding(numbers, 'rotation', { label: 'Rotation °', min: -180, max: 180, keyScale: 1, pointerScale: 0.5 })
  const axis = { min: 0.05, keyScale: 0.05, pointerScale: 0.005 }
  if (prop.kind === 'field') {
    pane.addBinding(numbers, 'width', { label: 'Width m', min: 1, max: 60, step: 0.5 })
    pane.addBinding(numbers, 'depth', { label: 'Depth m', min: 1, max: 60, step: 0.5 })
  } else if (!(prop.kind === 'npc' && prop.vendor)) pane.addBinding(numbers, 'scale', { label: 'Scale', x: axis, y: axis, z: axis })
  if (prop.kind === 'item' && prop.forSale) {
    pane.addBinding(numbers, 'columns', { label: 'Stack cols', min: 1, max: 10, step: 1 })
    pane.addBinding(numbers, 'rows', { label: 'Stack rows', min: 1, max: 10, step: 1 })
  }
  if (prop.kind === 'light') {
    pane.addBinding(numbers, 'intensity', { label: 'Intensity', min: 0.1, max: 50, keyScale: 0.5, pointerScale: 0.05 })
    pane.addBinding(numbers, 'range', { label: 'Range m', min: 0.5, max: 20, keyScale: 0.5, pointerScale: 0.05 })
    if (prop.light === 'spot') {
      pane.addBinding(numbers, 'angle', { label: 'Cone °', min: 5, max: 90, keyScale: 1, pointerScale: 0.5 })
      pane.addBinding(numbers, 'pitch', { label: 'Aim down °', min: -90, max: 90, keyScale: 1, pointerScale: 0.5 })
    }
  }
}

watch(
  () => (props.prop ? JSON.stringify([props.prop.id, props.prop.kind, props.prop.kind === 'item' && props.prop.forSale, props.prop.kind === 'light' && props.prop.light, props.prop.kind === 'npc' && props.prop.vendor, props.preset, props.bounds, props.collapsed]) : ''),
  build,
  { flush: 'post' },
)

watch(
  () => props.prop,
  (prop) => {
    if (!prop || !numbers || !pane) return
    syncing = true
    Object.assign(numbers, numbersOf(prop))
    pane.refresh()
    syncing = false
  },
  { deep: true },
)

onMounted(build)
onBeforeUnmount(() => pane?.dispose())

function change(next: TemplateProp): void {
  emit('change', next)
}

const decor = computed(() => (props.prop?.kind === 'decor' ? props.prop : null))
const item = computed(() => (props.prop?.kind === 'item' ? props.prop : null))
const figure = computed(() => (props.prop?.kind === 'npc' || props.prop?.kind === 'mannequin' ? props.prop : null))
const light = computed(() => (props.prop?.kind === 'light' ? props.prop : null))
const field = computed(() => (props.prop?.kind === 'field' ? props.prop : null))

const decorChoices = computed(() => {
  const key = decor.value?.key
  return key && !props.decorOptions.some((o) => o.value === key) ? [{ value: key, label: key }, ...props.decorOptions] : props.decorOptions
})

function setDecorKey(key: string): void {
  if (!decor.value) return
  const { materials: _, ...rest } = decor.value
  change({ ...rest, key })
}

function setDecorLook(name: string, look: MaterialLook | null): void {
  if (!decor.value) return
  const materials = { ...(decor.value.materials ?? {}) }
  if (look) materials[name] = look
  else delete materials[name]
  const { materials: _, ...rest } = decor.value
  change(Object.keys(materials).length ? { ...rest, materials } : rest)
}

function sell(on: boolean): void {
  const source = props.prop
  const next = source && withSale(source, on, source.kind === 'decor' ? props.saleCodes[source.key] : undefined)
  if (next) change(next)
}

const wearChoices = computed(() =>
  Object.fromEntries(
    WEAR_SLOTS.map((slot) => {
      const keys = props.wear[slot] ?? []
      const current = figure.value?.outfit.find((p) => p.slot === slot)?.key
      const all = current && !keys.includes(current) ? [current, ...keys] : keys
      return [slot, [{ value: NO_PIECE, label: '(none)' }, ...all.map((key) => ({ value: key, label: key.split('_').join(' '), preview: `/assets/wear/${slot}/${key}/preview.png` }))]]
    }),
  ) as Record<WearSlot, SelectOption[]>,
)

const vendorAllowed = computed(() => figure.value?.kind === 'npc' && figure.value.pose === 'idle' && figure.value.scale.every((s) => s === 1))

function piece(slot: WearSlot): OutfitPiece | MannequinPiece | undefined {
  return figure.value?.outfit.find((p) => p.slot === slot)
}

function wearCode(slot: WearSlot, key: string): string | undefined {
  return props.wearSaleCodes[`${slot}/${key}`] ?? (figure.value?.kind === 'mannequin' ? figure.value.outfit.find((p) => p.slot === slot && p.key === key)?.code : undefined)
}

function setOutfit(slot: WearSlot, update: (current: MannequinPiece | undefined) => MannequinPiece | null): void {
  const source = figure.value
  if (!source) return
  const current = source.outfit.find((p) => p.slot === slot) as MannequinPiece | undefined
  const next = update(current)
  const others = source.outfit.filter((p) => p.slot !== slot)
  const outfit = WEAR_SLOTS.flatMap((s) => (s === slot ? (next ? [next] : []) : others.filter((p) => p.slot === s)))
  if (source.kind === 'mannequin') change({ ...source, outfit: outfit as MannequinPiece[] })
  else change({ ...source, outfit: outfit.map(({ slot: s, key, color }) => ({ slot: s, key, color })) })
}

function setPiece(slot: WearSlot, key: string): void {
  setOutfit(slot, (current) => (key === NO_PIECE ? null : { slot, key, color: current?.color ?? '#9b8abf', forSale: false }))
}

function setPieceColor(slot: WearSlot, color: string): void {
  setOutfit(slot, (current) => (current ? { ...current, color } : null))
}

function setPieceSale(slot: WearSlot, on: boolean): void {
  setOutfit(slot, (current) => {
    if (!current) return null
    const code = wearCode(slot, current.key)
    const { code: _, ...rest } = current
    return on && code ? { ...rest, forSale: true, code } : { ...rest, forSale: false }
  })
}

function setSurface(surface: Surface, look: MaterialLook | null): void {
  const next = { ...(props.surfaces ?? {}) }
  if (look) next[surface] = look
  else delete next[surface]
  emit('surfaces', next)
}

function ownPartsFor(name: string): TexturePart[] {
  return props.ownParts[name] ?? []
}

const flatMaterials = computed(() => props.materialOptions.filter((o) => !o.preview))
</script>

<template>
  <section class="cc-panel-flat flex min-h-0 flex-col overflow-hidden">
    <header class="flex items-center gap-2 border-b-2 border-ink-600/50 px-3 py-2">
      <button type="button" class="flex flex-1 items-center gap-2 text-left" :aria-expanded="!collapsed" @click="emit('toggle')">
        <UiIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="14" class="text-mist" />
        <span class="cc-eyebrow m-0 text-mist">Details</span>
        <span v-if="prop" class="truncate text-xs font-bold text-fog">{{ prop.id }} · {{ prop.kind }}</span>
      </button>
      <button v-if="prop" type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2 text-red-400" title="Delete (Del)" @click="emit('remove', prop.id)">
        <UiIcon name="trash" :size="14" /> Delete
      </button>
    </header>
    <div v-if="!collapsed" class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 text-sm" @keydown.stop>
      <p v-if="!prop && bounds" class="m-0 px-1 text-xs text-mist">Nothing selected. Select a prop to edit it.</p>
      <template v-else-if="!prop">
        <p class="m-0 px-1 text-xs text-mist">Nothing selected: the cell's walls, floor and ceiling. Select a prop to edit it.</p>
        <div class="rounded-lg bg-ink-950/50 px-2 py-1">
          <EditorLookEditor
            v-for="surface in SURFACES"
            :key="surface"
            :label="SURFACE_LABELS[surface]"
            :look="surfaces?.[surface]"
            :material-options="null"
            :texture-options="textureOptions"
            :texturable="true"
            :texture-parts="textureParts"
            :own-parts="[]"
            @update="setSurface(surface, $event)"
          />
        </div>
      </template>
      <template v-else>
        <div ref="containerRef" />
        <div v-if="field" class="flex flex-col gap-1.5 rounded-lg bg-ink-950/50 p-2">
          <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span class="text-xs text-mist">Crop</span>
            <EditorSearchSelect :model-value="field.crop" :options="cropOptions ?? []" :searchable="false" @update:model-value="change({ ...field, crop: $event })" />
          </div>
          <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span class="text-xs text-mist">Pattern</span>
            <EditorSearchSelect :model-value="field.pattern" :options="PATTERNS" :searchable="false" @update:model-value="change({ ...field, pattern: $event as typeof field.pattern })" />
          </div>
        </div>
        <div v-if="decor" class="flex flex-col gap-1.5 rounded-lg bg-ink-950/50 p-2">
          <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span class="text-xs text-mist">Model</span>
            <EditorSearchSelect :model-value="decor.key" :options="decorChoices" @update:model-value="setDecorKey" />
          </div>
          <label class="flex items-center gap-2 text-xs text-mist" :title="!saleCodes[decor.key] ? 'Not in the shop catalogue' : decor.materials ? 'Reset the materials to sell it' : ''">
            <input type="checkbox" :disabled="!saleCodes[decor.key] || !!decor.materials" :checked="false" @change="sell(($event.target as HTMLInputElement).checked)" />
            For sale
          </label>
        </div>
        <div v-if="decor && materialSlots.length" class="rounded-lg bg-ink-950/50 px-2 py-1">
          <p class="cc-eyebrow m-0 pt-1 text-mist">Materials</p>
          <EditorLookEditor
            v-for="slot in materialSlots"
            :key="slot.name"
            :label="slot.name.replace(/^DC_/, '')"
            :look="decor.materials?.[slot.name]"
            :material-options="slot.texturable ? materialOptions : flatMaterials"
            :texture-options="textureOptions"
            :texturable="slot.texturable"
            :texture-parts="textureParts"
            :own-parts="ownPartsFor(slot.name)"
            @update="setDecorLook(slot.name, $event)"
          />
        </div>
        <div v-if="item" class="flex flex-col gap-1.5 rounded-lg bg-ink-950/50 p-2">
          <p class="m-0 text-xs text-mist">Item <span class="font-mono text-fog">{{ item.code }}</span></p>
          <label class="flex items-center gap-2 text-xs text-mist">
            <input type="checkbox" :checked="item.forSale" @change="sell(($event.target as HTMLInputElement).checked)" />
            For sale
          </label>
        </div>
        <div v-if="light" class="grid grid-cols-[5.5rem_1fr] items-center gap-2 rounded-lg bg-ink-950/50 p-2">
          <span class="text-xs text-mist">Colour</span>
          <EditorColorPicker :model-value="light.color" @update:model-value="change({ ...light, color: $event })" />
        </div>
        <div v-if="figure" class="flex flex-col gap-1.5 rounded-lg bg-ink-950/50 p-2">
          <template v-if="figure.kind === 'npc'">
            <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
              <span class="text-xs text-mist">Pose</span>
              <EditorSearchSelect :model-value="figure.pose" :options="POSES" :searchable="false" :disabled="figure.vendor" @update:model-value="change({ ...figure, pose: $event as NpcPose })" />
            </div>
            <label class="flex items-center gap-2 text-xs text-mist">
              <input type="checkbox" :checked="figure.vendor" :disabled="!figure.vendor && (vendorTaken || !vendorAllowed)" :title="!figure.vendor && !vendorAllowed ? 'A cashier stands (pose standing) at scale 1' : ''" @change="change({ ...figure, vendor: ($event.target as HTMLInputElement).checked })" />
              Cashier (sells the cart)
            </label>
          </template>
          <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span class="text-xs text-mist">{{ figure.kind === 'npc' ? 'Skin' : 'Body' }}</span>
            <EditorColorPicker :model-value="figure.body" @update:model-value="change({ ...figure, body: $event })" />
          </div>
          <p class="cc-eyebrow m-0 pt-1 text-mist">Outfit</p>
          <div v-for="slot in WEAR_SLOTS" :key="slot" class="flex flex-col gap-1 border-t border-ink-700/70 pt-1.5">
            <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
              <span class="text-xs capitalize text-mist">{{ slot.split('_').join(' ') }}</span>
              <EditorSearchSelect :model-value="piece(slot)?.key ?? NO_PIECE" :options="wearChoices[slot]" @update:model-value="setPiece(slot, $event)" />
            </div>
            <div v-if="piece(slot)" class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
              <label v-if="figure.kind === 'mannequin'" class="flex items-center gap-1.5 text-xs text-mist" :title="wearCode(slot, piece(slot)!.key) ? '' : 'Not in the shop catalogue'">
                <input type="checkbox" :checked="(piece(slot) as MannequinPiece).forSale" :disabled="!wearCode(slot, piece(slot)!.key)" @change="setPieceSale(slot, ($event.target as HTMLInputElement).checked)" />
                For sale
              </label>
              <span v-else class="text-xs text-mist">Colour</span>
              <EditorColorPicker :model-value="piece(slot)!.color" @update:model-value="setPieceColor(slot, $event)" />
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
