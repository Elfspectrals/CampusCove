<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MaterialSlot } from '../../../game/mallTemplates/templateProps'
import { Pane } from 'tweakpane'
import { WEAR_SLOTS, type WearSlot } from '../../../avatar/modularCharacterLogic'
import { DEFAULT_SLOT_COLORS } from '../../../api/characterCosmetics'
import { isConsumableCode } from '../../../game/assets/catalog'
import { CEILING_HEIGHT, SURFACES, usableArea, type CellPreset, type MallTemplate, type MaterialLook, type NpcPose, type Surface, type TemplateProp, type TexturePart } from '../../../game/mallTemplates/mallTemplate.ts'
import type { FolderApi } from 'tweakpane'

const NO_PIECE = ''

const props = defineProps<{
  prop: TemplateProp | null
  decorKeys: string[]
  wear: Record<WearSlot, string[]>
  vendorTaken: boolean
  preset: CellPreset
  saleCodes: Record<string, string>
  wearSaleCodes: Record<string, string>
  surfaces: MallTemplate['surfaces']
  textures: Record<string, string>
  materialSlots: MaterialSlot[]
  textureParts: Record<string, TexturePart[]>
  ownParts: Record<string, TexturePart[]>
}>()

const materialNames = computed(() => props.materialSlots.map((m) => m.name))

const emit = defineEmits<{ change: [prop: TemplateProp]; surfaces: [surfaces: NonNullable<MallTemplate['surfaces']>] }>()

const NO_TEXTURE = ''
const UNPAINTED = '#ffffff'

interface LookParams {
  texture: Record<string, string>
  paint: Record<string, boolean>
  color: Record<string, string>
  parts: Record<string, Record<string, string>>
  partsTexture: Record<string, string>
}

function partsFor(name: string, texture: string): TexturePart[] {
  return texture !== NO_TEXTURE ? (props.textureParts[texture] ?? []) : (props.ownParts[name] ?? [])
}

function lookParams(names: readonly string[], looks: Partial<Record<string, MaterialLook>> | undefined): LookParams {
  const texture = Object.fromEntries(names.map((n) => [n, looks?.[n]?.texture ?? NO_TEXTURE]))
  return {
    texture,
    paint: Object.fromEntries(names.map((n) => [n, looks?.[n]?.color !== undefined])),
    color: Object.fromEntries(names.map((n) => [n, looks?.[n]?.color ?? UNPAINTED])),
    parts: Object.fromEntries(names.map((n) => [n, Object.fromEntries(partsFor(n, texture[n]!).map((part) => [part.id, looks?.[n]?.parts?.[part.id] ?? part.color]))])),
    partsTexture: { ...texture },
  }
}

function looksOf(names: readonly string[], p: LookParams): Record<string, MaterialLook> {
  return Object.fromEntries(
    names.flatMap((n) => {
      const sameTexture = p.texture[n] === p.partsTexture[n]
      const changed = sameTexture ? partsFor(n, p.texture[n]!).filter((part) => p.parts[n]?.[part.id] && p.parts[n]![part.id] !== part.color) : []
      const look: MaterialLook = {
        ...(p.texture[n] !== NO_TEXTURE ? { texture: p.texture[n] } : {}),
        ...(p.paint[n] ? { color: p.color[n] } : {}),
        ...(changed.length && !(p.paint[n] && p.texture[n] === NO_TEXTURE) ? { parts: Object.fromEntries(changed.map((part) => [part.id, p.parts[n]![part.id]!])) } : {}),
      }
      return Object.keys(look).length ? [[n, look]] : []
    }),
  )
}

function addLookBindings(folder: FolderApi, p: LookParams, name: string, label: string, texturable: boolean): void {
  if (texturable) folder.addBinding(p.texture, name, { label, options: { '(model)': NO_TEXTURE, ...props.textures } })
  folder.addBinding(p.paint, name, { label: texturable ? 'colour' : label })
  folder.addBinding(p.color, name, { label: ' ' })
  for (const part of partsFor(name, p.texture[name]!)) folder.addBinding(p.parts[name]!, part.id, { label: `· ${part.label}` })
}

function texturesOf(looks: Partial<Record<string, MaterialLook>> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(looks ?? {}).map(([name, look]) => [name, look?.texture ?? NO_TEXTURE]))
}

interface Params {
  looks: LookParams
  location: { x: number; y: number; z: number }
  rotation: number
  scale: number
  key: string
  columns: number
  rows: number
  pose: NpcPose
  vendor: boolean
  forSale: boolean
  body: string
  pieces: Record<WearSlot, string>
  colors: Record<WearSlot, string>
  sale: Record<WearSlot, boolean>
  lightColor: string
  intensity: number
  range: number
  angle: number
  pitch: number
}

const containerRef = ref<HTMLElement | null>(null)
let pane: Pane | null = null
let params: Params | null = null
let syncing = false

function round(value: number): number {
  return Number(value.toFixed(4))
}

function paramsOf(prop: TemplateProp): Params {
  const pieces = Object.fromEntries(WEAR_SLOTS.map((slot) => [slot, NO_PIECE])) as Record<WearSlot, string>
  const colors = { ...DEFAULT_SLOT_COLORS } as Record<WearSlot, string>
  const sale = Object.fromEntries(WEAR_SLOTS.map((slot) => [slot, false])) as Record<WearSlot, boolean>
  if (prop.kind === 'npc' || prop.kind === 'mannequin') {
    for (const piece of prop.outfit) {
      pieces[piece.slot] = piece.key
      colors[piece.slot] = piece.color
    }
  }
  if (prop.kind === 'mannequin') for (const piece of prop.outfit) sale[piece.slot] = piece.forSale
  return {
    looks: lookParams(materialNames.value, prop.kind === 'decor' ? prop.materials : undefined),
    location: { x: prop.position[0], y: prop.position[1], z: prop.position[2] },
    rotation: round((prop.yaw * 180) / Math.PI),
    scale: prop.scale,
    key: prop.kind === 'decor' || prop.kind === 'item' ? prop.key : '',
    columns: prop.kind === 'item' ? (prop.stack?.[0] ?? 1) : 1,
    rows: prop.kind === 'item' ? (prop.stack?.[1] ?? 1) : 1,
    pose: prop.kind === 'npc' ? prop.pose : 'idle',
    vendor: prop.kind === 'npc' && prop.vendor,
    forSale: prop.kind === 'item' && prop.forSale,
    body: prop.kind === 'npc' || prop.kind === 'mannequin' ? prop.body : DEFAULT_SLOT_COLORS.body,
    pieces,
    colors,
    sale,
    lightColor: prop.kind === 'light' ? prop.color : '#ffffff',
    intensity: prop.kind === 'light' ? prop.intensity : 1,
    range: prop.kind === 'light' ? prop.range : 1,
    angle: prop.kind === 'light' ? round(((prop.angle ?? 0) * 180) / Math.PI) : 0,
    pitch: prop.kind === 'light' ? round(((prop.pitch ?? 0) * 180) / Math.PI) : 0,
  }
}

function wearCode(slot: WearSlot, key: string): string | undefined {
  return props.wearSaleCodes[`${slot}/${key}`]
}

function propOf(source: TemplateProp, p: Params): TemplateProp {
  const base = {
    id: source.id,
    position: [round(p.location.x), round(Math.max(0, p.location.y)), round(p.location.z)] as [number, number, number],
    yaw: round((p.rotation * Math.PI) / 180),
    scale: round(p.scale),
  }
  if (source.kind === 'light') {
    const lamp = { ...base, kind: 'light' as const, light: source.light, color: p.lightColor, intensity: round(p.intensity), range: round(p.range) }
    if (source.light === 'point') return lamp
    return { ...lamp, angle: round((p.angle * Math.PI) / 180), pitch: round((p.pitch * Math.PI) / 180) }
  }
  const saleCode = props.saleCodes[p.key]
  if (source.kind === 'decor' && p.forSale && saleCode && !source.materials) return { ...base, kind: 'item', key: p.key, code: saleCode, forSale: true }
  if (source.kind === 'decor') {
    const kept = Object.fromEntries(Object.entries(source.materials ?? {}).filter(([name]) => !materialNames.value.includes(name)))
    const materials = p.key === source.key ? { ...kept, ...looksOf(materialNames.value, p.looks) } : {}
    return { ...base, kind: 'decor', key: p.key, ...(Object.keys(materials).length ? { materials } : {}) }
  }
  if (source.kind === 'item' && !p.forSale && !isConsumableCode(source.code)) return { ...base, kind: 'decor', key: source.key }
  if (source.kind === 'item') {
    const stacked = p.forSale && (p.columns > 1 || p.rows > 1)
    return { ...base, kind: 'item', key: source.key, code: source.code, forSale: p.forSale, ...(stacked ? { stack: [p.columns, p.rows] as [number, number] } : {}) }
  }
  const outfit = WEAR_SLOTS.filter((slot) => p.pieces[slot] !== NO_PIECE).map((slot) => ({ slot, key: p.pieces[slot], color: p.colors[slot] }))
  if (source.kind === 'mannequin') {
    const stored = new Map(source.outfit.map((piece) => [`${piece.slot}/${piece.key}`, piece.code]))
    const pieces = outfit.map((piece) => {
      const code = wearCode(piece.slot, piece.key) ?? stored.get(`${piece.slot}/${piece.key}`)
      return p.sale[piece.slot] && code ? { ...piece, forSale: true, code } : { ...piece, forSale: false }
    })
    return { ...base, kind: 'mannequin', body: p.body, outfit: pieces }
  }
  return { ...base, kind: 'npc', pose: p.pose, vendor: p.vendor, body: p.body, outfit }
}

function listOf(keys: string[], current: string, withNone: boolean): Record<string, string> {
  const all = current === NO_PIECE || keys.includes(current) ? keys : [current, ...keys]
  return Object.fromEntries([...(withNone ? [['(none)', NO_PIECE]] : []), ...all.map((k) => [k.split('_').join(' '), k])])
}

function emitChange(): void {
  if (syncing || !params || !props.prop) return
  emit('change', propOf(props.prop, params))
}

const SURFACE_LABELS: Record<Surface, string> = { left: 'Left wall', right: 'Right wall', back: 'Back wall', floor: 'Floor', ceiling: 'Ceiling' }

let cellLooks: LookParams | null = null

function buildCell(container: HTMLElement): void {
  const looks = lookParams(SURFACES, props.surfaces)
  cellLooks = looks
  pane = new Pane({ container, title: 'Cell' })
  const folder = pane.addFolder({ title: 'Surfaces' })
  for (const surface of SURFACES) addLookBindings(folder, looks, surface, SURFACE_LABELS[surface], true)
  pane.on('change', () => {
    if (!syncing) emit('surfaces', looksOf(SURFACES, looks))
  })
}

watch(
  () => props.surfaces,
  (surfaces) => {
    if (props.prop || !pane || !cellLooks) return
    syncing = true
    const next = lookParams(SURFACES, surfaces)
    Object.assign(cellLooks.paint, next.paint)
    Object.assign(cellLooks.color, next.color)
    for (const [name, parts] of Object.entries(next.parts)) Object.assign(cellLooks.parts[name] ?? {}, parts)
    pane.refresh()
    syncing = false
  },
  { deep: true },
)

function build(): void {
  pane?.dispose()
  pane = null
  params = null
  const prop = props.prop
  if (!containerRef.value) return
  if (!prop) return buildCell(containerRef.value)
  params = paramsOf(prop)
  pane = new Pane({ container: containerRef.value, title: `${prop.id} · ${prop.kind}` })
  pane.on('change', emitChange)
  const transform = pane.addFolder({ title: 'Transform' })
  const { halfWidth, minZ } = usableArea(props.preset)
  transform.addBinding(params, 'location', {
    label: 'Location',
    x: { min: -halfWidth, max: halfWidth, keyScale: 0.05, pointerScale: 0.01 },
    y: { min: 0, ...(prop.kind === 'light' ? { max: CEILING_HEIGHT } : {}), keyScale: 0.05, pointerScale: 0.01 },
    z: { min: minZ, max: 0, keyScale: 0.05, pointerScale: 0.01 },
  })
  transform.addBinding(params, 'rotation', { label: 'Rotation °', min: -180, max: 180, keyScale: 1, pointerScale: 0.5 })
  transform.addBinding(params, 'scale', { label: 'Scale', min: 0.05, keyScale: 0.05, pointerScale: 0.005 })
  if (prop.kind === 'decor') {
    const decor = pane.addFolder({ title: 'Decor' })
    decor.addBinding(params, 'key', { label: 'Model', options: listOf(props.decorKeys, prop.key, false) })
    decor.addBinding(params, 'forSale', { label: 'For sale', disabled: !props.saleCodes[prop.key] || Object.keys(prop.materials ?? {}).length > 0 })
    if (props.materialSlots.length) {
      const materials = pane.addFolder({ title: 'Materials' })
      for (const slot of props.materialSlots) addLookBindings(materials, params.looks, slot.name, slot.name.replace(/^DC_/, ''), slot.texturable)
    }
  }
  if (prop.kind === 'item') {
    const item = pane.addFolder({ title: 'Sellable' })
    item.addBlade({ view: 'text', label: 'Item', parse: (v: string) => v, value: prop.code, disabled: true })
    item.addBinding(params, 'forSale', { label: 'For sale' })
    if (prop.forSale) {
      item.addBinding(params, 'columns', { label: 'Stack cols', min: 1, max: 10, step: 1 })
      item.addBinding(params, 'rows', { label: 'Stack rows', min: 1, max: 10, step: 1 })
    }
  }
  if (prop.kind === 'light') {
    const light = pane.addFolder({ title: prop.light === 'spot' ? 'Spot light' : 'Point light' })
    light.addBinding(params, 'lightColor', { label: 'Color' })
    light.addBinding(params, 'intensity', { label: 'Intensity', min: 0.1, max: 50, keyScale: 0.5, pointerScale: 0.05 })
    light.addBinding(params, 'range', { label: 'Range m', min: 0.5, max: 20, keyScale: 0.5, pointerScale: 0.05 })
    if (prop.light === 'spot') {
      light.addBinding(params, 'angle', { label: 'Cone °', min: 5, max: 90, keyScale: 1, pointerScale: 0.5 })
      light.addBinding(params, 'pitch', { label: 'Aim down °', min: -90, max: 90, keyScale: 1, pointerScale: 0.5 })
    }
  }
  if (prop.kind === 'npc' || prop.kind === 'mannequin') {
    const figure = pane.addFolder({ title: prop.kind === 'npc' ? 'NPC' : 'Mannequin' })
    if (prop.kind === 'npc') {
      figure.addBinding(params, 'pose', { label: 'Pose', options: { Idle: 'idle', Sit: 'sit' } })
      figure.addBinding(params, 'vendor', { label: 'Vendor', disabled: props.vendorTaken && !params.vendor })
    }
    figure.addBinding(params, 'body', { label: prop.kind === 'npc' ? 'Skin' : 'Body' })
    const outfit = pane.addFolder({ title: 'Outfit' })
    for (const slot of WEAR_SLOTS) {
      outfit.addBinding(params.pieces, slot, { label: slot.split('_').join(' '), options: listOf(props.wear[slot] ?? [], params.pieces[slot], true) })
      outfit.addBinding(params.colors, slot, { label: ' ' })
      const storedCode = prop.kind === 'mannequin' ? prop.outfit.find((p) => p.slot === slot && p.key === params!.pieces[slot])?.code : undefined
      if (prop.kind === 'mannequin') outfit.addBinding(params.sale, slot, { label: 'for sale', disabled: !wearCode(slot, params.pieces[slot]) && !storedCode })
    }
  }
}

function shapeOf(prop: TemplateProp | null): string {
  const keys = prop?.kind === 'npc' || prop?.kind === 'mannequin' ? prop.outfit.map((p) => p.key) : prop?.kind === 'decor' || prop?.kind === 'item' ? [prop.key] : []
  const forSale = prop?.kind === 'item' && prop.forSale
  if (!prop) return JSON.stringify(['cell', texturesOf(props.surfaces), props.textures, props.textureParts])
  return JSON.stringify([prop.id, prop.kind, forSale, props.vendorTaken, props.decorKeys.length, props.wear, props.preset, props.saleCodes, props.wearSaleCodes, props.materialSlots, props.textureParts, props.ownParts, prop.kind === 'decor' ? texturesOf(prop.materials) : null, prop.kind === 'decor' && !!prop.materials, keys])
}

watch(() => shapeOf(props.prop), build)

watch(
  () => props.prop,
  (prop) => {
    if (!prop || !params || !pane) return
    syncing = true
    const { pieces, colors, sale, looks, ...rest } = paramsOf(prop)
    Object.assign(params, rest)
    Object.assign(params.looks.texture, looks.texture)
    Object.assign(params.looks.paint, looks.paint)
    Object.assign(params.looks.color, looks.color)
    for (const [name, parts] of Object.entries(looks.parts)) Object.assign(params.looks.parts[name] ?? {}, parts)
    Object.assign(params.pieces, pieces)
    Object.assign(params.colors, colors)
    Object.assign(params.sale, sale)
    pane.refresh()
    syncing = false
  },
  { deep: true },
)

onMounted(build)
onBeforeUnmount(() => pane?.dispose())
</script>

<template>
  <section class="cc-panel-flat flex min-h-0 flex-col overflow-hidden">
    <header class="border-b-2 border-ink-600/50 px-3 py-2">
      <p class="cc-eyebrow m-0 text-mist">Details</p>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-2" @keydown.stop>
      <p v-if="!prop" class="m-0 p-2 text-sm text-mist">Nothing selected: the cell's walls, floor and ceiling. Select a prop to edit it.</p>
      <div ref="containerRef" />
    </div>
  </section>
</template>
