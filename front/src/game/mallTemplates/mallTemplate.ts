import { WEAR_SLOTS, type WearSlot } from '../../avatar/modularCharacterLogic.ts'
import { consumableModelUrl, decorModelUrl, isConsumableCode, type StoreDisplay, type StoreLayout } from '../assets/catalog.ts'

export type Vec3 = [number, number, number]

export interface CellPreset {
  width: number
  depth: number
}

export interface MallCell {
  id: string
  level: number
  status: string
  name: string
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  front: { x: number; y: number; z: number; yaw: number }
  width: number
  depth: number
  template?: string
  interior?: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export interface CellArea {
  minX: number
  maxX: number
  minZ: number
}

interface PropBase {
  id: string
  position: Vec3
  yaw: number
  scale: number
}

export interface MaterialLook {
  texture?: string
  color?: string
}

export interface DecorProp extends PropBase {
  kind: 'decor'
  key: string
  materials?: Record<string, MaterialLook>
}

export interface ItemProp extends PropBase {
  kind: 'item'
  key: string
  code: string
  forSale: boolean
  stack?: [number, number]
}

interface OutfitPiece {
  slot: WearSlot
  key: string
  color: string
}

export type NpcPose = 'idle' | 'sit'

export interface NpcProp extends PropBase {
  kind: 'npc'
  pose: NpcPose
  vendor: boolean
  body: string
  outfit: OutfitPiece[]
}

interface MannequinPiece extends OutfitPiece {
  forSale: boolean
  code?: string
}

export interface MannequinProp extends PropBase {
  kind: 'mannequin'
  body: string
  outfit: MannequinPiece[]
}

type LightKind = 'point' | 'spot'

export interface LightProp extends PropBase {
  kind: 'light'
  light: LightKind
  color: string
  intensity: number
  range: number
  angle?: number
  pitch?: number
}

export type TemplateProp = DecorProp | ItemProp | NpcProp | MannequinProp | LightProp

export type Surface = 'left' | 'right' | 'back' | 'floor' | 'ceiling'

export const SURFACES: readonly Surface[] = ['left', 'right', 'back', 'floor', 'ceiling']

export interface Category {
  id: string
  label: string
  keys: string[]
}

export interface MallTemplate {
  version: 1
  key: string
  name: string
  preset: CellPreset
  surfaces?: Partial<Record<Surface, MaterialLook>>
  props: TemplateProp[]
}

export interface TextureMeta {
  version: 1
  key: string
  label: string
  tileMeters: number
  maps: { color: string; normal?: string }
}

export interface TemplateAssignments {
  version: 1
  cells: Record<string, string>
}

export interface CellPlacement {
  position: Vec3
  yaw: number
}

export const CELL_HEIGHT = 4.8
export const CEILING_HEIGHT = 4.6
const MAX_LIGHT_RANGE = 20
const PARTITION_HALF = 0.15
const BACK_WALL = 0.3
const SIZE_TOLERANCE = 0.001
const FRONT_TO_GLASS = 1
const COUNTER_REACH_AHEAD = 2
const COUNTER_HEIGHT = 1.15
export const TEMPLATE_KEY = /^[a-z0-9_]+$/
const ITEM_CODE = /^[A-Za-z]+_[A-Za-z0-9_]+$/
const CELL_ID = /^[A-Z][0-9]{2}$/
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const NPC_POSES: readonly NpcPose[] = ['idle', 'sit']
const LIGHT_KINDS: readonly LightKind[] = ['point', 'spot']
export const MAX_LIGHTS = 8
const MAP_FILE = /^[a-z0-9_]+\.(png|webp|jpg)$/
const MATERIAL_NAME = /^[A-Za-z0-9_.-]+$/

export function usableArea(preset: CellPreset): { halfWidth: number; minZ: number } {
  return { halfWidth: preset.width / 2 - PARTITION_HALF, minZ: -(preset.depth - BACK_WALL) }
}

export function presetOf(cell: Pick<MallCell, 'width' | 'depth'>): CellPreset {
  return { width: cell.width, depth: cell.depth }
}

export function samePreset(a: CellPreset, b: CellPreset): boolean {
  return Math.abs(a.width - b.width) < SIZE_TOLERANCE && Math.abs(a.depth - b.depth) < SIZE_TOLERANCE
}

export function cellPresets(cells: readonly MallCell[]): Array<CellPreset & { count: number }> {
  const presets: Array<CellPreset & { count: number }> = []
  for (const cell of cells) {
    if (cell.status !== 'planned') continue
    const known = presets.find((p) => samePreset(p, cell))
    if (known) known.count += 1
    else presets.push({ ...presetOf(cell), count: 1 })
  }
  return presets.sort((a, b) => b.count - a.count || a.width - b.width || a.depth - b.depth)
}

export function freeCells(cells: readonly MallCell[], preset: CellPreset, assignments: TemplateAssignments): MallCell[] {
  return cells.filter((cell) => cell.status === 'planned' && samePreset(cell, preset) && !Object.keys(assignments.cells).includes(cell.id))
}

export function cellPlacement(cell: MallCell): CellPlacement {
  const { x, y, z, yaw } = cell.front
  return { position: [x - Math.sin(yaw) * FRONT_TO_GLASS, y, z - Math.cos(yaw) * FRONT_TO_GLASS], yaw }
}

export function toWorld(placement: CellPlacement, local: Vec3): Vec3 {
  const cos = Math.cos(placement.yaw)
  const sin = Math.sin(placement.yaw)
  const [x, y, z] = local
  const [ox, oy, oz] = placement.position
  return [ox + x * cos + z * sin, oy + y, oz - x * sin + z * cos]
}

function toLocal(placement: CellPlacement, world: Vec3): Vec3 {
  const cos = Math.cos(placement.yaw)
  const sin = Math.sin(placement.yaw)
  const dx = world[0] - placement.position[0]
  const dz = world[2] - placement.position[2]
  return [dx * cos - dz * sin, world[1] - placement.position[1], dx * sin + dz * cos]
}

export function presetArea(preset: CellPreset): CellArea {
  const { halfWidth, minZ } = usableArea(preset)
  return { minX: -halfWidth, maxX: halfWidth, minZ }
}

export function cellArea(cell: MallCell): CellArea {
  if (!cell.interior) return presetArea(cell)
  const placement = cellPlacement(cell)
  const { minX, maxX, minZ, maxZ } = cell.interior
  const corners = [toLocal(placement, [minX, 0, minZ]), toLocal(placement, [maxX, 0, maxZ])]
  return { minX: Math.min(corners[0]![0], corners[1]![0]), maxX: Math.max(corners[0]![0], corners[1]![0]), minZ: Math.min(corners[0]![2], corners[1]![2]) }
}

export function vendorCounter(vendor: Pick<NpcProp, 'position' | 'yaw'>): Vec3 {
  const [x, y, z] = vendor.position
  return [x + Math.sin(vendor.yaw) * COUNTER_REACH_AHEAD, y + COUNTER_HEIGHT, z + Math.cos(vendor.yaw) * COUNTER_REACH_AHEAD]
}

export function itemModelUrl(item: Pick<ItemProp, 'key' | 'code'>): string {
  return isConsumableCode(item.code) ? consumableModelUrl(item.code) : decorModelUrl(item.key)
}

export function templateVendor(template: MallTemplate): NpcProp | null {
  return template.props.find((p): p is NpcProp => p.kind === 'npc' && p.vendor) ?? null
}

const TEMPLATE_DEPARTMENT = 'shop'
const PIECE_HEIGHT: Record<WearSlot, number> = { hair: 1.75, head_accessory: 1.85, top: 1.25, bottom: 0.75, shoes: 0.08 }
const PIECE_SIZE: Vec3 = [0.5, 0.35, 0.3]

function mannequinDisplays(prop: MannequinProp): StoreDisplay[] {
  return prop.outfit.flatMap((piece) => {
    if (!piece.forSale || !piece.code) return []
    const [x, y, z] = prop.position
    return [{
      key: piece.key,
      code: piece.code,
      department: TEMPLATE_DEPARTMENT,
      description: '',
      position: [x, y + (PIECE_HEIGHT[piece.slot] - PIECE_SIZE[1] / 2) * prop.scale, z] as Vec3,
      yaw: prop.yaw,
      size: PIECE_SIZE.map((v) => v * prop.scale) as Vec3,
      figure: { prop: prop.id, slot: piece.slot },
      tag: { position: prop.position, yaw: prop.yaw },
    }]
  })
}

export function templateStoreLayout(template: MallTemplate, modelSizes: ReadonlyMap<string, Vec3>): StoreLayout {
  const { width, depth } = template.preset
  const vendor = templateVendor(template)
  const displays = template.props.flatMap((prop): StoreDisplay[] => {
    if (prop.kind === 'mannequin') return mannequinDisplays(prop)
    if (prop.kind !== 'item' || !prop.forSale) return []
    const size = modelSizes.get(prop.id)
    if (!size) throw new TemplateError(`${template.key}.${prop.id}`, 'model size missing')
    return [{
      key: prop.key,
      code: prop.code,
      department: TEMPLATE_DEPARTMENT,
      description: '',
      position: prop.position,
      yaw: prop.yaw,
      size: size.map((v) => v * prop.scale) as Vec3,
      scale: prop.scale,
      ...(prop.stack ? { stack: prop.stack } : {}),
      tag: { position: prop.position, yaw: prop.yaw },
    }]
  })
  return {
    version: 1,
    key: template.key,
    name: template.name,
    bounds: { minX: -width / 2, maxX: width / 2, minZ: -depth, maxZ: 0 },
    departments: [{ id: TEMPLATE_DEPARTMENT, label: template.name, color: '#ffffff', sign: [0, 0, 0] }],
    displays,
    ...(vendor ? { counter: vendorCounter(vendor), clerk: { position: vendor.position, yaw: vendor.yaw } } : {}),
  }
}

export class TemplateError extends Error {
  constructor(path: string, problem: string) {
    super(`${path}: ${problem}`)
    this.name = 'TemplateError'
  }
}

type Json = Record<string, unknown>

function objectAt(value: unknown, path: string, allowed?: readonly string[]): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TemplateError(path, 'expected an object')
  const unknownKey = allowed && Object.keys(value).find((k) => !allowed.includes(k))
  if (unknownKey) throw new TemplateError(`${path}.${unknownKey}`, `unknown field, expected one of ${allowed.join(', ')}`)
  return value as Json
}

function stringAt(value: unknown, path: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value === '') throw new TemplateError(path, 'expected a non-empty string')
  if (pattern && !pattern.test(value)) throw new TemplateError(path, `"${value}" does not match ${pattern}`)
  return value
}

function numberAt(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TemplateError(path, 'expected a finite number')
  return value
}

function positiveAt(value: unknown, path: string): number {
  const n = numberAt(value, path)
  if (n <= 0) throw new TemplateError(path, 'expected a number above 0')
  return n
}

function vec3At(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) throw new TemplateError(path, 'expected [x, y, z]')
  return [numberAt(value[0], `${path}[0]`), numberAt(value[1], `${path}[1]`), numberAt(value[2], `${path}[2]`)]
}

function stackAt(value: unknown, path: string): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => Number.isInteger(n) && n >= 1)) {
    throw new TemplateError(path, 'expected [columns, rows] of whole numbers from 1')
  }
  return [value[0], value[1]]
}

function mannequinOutfitAt(value: unknown, path: string): MannequinPiece[] {
  const pieces = outfitAt(value, path, ['forSale', 'code'])
  return pieces.map((piece, i) => {
    const raw = (value as Json[])[i]!
    if (typeof raw.forSale !== 'boolean') throw new TemplateError(`${path}[${i}].forSale`, 'expected true or false')
    if (!raw.forSale) {
      if (raw.code !== undefined) throw new TemplateError(`${path}[${i}].code`, 'only pieces for sale carry an item code')
      return { ...piece, forSale: false }
    }
    return { ...piece, forSale: true, code: stringAt(raw.code, `${path}[${i}].code`, ITEM_CODE) }
  })
}

function outfitAt(value: unknown, path: string, extraFields: readonly string[] = []): OutfitPiece[] {
  if (!Array.isArray(value)) throw new TemplateError(path, 'expected an array')
  const seen = new Set<WearSlot>()
  return value.map((raw, i) => {
    const piece = objectAt(raw, `${path}[${i}]`, ['slot', 'key', 'color', ...extraFields])
    const slot = piece.slot as WearSlot
    if (!WEAR_SLOTS.includes(slot)) throw new TemplateError(`${path}[${i}].slot`, `expected one of ${WEAR_SLOTS.join(', ')}`)
    if (seen.has(slot)) throw new TemplateError(`${path}[${i}].slot`, `"${slot}" is worn twice`)
    seen.add(slot)
    return { slot, key: stringAt(piece.key, `${path}[${i}].key`, TEMPLATE_KEY), color: stringAt(piece.color, `${path}[${i}].color`, HEX_COLOR) }
  })
}

const BASE_FIELDS = ['id', 'kind', 'position', 'yaw', 'scale']
const KIND_FIELDS: Record<string, readonly string[]> = {
  decor: [...BASE_FIELDS, 'key', 'materials'],
  item: [...BASE_FIELDS, 'key', 'code', 'forSale', 'stack'],
  npc: [...BASE_FIELDS, 'pose', 'vendor', 'body', 'outfit'],
  mannequin: [...BASE_FIELDS, 'body', 'outfit'],
  light: [...BASE_FIELDS, 'light', 'color', 'intensity', 'range', 'angle', 'pitch'],
}

function itemAt(prop: Json, path: string): Pick<ItemProp, 'key' | 'code'> {
  const key = stringAt(prop.key, `${path}.key`, TEMPLATE_KEY)
  const code = stringAt(prop.code, `${path}.code`, ITEM_CODE)
  if (isConsumableCode(code) && !code.endsWith(`_${key}`)) throw new TemplateError(`${path}.key`, `consumable ${code} has its model in folder ${code.slice(code.indexOf('_') + 1)}`)
  return { key, code }
}

function lookAt(raw: unknown, path: string): MaterialLook {
  const json = objectAt(raw, path, ['texture', 'color'])
  if (json.texture === undefined && json.color === undefined) throw new TemplateError(path, 'expected a texture, a color or both')
  return {
    ...(json.texture !== undefined ? { texture: stringAt(json.texture, `${path}.texture`, TEMPLATE_KEY) } : {}),
    ...(json.color !== undefined ? { color: stringAt(json.color, `${path}.color`, HEX_COLOR) } : {}),
  }
}

function propAt(raw: unknown, path: string): TemplateProp {
  const kind = objectAt(raw, path).kind
  if (typeof kind !== 'string' || !Object.keys(KIND_FIELDS).includes(kind)) throw new TemplateError(`${path}.kind`, 'expected decor, item, npc, mannequin or light')
  const prop = objectAt(raw, path, KIND_FIELDS[kind])
  const base = {
    id: stringAt(prop.id, `${path}.id`),
    position: vec3At(prop.position, `${path}.position`),
    yaw: numberAt(prop.yaw, `${path}.yaw`),
    scale: positiveAt(prop.scale, `${path}.scale`),
  }
  switch (prop.kind) {
    case 'decor': {
      const decor: DecorProp = { ...base, kind: 'decor', key: stringAt(prop.key, `${path}.key`, TEMPLATE_KEY) }
      if (prop.materials !== undefined) {
        const materials = objectAt(prop.materials, `${path}.materials`)
        decor.materials = Object.fromEntries(
          Object.entries(materials).map(([name, look]) => {
            if (!MATERIAL_NAME.test(name)) throw new TemplateError(`${path}.materials.${name}`, `material names look like ${MATERIAL_NAME}`)
            return [name, lookAt(look, `${path}.materials.${name}`)]
          }),
        )
      }
      return decor
    }
    case 'item': {
      if (typeof prop.forSale !== 'boolean') throw new TemplateError(`${path}.forSale`, 'expected true or false')
      const item: ItemProp = { ...base, kind: 'item', ...itemAt(prop, path), forSale: prop.forSale }
      if (prop.stack !== undefined && !item.forSale) throw new TemplateError(`${path}.stack`, 'only items for sale are stacked')
      if (prop.stack !== undefined) item.stack = stackAt(prop.stack, `${path}.stack`)
      return item
    }
    case 'npc': {
      const pose = prop.pose as NpcPose
      if (!NPC_POSES.includes(pose)) throw new TemplateError(`${path}.pose`, `expected one of ${NPC_POSES.join(', ')}`)
      if (typeof prop.vendor !== 'boolean') throw new TemplateError(`${path}.vendor`, 'expected true or false')
      return {
        ...base,
        kind: 'npc',
        pose,
        vendor: prop.vendor,
        body: stringAt(prop.body, `${path}.body`, HEX_COLOR),
        outfit: outfitAt(prop.outfit, `${path}.outfit`),
      }
    }
    case 'mannequin':
      return { ...base, kind: 'mannequin', body: stringAt(prop.body, `${path}.body`, HEX_COLOR), outfit: mannequinOutfitAt(prop.outfit, `${path}.outfit`) }
    case 'light': {
      const light = prop.light as LightKind
      if (!LIGHT_KINDS.includes(light)) throw new TemplateError(`${path}.light`, `expected one of ${LIGHT_KINDS.join(', ')}`)
      const lamp: LightProp = {
        ...base,
        kind: 'light',
        light,
        color: stringAt(prop.color, `${path}.color`, HEX_COLOR),
        intensity: positiveAt(prop.intensity, `${path}.intensity`),
        range: positiveAt(prop.range, `${path}.range`),
      }
      if (lamp.range > MAX_LIGHT_RANGE) throw new TemplateError(`${path}.range`, `expected at most ${MAX_LIGHT_RANGE} m`)
      if (lamp.position[1] > CEILING_HEIGHT) throw new TemplateError(`${path}.position`, `lights hang at most ${CEILING_HEIGHT} m high`)
      if (light === 'point') {
        if (prop.angle !== undefined || prop.pitch !== undefined) throw new TemplateError(path, 'only spot lights have an angle and a pitch')
        return lamp
      }
      const angle = positiveAt(prop.angle, `${path}.angle`)
      if (angle > Math.PI / 2) throw new TemplateError(`${path}.angle`, 'expected at most π/2')
      return { ...lamp, angle, pitch: numberAt(prop.pitch, `${path}.pitch`) }
    }
    default:
      throw new TemplateError(`${path}.kind`, 'expected decor, item, npc, mannequin or light')
  }
}

function insidePreset(point: Vec3, preset: CellPreset): boolean {
  const [x, y, z] = point
  const { halfWidth, minZ } = usableArea(preset)
  return Math.abs(x) <= halfWidth && y >= 0 && z >= minZ && z <= 0
}

export function parseMallTemplate(raw: unknown): MallTemplate {
  const json = objectAt(raw, 'template', ['version', 'key', 'name', 'preset', 'surfaces', 'props'])
  if (json.version !== 1) throw new TemplateError('template.version', 'expected 1')
  const presetJson = objectAt(json.preset, 'template.preset', ['width', 'depth'])
  const preset = { width: positiveAt(presetJson.width, 'template.preset.width'), depth: positiveAt(presetJson.depth, 'template.preset.depth') }
  if (!Array.isArray(json.props)) throw new TemplateError('template.props', 'expected an array')
  const props = json.props.map((p, i) => propAt(p, `template.props[${i}]`))
  const ids = new Set<string>()
  props.forEach((p, i) => {
    if (ids.has(p.id)) throw new TemplateError(`template.props[${i}].id`, `"${p.id}" is used twice`)
    ids.add(p.id)
  })
  if (props.filter((p) => p.kind === 'npc' && p.vendor).length > 1) throw new TemplateError('template.props', 'only one NPC can be the vendor')
  props.forEach((p, i) => {
    if (p.kind === 'npc' && p.vendor && (p.pose !== 'idle' || p.scale !== 1)) throw new TemplateError(`template.props[${i}]`, 'the vendor stands (pose idle) at scale 1')
  })
  props.forEach((p, i) => {
    if (!insidePreset(p.position, preset)) throw new TemplateError(`template.props[${i}].position`, `outside the ${preset.width}×${preset.depth} cell`)
    if (p.kind === 'npc' && p.vendor && !insidePreset(vendorCounter(p), preset)) throw new TemplateError(`template.props[${i}]`, 'the counter in front of the vendor is outside the cell')
  })
  if (props.filter((p) => p.kind === 'light').length > MAX_LIGHTS) throw new TemplateError('template.props', `at most ${MAX_LIGHTS} lights per cell`)
  const template: MallTemplate = {
    version: 1,
    key: stringAt(json.key, 'template.key', TEMPLATE_KEY),
    name: stringAt(json.name, 'template.name'),
    preset,
    props,
  }
  if (json.surfaces !== undefined) {
    const surfaces = objectAt(json.surfaces, 'template.surfaces', SURFACES)
    template.surfaces = Object.fromEntries(Object.entries(surfaces).map(([surface, look]) => [surface, lookAt(look, `template.surfaces.${surface}`)]))
  }
  return template
}

export function assignTemplate(assignments: TemplateAssignments, cells: readonly MallCell[], cellId: string, template: MallTemplate | null): TemplateAssignments {
  const cell = cells.find((c) => c.id === cellId)
  if (!cell) throw new TemplateError(`cell ${cellId}`, 'no such cell in mall.layout.json')
  const rest = Object.fromEntries(Object.entries(assignments.cells).filter(([id]) => id !== cellId))
  if (!template) return { version: 1, cells: rest }
  if (cell.status !== 'planned') throw new TemplateError(`cell ${cellId}`, `is ${cell.status}, only planned cells take a template`)
  if (!samePreset(cell, template.preset)) {
    throw new TemplateError(`cell ${cellId}`, `is ${cell.width}×${cell.depth}, template ${template.key} is ${template.preset.width}×${template.preset.depth}`)
  }
  const current = assignments.cells[cellId]
  if (current !== undefined && current !== template.key) throw new TemplateError(`cell ${cellId}`, `already holds ${current}, clear it first`)
  return { version: 1, cells: { ...rest, [cellId]: template.key } }
}

export function parseCategories(raw: unknown): Category[] {
  const json = objectAt(raw, 'categories', ['version', 'categories'])
  if (json.version !== 1) throw new TemplateError('categories.version', 'expected 1')
  if (!Array.isArray(json.categories)) throw new TemplateError('categories.categories', 'expected an array')
  const seen = new Set<string>()
  return json.categories.map((raw, i) => {
    const path = `categories.categories[${i}]`
    const category = objectAt(raw, path, ['id', 'label', 'keys'])
    if (!Array.isArray(category.keys)) throw new TemplateError(`${path}.keys`, 'expected an array')
    const keys = category.keys.map((k, j) => stringAt(k, `${path}.keys[${j}]`, TEMPLATE_KEY))
    for (const key of keys) {
      if (seen.has(key)) throw new TemplateError(`${path}.keys`, `${key} is in two categories`)
      seen.add(key)
    }
    return { id: stringAt(category.id, `${path}.id`, TEMPLATE_KEY), label: stringAt(category.label, `${path}.label`), keys }
  })
}

export function parseTextureMeta(raw: unknown, key: string): TextureMeta {
  const path = `textures/${key}/texture.json`
  const json = objectAt(raw, path, ['version', 'key', 'label', 'tileMeters', 'maps'])
  if (json.version !== 1) throw new TemplateError(`${path}.version`, 'expected 1')
  if (json.key !== key) throw new TemplateError(`${path}.key`, `expected ${key}`)
  const maps = objectAt(json.maps, `${path}.maps`, ['color', 'normal'])
  return {
    version: 1,
    key,
    label: stringAt(json.label, `${path}.label`),
    tileMeters: positiveAt(json.tileMeters, `${path}.tileMeters`),
    maps: { color: stringAt(maps.color, `${path}.maps.color`, MAP_FILE), ...(maps.normal !== undefined ? { normal: stringAt(maps.normal, `${path}.maps.normal`, MAP_FILE) } : {}) },
  }
}

export function parseTemplateAssignments(raw: unknown): TemplateAssignments {
  const json = objectAt(raw, 'assignments', ['version', 'cells'])
  if (json.version !== 1) throw new TemplateError('assignments.version', 'expected 1')
  const cells = objectAt(json.cells, 'assignments.cells')
  const out: Record<string, string> = {}
  for (const [cellId, key] of Object.entries(cells)) {
    if (!CELL_ID.test(cellId)) throw new TemplateError(`assignments.cells.${cellId}`, `cell ids look like ${CELL_ID}`)
    out[cellId] = stringAt(key, `assignments.cells.${cellId}`, TEMPLATE_KEY)
  }
  return { version: 1, cells: out }
}
