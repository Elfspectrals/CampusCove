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
import { MAX_PEN_SIDE, MIN_PEN_SIDE } from '../../../game/animals/animals.ts'
import { MAX_BUILDING_HEIGHT, MAX_BUILDING_SIDE, MAX_ROOF, MIN_ROOF } from '../../../game/buildings/buildings.ts'
import { BUILDING_PARTS, BUILDING_SIDES, type BuildingOpening, type BuildingPart, type BuildingProp } from '../../../game/mallTemplates/mallTemplate.ts'
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
  zonePrices?: Record<string, number>
  wearSaleCodes: Record<string, string>
  surfaces: MallTemplate['surfaces']
  textureOptions: SelectOption[]
  materialOptions: SelectOption[]
  materialSlots: MaterialSlot[]
  textureParts: Record<string, TexturePart[]>
  ownParts: Record<string, TexturePart[]>
  collapsed: boolean
  rebuilding?: string | null
  selectedCount?: number
}>()

const emit = defineEmits<{ change: [prop: TemplateProp]; surfaces: [surfaces: NonNullable<MallTemplate['surfaces']>]; remove: [id: string]; toggle: []; rebuild: [id: string] }>()

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
  height: number
  roof: number
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
    width: prop.kind === 'field' || prop.kind === 'animal' || prop.kind === 'building' ? prop.size[0] : 1,
    depth: prop.kind === 'field' || prop.kind === 'animal' || prop.kind === 'building' ? prop.size[1] : 1,
    height: prop.kind === 'building' ? prop.height : 1,
    roof: prop.kind === 'building' ? prop.roof : 1,
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
  if (base.kind === 'field' || base.kind === 'animal') return { ...base, scale: [1, 1, 1], size: [round(n.width), round(n.depth)] }
  if (base.kind === 'building') {
    const quarter = Math.PI / 2
    return { ...base, yaw: Math.round(base.yaw / quarter) * quarter, scale: [1, 1, 1], size: [round(n.width), round(n.depth)], height: round(n.height), roof: round(n.roof) }
  }
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
  } else if (prop.kind === 'building') {
    pane.addBinding(numbers, 'width', { label: 'Width m', min: 3, max: MAX_BUILDING_SIDE, step: 0.5 })
    pane.addBinding(numbers, 'depth', { label: 'Depth m', min: 3, max: MAX_BUILDING_SIDE, step: 0.5 })
    pane.addBinding(numbers, 'height', { label: 'Wall height m', min: 2.4, max: MAX_BUILDING_HEIGHT, step: 0.1 })
    pane.addBinding(numbers, 'roof', { label: 'Roof height m', min: MIN_ROOF, max: MAX_ROOF, step: 0.1 })
  } else if (prop.kind === 'animal') {
    pane.addBinding(numbers, 'width', { label: 'Pen width m', min: MIN_PEN_SIDE, max: MAX_PEN_SIDE, step: 0.5 })
    pane.addBinding(numbers, 'depth', { label: 'Pen depth m', min: MIN_PEN_SIDE, max: MAX_PEN_SIDE, step: 0.5 })
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
const building = computed(() => (props.prop?.kind === 'building' ? props.prop : null))
const RIDGES: SelectOption[] = [
  { value: 'x', label: 'Along the width' },
  { value: 'z', label: 'Along the depth' },
]
const OPENING_TYPES: SelectOption[] = [
  { value: 'door', label: 'Door' },
  { value: 'window', label: 'Window' },
]
const SIDE_OPTIONS: SelectOption[] = BUILDING_SIDES.map((side) => ({ value: side, label: side }))
const NEW_OPENING: Record<BuildingOpening['type'], BuildingOpening> = {
  door: { type: 'door', side: 'front', offset: 0, width: 1.2, bottom: 0, top: 2.1 },
  window: { type: 'window', side: 'front', offset: 0, width: 1.2, bottom: 1, top: 2 },
}

function setOpening(index: number, patch: Partial<BuildingOpening>): void {
  const b = building.value
  if (!b) return
  change({ ...b, openings: b.openings.map((o, i) => (i !== index ? o : patch.type === 'door' ? { ...o, ...patch, bottom: 0 } : { ...o, ...patch })) })
}

function addOpening(type: BuildingOpening['type']): void {
  const b = building.value
  if (b) change({ ...b, openings: [...b.openings, { ...NEW_OPENING[type] }] })
}

function removeOpening(index: number): void {
  const b = building.value
  if (b) change({ ...b, openings: b.openings.filter((_, i) => i !== index) })
}

const UNTINTED = '#ffffff'
const partTextures = computed<SelectOption[]>(() => [{ value: '', label: '(colour only)' }, ...props.textureOptions])

function setPartTexture(part: BuildingPart, key: string): void {
  const b = building.value
  if (!b) return
  const textures = Object.fromEntries(Object.entries({ ...b.textures, [part]: key }).filter(([, k]) => k))
  const next: BuildingProp = { ...b, colors: key && !b.textures?.[part] ? { ...b.colors, [part]: UNTINTED } : b.colors }
  if (Object.keys(textures).length) next.textures = textures
  else delete next.textures
  change(next)
}

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
  const code = source?.kind === 'decor' ? props.saleCodes[source.key] : source?.kind === 'item' ? source.code : undefined
  const next = source && withSale(source, on, source.kind === 'decor' ? props.saleCodes[source.key] : undefined, code && props.zonePrices ? props.zonePrices[code] : undefined)
  if (next) change(next)
}

function setPrice(value: string): void {
  if (item.value) change({ ...item.value, price: Number(value) })
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
      <p v-if="!prop && selectedCount && selectedCount > 1" class="m-0 px-1 text-xs text-mist">
        {{ selectedCount }} props selected: the gizmo moves and turns them together. Group (Ctrl/Cmd+G) keeps them together, Alt-click edits one alone.
      </p>
      <p v-else-if="!prop && bounds" class="m-0 px-1 text-xs text-mist">Nothing selected. Select a prop to edit it.</p>
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
        <div v-if="building" class="flex flex-col gap-1.5 rounded-lg bg-ink-950/50 p-2">
          <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <span class="text-xs text-mist">Roof ridge</span>
            <EditorSearchSelect :model-value="building.ridge" :options="RIDGES" :searchable="false" @update:model-value="change({ ...building, ridge: $event as 'x' | 'z' })" />
          </div>
          <p class="m-0 mt-1 text-[11px] font-extrabold uppercase text-mist">Doors and windows</p>
          <div v-for="(opening, i) in building.openings" :key="i" class="flex flex-col gap-1 rounded-md bg-white/5 p-1.5">
            <div class="grid grid-cols-[1fr_1fr_1.25rem] items-center gap-1">
              <EditorSearchSelect :model-value="opening.type" :options="OPENING_TYPES" :searchable="false" @update:model-value="setOpening(i, { type: $event as BuildingOpening['type'] })" />
              <EditorSearchSelect :model-value="opening.side" :options="SIDE_OPTIONS" :searchable="false" @update:model-value="setOpening(i, { side: $event as BuildingOpening['side'] })" />
              <button type="button" title="Remove" aria-label="Remove this opening" class="text-mist hover:text-coral" @click="removeOpening(i)"><UiIcon name="trash" :size="14" /></button>
            </div>
            <div class="grid grid-cols-4 gap-1 text-[10px] text-mist">
              <label class="flex flex-col">Offset<input type="number" step="0.1" class="cc-input px-1 py-0.5 text-xs" :value="opening.offset" @change="setOpening(i, { offset: Number(($event.target as HTMLInputElement).value) })" /></label>
              <label class="flex flex-col">Width<input type="number" step="0.1" min="0.6" class="cc-input px-1 py-0.5 text-xs" :value="opening.width" @change="setOpening(i, { width: Number(($event.target as HTMLInputElement).value) })" /></label>
              <label class="flex flex-col">Bottom<input type="number" step="0.1" min="0" class="cc-input px-1 py-0.5 text-xs" :value="opening.bottom" :disabled="opening.type === 'door'" @change="setOpening(i, { bottom: Number(($event.target as HTMLInputElement).value) })" /></label>
              <label class="flex flex-col">Top<input type="number" step="0.1" class="cc-input px-1 py-0.5 text-xs" :value="opening.top" @change="setOpening(i, { top: Number(($event.target as HTMLInputElement).value) })" /></label>
            </div>
          </div>
          <div class="flex gap-1">
            <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost flex-1" @click="addOpening('door')"><UiIcon name="plus" :size="12" /> Door</button>
            <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost flex-1" @click="addOpening('window')"><UiIcon name="plus" :size="12" /> Window</button>
          </div>
          <p class="m-0 mt-1 text-[11px] font-extrabold uppercase text-mist">Looks</p>
          <div v-for="part in BUILDING_PARTS" :key="part" class="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-1">
            <span class="text-xs capitalize text-mist">{{ part }}</span>
            <EditorSearchSelect :model-value="building.textures?.[part] ?? ''" :options="partTextures" @update:model-value="setPartTexture(part, $event)" />
            <EditorColorPicker :model-value="building.colors[part]" @update:model-value="change({ ...building, colors: { ...building.colors, [part]: $event } })" />
          </div>
          <p class="m-0 text-[11px] text-mist">With a texture, the colour tints it (white keeps it as is).</p>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-pool mt-1" :disabled="!!rebuilding" @click="emit('rebuild', building.id)">
            <UiIcon name="refresh" :size="14" /> {{ rebuilding === building.id ? 'Building in Blender…' : 'Rebuild' }}
          </button>
          <p class="m-0 text-[11px] text-mist">Rebuild shows the real building here. The game gets it after Save and zone:bake.</p>
        </div>
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
          <label v-if="item.forSale && zonePrices" class="grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs text-mist">
            Price (coins)
            <input type="number" min="1" step="1" class="cc-input py-1 text-sm" :value="item.price" @change="setPrice(($event.target as HTMLInputElement).value)" />
          </label>
          <p v-if="item.forSale && zonePrices && zonePrices[item.code] !== undefined" class="m-0 text-xs text-mist">Shop price elsewhere: {{ zonePrices[item.code] }}</p>
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
            <p v-if="bounds" class="m-0 text-xs text-mist">Sellers and buyers are set in the Sellers map.</p>
            <label v-else class="flex items-center gap-2 text-xs text-mist">
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
