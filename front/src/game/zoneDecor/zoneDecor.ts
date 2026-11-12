import { isConsumableCode, type StoreDisplay, type StoreLayout } from '../assets/catalog.ts'
import type { WorldBounds, WorldManifest } from '../world/worldManifest.ts'
import type { SaleCurve } from '../economy/sharemath.ts'
import { MAX_PEN_SIDE, MIN_PEN_SIDE, type AnimalTable } from '../animals/animals.ts'
import { MAX_ROOF, MIN_ROOF, ROOF_OVERHANG, checkBuilding, colorsAt, openingAt, texturesAt, type BuildingTable } from '../buildings/buildings.ts'
import { FIELD_PATTERNS, MAX_FIELD_PLANTS, fieldCorners, fieldPlants, type CropTable, type PlantSpot } from '../crops/crops.ts'
import { MAX_SHELF_LENGTH, MAX_SHELF_SLOTS, MAX_SLOT_COPIES, MIN_SHELF_LENGTH, SHELF_ARRANGES, SHELF_TYPES, shelfFaces, shelfMaxLevels, slotBoxes, type ShelfArrange, type ShelfType } from '../shelves/shelves.ts'
import {
  TEMPLATE_DEPARTMENT,
  TEMPLATE_KEY,
  TemplateError,
  itemAt,
  numberAt,
  propAt,
  stringAt,
  templateStoreLayout,
  toWorld,
  vec3At,
  vendorCounter,
  type AnimalProp,
  type BuildingProp,
  type DecorProp,
  type FieldProp,
  type ItemProp,
  type MannequinProp,
  type NpcProp,
  type ShelfProp,
  type ShelfSlotFill,
  STAFF_ROLES,
  type StaffRole,
  type TemplateProp,
  type Vec3,
} from '../mallTemplates/mallTemplate.ts'

type ZoneProp = DecorProp | ItemProp | NpcProp | MannequinProp | FieldProp | AnimalProp | BuildingProp | ShelfProp
export type BakedZoneProp = DecorProp | FieldProp | BuildingProp
export type RuntimeZoneProp = Exclude<ZoneProp, BakedZoneProp>
const FIELD_KEYS = ['id', 'kind', 'crop', 'position', 'yaw', 'scale', 'size', 'pattern', 'plants', 'group']
const ANIMAL_KEYS = ['id', 'kind', 'animal', 'position', 'yaw', 'scale', 'size', 'group']
const BUILDING_KEYS = ['id', 'kind', 'building', 'position', 'yaw', 'scale', 'size', 'height', 'roof', 'ridge', 'openings', 'colors', 'textures', 'group']
const SHELF_KEYS = ['id', 'kind', 'shelf', 'position', 'yaw', 'scale', 'length', 'levels', 'slots', 'fill', 'group']
const SLOT_FILL_KEYS = ['code', 'key', 'price', 'count', 'arrange']
const SLOT_KEY = /^(\d)\.(\d)\.(\d)$/
const QUARTER_TURN = Math.PI / 2
const MIN_FIELD_SIDE = 1
const MAX_FIELD_SIDE = 60
const PLANT_TOLERANCE = 1e-3
const MAX_ZONE_PRICE = 100_000
const MAX_DAILY_QUOTA = 10_000
const MIN_AREA_SIDE = 1
const AREA_KEYS = ['id', 'name', 'role', 'npc', 'bounds', 'offers']
const OFFER_KEYS = ['code', 'price', 'quota', 'overPrice']
export const SALE_ROLES = ['seller', 'buyer'] as const
export type SaleRole = (typeof SALE_ROLES)[number]

export interface SaleOffer extends SaleCurve {
  code: string
}

export interface SaleArea {
  id: string
  name: string
  role: SaleRole
  npc: string
  bounds: WorldBounds
  offers: SaleOffer[]
}

export interface ZoneDecor {
  version: 1
  zone: string
  name: string
  parent?: string
  bounds?: WorldBounds
  props: ZoneProp[]
  areas: SaleArea[]
}

export interface ZoneRef {
  key: string
  bounds: WorldBounds
  parent?: string
}

export interface ZoneDecorIndex {
  version: 1
  zones: string[]
}

const ZONE_DECOR_URL = '/assets/zones'
export const ZONE_DECOR_INDEX_URL = `${ZONE_DECOR_URL}/index.json`

export function zoneDecorUrl(zone: string): string {
  return `${ZONE_DECOR_URL}/${zone}.json`
}

function insideBounds(point: readonly number[], bounds: WorldBounds): boolean {
  const [x, , z] = point as Vec3
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ
}

function objectAt(raw: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new TemplateError(path, 'expected an object')
  const unknownKey = Object.keys(raw).find((k) => !allowed.includes(k))
  if (unknownKey) throw new TemplateError(`${path}.${unknownKey}`, `unknown field, expected one of ${allowed.join(', ')}`)
  return raw as Record<string, unknown>
}

function sideAt(value: unknown, path: string, min = MIN_FIELD_SIDE, max = MAX_FIELD_SIDE): number {
  const side = numberAt(value, path)
  if (side < min || side > max) throw new TemplateError(path, `expected ${min} to ${max} m`)
  return side
}

function samePlants(stored: unknown, expected: PlantSpot[]): boolean {
  return (
    Array.isArray(stored) &&
    stored.length === expected.length &&
    stored.every((spot, i) => Array.isArray(spot) && spot.length === 4 && spot.every((v, k) => typeof v === 'number' && Math.abs(v - expected[i]![k]!) <= PLANT_TOLERANCE))
  )
}

function fieldPropAt(raw: unknown, path: string, crops: CropTable | null): FieldProp {
  const json = objectAt(raw, path, FIELD_KEYS)
  const crop = stringAt(json.crop, `${path}.crop`)
  if (crops && !crops[crop]) throw new TemplateError(`${path}.crop`, `expected one of ${Object.keys(crops).join(', ')}`)
  const pattern = json.pattern as FieldProp['pattern']
  if (!FIELD_PATTERNS.includes(pattern)) throw new TemplateError(`${path}.pattern`, `expected one of ${FIELD_PATTERNS.join(', ')}`)
  if (!Array.isArray(json.size) || json.size.length !== 2) throw new TemplateError(`${path}.size`, 'expected [width, depth]')
  const scale = vec3At(json.scale, `${path}.scale`)
  if (scale.some((s) => s !== 1)) throw new TemplateError(`${path}.scale`, 'a field keeps scale 1, change its size instead')
  const field: FieldProp = {
    id: stringAt(json.id, `${path}.id`),
    kind: 'field',
    crop,
    position: vec3At(json.position, `${path}.position`),
    yaw: numberAt(json.yaw, `${path}.yaw`),
    scale,
    size: [sideAt(json.size[0], `${path}.size[0]`), sideAt(json.size[1], `${path}.size[1]`)],
    pattern,
  }
  if (!crops) return field
  const plants = fieldPlants(field, crops[crop]!)
  if (plants.length === 0 || plants.length > MAX_FIELD_PLANTS) throw new TemplateError(path, `a field grows 1 to ${MAX_FIELD_PLANTS} plants, this one ${plants.length}`)
  if (!samePlants(json.plants, plants)) throw new TemplateError(`${path}.plants`, 'do not match the field, save it again from the editor')
  return field
}

function animalPropAt(raw: unknown, path: string, animals: AnimalTable | null): AnimalProp {
  const json = objectAt(raw, path, ANIMAL_KEYS)
  const animal = stringAt(json.animal, `${path}.animal`)
  if (animals && !animals[animal]) throw new TemplateError(`${path}.animal`, `expected one of ${Object.keys(animals).join(', ')}`)
  if (!Array.isArray(json.size) || json.size.length !== 2) throw new TemplateError(`${path}.size`, 'expected [width, depth] of the pen')
  const scale = vec3At(json.scale, `${path}.scale`)
  if (scale.some((s) => s !== 1)) throw new TemplateError(`${path}.scale`, 'an animal keeps scale 1, change its pen size instead')
  return {
    id: stringAt(json.id, `${path}.id`),
    kind: 'animal',
    animal,
    position: vec3At(json.position, `${path}.position`),
    yaw: numberAt(json.yaw, `${path}.yaw`),
    scale,
    size: [sideAt(json.size[0], `${path}.size[0]`, MIN_PEN_SIDE, MAX_PEN_SIDE), sideAt(json.size[1], `${path}.size[1]`, MIN_PEN_SIDE, MAX_PEN_SIDE)],
  }
}

function zonePriceAt(price: unknown, forSale: boolean, path: string, what: string): number | undefined {
  if (!forSale) {
    if (price !== undefined) throw new TemplateError(path, `only ${what} for sale have a price`)
    return undefined
  }
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 1 || price > MAX_ZONE_PRICE) throw new TemplateError(path, `expected whole coins from 1 to ${MAX_ZONE_PRICE}`)
  return price
}

function zoneItemAt(raw: unknown, path: string): ItemProp {
  const { price, ...rest } = raw as Record<string, unknown>
  const item = propAt(rest, path) as ItemProp
  const priced = zonePriceAt(price, item.forSale, `${path}.price`, 'items')
  return priced === undefined ? item : { ...item, price: priced }
}

const STAFF_ZONE: Record<StaffRole, string> = { bartender: 'pub', bouncer: 'pub', nurse: 'clinic' }

function zoneNpcAt(raw: unknown, path: string, zone: string): NpcProp {
  const { role, ...rest } = raw as Record<string, unknown>
  const npc = propAt(rest, path) as NpcProp
  if (role === undefined) return npc
  if (!STAFF_ROLES.includes(role as StaffRole)) throw new TemplateError(`${path}.role`, `expected one of ${STAFF_ROLES.join(', ')}`)
  const staff = role as StaffRole
  if (STAFF_ZONE[staff] !== zone) throw new TemplateError(`${path}.role`, `the ${staff} works in zone ${STAFF_ZONE[staff]}`)
  return { ...npc, role: staff }
}

function checkStaff(props: ZoneProp[], zone: string): void {
  for (const role of STAFF_ROLES) {
    const staff = props.filter((p) => p.kind === 'npc' && p.role === role)
    if (staff.length > 1) throw new TemplateError('zone.props', `only one ${role} works here`)
    if (STAFF_ZONE[role] === zone && staff.length === 0) throw new TemplateError('zone.props', `the ${role} is missing: give an NPC the ${role} role`)
  }
}

export interface StaffSpot {
  role: StaffRole
  position: Vec3
  yaw: number
}

export function staffOf(decor: ZoneDecor): StaffSpot[] {
  return decor.props.flatMap((p) => (p.kind === 'npc' && p.role ? [{ role: p.role, position: p.position, yaw: p.yaw }] : []))
}

export function withStaff(manifest: WorldManifest, decor: ZoneDecor): WorldManifest {
  let next = manifest
  for (const { role, position, yaw } of staffOf(decor)) {
    if (role === 'nurse') {
      if (!next.clinic) throw new TemplateError('zone.props', 'world.manifest.json has no clinic for the nurse')
      next = { ...next, clinic: { ...next.clinic, nurse: position } }
      continue
    }
    if (!next.pub) throw new TemplateError('zone.props', `world.manifest.json has no pub for the ${role}`)
    next = role === 'bartender'
      ? { ...next, pub: { ...next.pub, bartender: position, bartenderYaw: Number(Math.atan2(-Math.sin(yaw), -Math.cos(yaw)).toFixed(4)) } }
      : { ...next, pub: { ...next.pub, bouncer: position } }
  }
  return next
}

function zoneMannequinAt(raw: unknown, path: string): MannequinProp {
  const json = raw as Record<string, unknown>
  const pieces = Array.isArray(json.outfit) ? (json.outfit as Array<Record<string, unknown>>) : null
  const unpriced = pieces ? { ...json, outfit: pieces.map(({ price: _, ...piece }) => piece) } : json
  const mannequin = propAt(unpriced, path) as MannequinProp
  return {
    ...mannequin,
    outfit: mannequin.outfit.map((piece, i) => {
      const price = zonePriceAt(pieces![i]!.price, piece.forSale, `${path}.outfit[${i}].price`, 'pieces')
      return price === undefined ? piece : { ...piece, price }
    }),
  }
}

export interface SoldCode {
  code: string
  price: number
}

export function soldCodes(prop: ZoneProp | TemplateProp): SoldCode[] {
  if (prop.kind === 'item') return prop.forSale && prop.price !== undefined ? [{ code: prop.code, price: prop.price }] : []
  if (prop.kind === 'mannequin') return prop.outfit.flatMap((piece) => (piece.forSale && piece.code && piece.price !== undefined ? [{ code: piece.code, price: piece.price }] : []))
  if (prop.kind === 'shelf') return Object.values(prop.fill).map(({ code, price }) => ({ code, price }))
  return []
}

function slotFillAt(raw: unknown, path: string): ShelfSlotFill {
  const json = objectAt(raw, path, SLOT_FILL_KEYS)
  const arrange = json.arrange as ShelfArrange
  if (!SHELF_ARRANGES.includes(arrange)) throw new TemplateError(`${path}.arrange`, `expected one of ${SHELF_ARRANGES.join(', ')}`)
  return {
    ...itemAt(json, path),
    price: zonePriceAt(json.price, true, `${path}.price`, 'slots')!,
    count: wholeAt(json.count, `${path}.count`, 1, MAX_SLOT_COPIES),
    arrange,
  }
}

function shelfPropAt(raw: unknown, path: string): ShelfProp {
  const json = objectAt(raw, path, SHELF_KEYS)
  const shelf = json.shelf as ShelfType
  if (!SHELF_TYPES.includes(shelf)) throw new TemplateError(`${path}.shelf`, `expected one of ${SHELF_TYPES.join(', ')}`)
  const scale = vec3At(json.scale, `${path}.scale`)
  if (scale.some((v) => v !== 1)) throw new TemplateError(`${path}.scale`, 'a shelf keeps scale 1, change its length or levels instead')
  const length = wholeAt(json.length, `${path}.length`, MIN_SHELF_LENGTH, MAX_SHELF_LENGTH)
  const levels = wholeAt(json.levels, `${path}.levels`, 1, shelfMaxLevels(shelf))
  const slots = wholeAt(json.slots, `${path}.slots`, 1, MAX_SHELF_SLOTS)
  const faces = shelfFaces(shelf)
  if (typeof json.fill !== 'object' || json.fill === null || Array.isArray(json.fill)) throw new TemplateError(`${path}.fill`, 'expected an object')
  const fill = Object.entries(json.fill).map(([key, slot]) => {
    const [, face, level, index] = (SLOT_KEY.exec(key) ?? []).map(Number)
    if (face === undefined || face >= faces || level! >= levels || index! >= slots) {
      throw new TemplateError(`${path}.fill.${key}`, `no such slot, keys are <face>.<level>.<slot> with face below ${faces}, level below ${levels}, slot below ${slots}`)
    }
    return [key, slotFillAt(slot, `${path}.fill.${key}`)] as const
  })
  return {
    id: stringAt(json.id, `${path}.id`),
    kind: 'shelf',
    shelf,
    position: vec3At(json.position, `${path}.position`),
    yaw: numberAt(json.yaw, `${path}.yaw`),
    scale,
    length,
    levels,
    slots,
    fill: Object.fromEntries(fill),
  }
}

function buildingPropAt(raw: unknown, path: string, buildings: BuildingTable | null): BuildingProp {
  const json = objectAt(raw, path, BUILDING_KEYS)
  const key = stringAt(json.building, `${path}.building`)
  const def = buildings?.[key]
  if (buildings && !def) throw new TemplateError(`${path}.building`, `expected one of ${Object.keys(buildings).join(', ')}`)
  if (!Array.isArray(json.size) || json.size.length !== 2) throw new TemplateError(`${path}.size`, 'expected [width, depth]')
  const scale = vec3At(json.scale, `${path}.scale`)
  if (scale.some((v) => v !== 1)) throw new TemplateError(`${path}.scale`, 'a building keeps scale 1, change its size instead')
  const yaw = numberAt(json.yaw, `${path}.yaw`)
  if (Math.abs(Math.round(yaw / QUARTER_TURN) * QUARTER_TURN - yaw) > 1e-3) throw new TemplateError(`${path}.yaw`, 'a building turns by quarter turns (0, 90, 180, 270°)')
  const roof = numberAt(json.roof, `${path}.roof`)
  if (roof < MIN_ROOF || roof > MAX_ROOF) throw new TemplateError(`${path}.roof`, `expected ${MIN_ROOF} to ${MAX_ROOF} m`)
  if (json.ridge !== 'x' && json.ridge !== 'z') throw new TemplateError(`${path}.ridge`, 'expected x or z')
  const position = vec3At(json.position, `${path}.position`)
  if (position[1] !== 0) throw new TemplateError(`${path}.position`, 'a building stands on the ground (height 0)')
  if (!Array.isArray(json.openings)) throw new TemplateError(`${path}.openings`, 'expected an array')
  const building: BuildingProp = {
    id: stringAt(json.id, `${path}.id`),
    kind: 'building',
    building: key,
    position,
    yaw,
    scale,
    size: [numberAt(json.size[0], `${path}.size[0]`), numberAt(json.size[1], `${path}.size[1]`)],
    height: numberAt(json.height, `${path}.height`),
    roof,
    ridge: json.ridge,
    openings: json.openings.map((o, i) => openingAt(o, `${path}.openings[${i}]`)),
    colors: colorsAt(json.colors, `${path}.colors`),
  }
  if (json.textures !== undefined) building.textures = texturesAt(json.textures, `${path}.textures`)
  if (def) checkBuilding(building, def, path)
  return building
}

export function parseBuildingProp(raw: unknown, buildings: BuildingTable): BuildingProp {
  return buildingPropAt(raw, 'building', buildings)
}

function grouped<P extends FieldProp | AnimalProp | BuildingProp | ShelfProp>(prop: P, raw: unknown, path: string): P {
  const group = (raw as { group?: unknown }).group
  return group === undefined ? prop : { ...prop, group: stringAt(group, `${path}.group`, TEMPLATE_KEY) }
}

function zonePropAt(raw: unknown, path: string, zone: string, crops: CropTable | null, animals: AnimalTable | null, buildings: BuildingTable | null): ZoneProp {
  const kind = (raw as { kind?: unknown } | null)?.kind
  if (kind === 'field') return grouped(fieldPropAt(raw, path, crops), raw, path)
  if (kind === 'animal') return grouped(animalPropAt(raw, path, animals), raw, path)
  if (kind === 'building') return grouped(buildingPropAt(raw, path, buildings), raw, path)
  if (kind === 'shelf') return grouped(shelfPropAt(raw, path), raw, path)
  if (kind === 'item') return zoneItemAt(raw, path)
  if (kind === 'mannequin') return zoneMannequinAt(raw, path)
  if (kind === 'npc') return zoneNpcAt(raw, path, zone)
  const prop = propAt(raw, path)
  if (prop.kind === 'light') throw new TemplateError(`${path}.kind`, 'zones are lit by the sky, they take no light')
  if (prop.kind === 'decor' && prop.materials) throw new TemplateError(`${path}.materials`, 'baked zone decor keeps its own materials')
  return prop
}

function wholeAt(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new TemplateError(path, `expected a whole number from ${min} to ${max}`)
  return value
}

function offerAt(raw: unknown, path: string): SaleOffer {
  const json = objectAt(raw, path, OFFER_KEYS)
  const price = wholeAt(json.price, `${path}.price`, 1, MAX_ZONE_PRICE)
  const code = stringAt(json.code, `${path}.code`)
  if (!isConsumableCode(code)) throw new TemplateError(`${path}.code`, 'a buyer buys consumables (crops, eggs, food...)')
  return {
    code,
    price,
    quota: wholeAt(json.quota, `${path}.quota`, 0, MAX_DAILY_QUOTA),
    overPrice: wholeAt(json.overPrice, `${path}.overPrice`, 0, price),
  }
}

function areaBoundsAt(raw: unknown, path: string, zone: { key: string; bounds: WorldBounds }): WorldBounds {
  const json = objectAt(raw, path, ['minX', 'maxX', 'minZ', 'maxZ'])
  const bounds = { minX: numberAt(json.minX, `${path}.minX`), maxX: numberAt(json.maxX, `${path}.maxX`), minZ: numberAt(json.minZ, `${path}.minZ`), maxZ: numberAt(json.maxZ, `${path}.maxZ`) }
  if (bounds.maxX - bounds.minX < MIN_AREA_SIDE || bounds.maxZ - bounds.minZ < MIN_AREA_SIDE) throw new TemplateError(path, `an area is at least ${MIN_AREA_SIDE} m on each side`)
  if (!insideBounds([bounds.minX, 0, bounds.minZ], zone.bounds) || !insideBounds([bounds.maxX, 0, bounds.maxZ], zone.bounds)) throw new TemplateError(path, `the area reaches outside zone ${zone.key}`)
  return bounds
}

function areaAt(raw: unknown, path: string, zone: { key: string; bounds: WorldBounds }): SaleArea {
  const json = objectAt(raw, path, AREA_KEYS)
  const role = json.role as SaleRole
  if (!SALE_ROLES.includes(role)) throw new TemplateError(`${path}.role`, `expected one of ${SALE_ROLES.join(', ')}`)
  if (!Array.isArray(json.offers)) throw new TemplateError(`${path}.offers`, 'expected an array')
  const name = stringAt(json.name, `${path}.name`)
  if (name.trim() === '') throw new TemplateError(`${path}.name`, 'expected a non-empty string')
  return {
    id: stringAt(json.id, `${path}.id`),
    name,
    role,
    npc: stringAt(json.npc, `${path}.npc`),
    bounds: areaBoundsAt(json.bounds, `${path}.bounds`, zone),
    offers: json.offers.map((o, i) => offerAt(o, `${path}.offers[${i}]`)),
  }
}

function overlap(a: WorldBounds, b: WorldBounds): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ
}

function roofBounds(building: BuildingProp): WorldBounds {
  const corners = fieldCorners(building)
  const xs = corners.map(([x]) => x)
  const zs = corners.map(([, z]) => z)
  return { minX: Math.min(...xs) - ROOF_OVERHANG, maxX: Math.max(...xs) + ROOF_OVERHANG, minZ: Math.min(...zs) - ROOF_OVERHANG, maxZ: Math.max(...zs) + ROOF_OVERHANG }
}

function checkBuildingRoofs(props: ZoneProp[]): void {
  const roofs = props.flatMap((p, i) => (p.kind === 'building' ? [{ i, id: p.id, bounds: roofBounds(p) }] : []))
  roofs.forEach((a, k) => {
    const other = roofs.find((b, j) => j < k && overlap(a.bounds, b.bounds))
    if (other) throw new TemplateError(`zone.props[${a.i}].position`, `the building's roof overlaps building "${other.id}"`)
  })
}

function checkAreas(areas: SaleArea[], props: ZoneProp[]): void {
  areas.forEach((area, i) => {
    if (areas.findIndex((a) => a.id === area.id) !== i) throw new TemplateError(`zone.areas[${i}].id`, `"${area.id}" is used twice`)
  })
  const npcs = new Set<string>()
  areas.forEach((area, i) => {
    const path = `zone.areas[${i}]`
    const npc = props.find((p): p is NpcProp => p.kind === 'npc' && p.id === area.npc)
    if (!npc) throw new TemplateError(`${path}.npc`, `no NPC "${area.npc}" in this zone`)
    if (npcs.has(npc.id)) throw new TemplateError(`${path}.npc`, `"${npc.id}" already works in another area`)
    npcs.add(npc.id)
    if (!insideBounds(npc.position, area.bounds)) throw new TemplateError(`${path}.npc`, `"${npc.id}" stands outside the area`)
    if (area.role === 'buyer') {
      if (area.offers.length === 0) throw new TemplateError(`${path}.offers`, 'a buyer buys at least one item')
      const codes = area.offers.map((o) => o.code)
      const twice = codes.find((code, k) => codes.indexOf(code) !== k)
      if (twice) throw new TemplateError(`${path}.offers`, `${twice} is listed twice`)
      return
    }
    if (area.offers.length > 0) throw new TemplateError(`${path}.offers`, 'a seller sells the items for sale in its area, it has no offers')
    if (npc.pose !== 'idle' || npc.scale.some((v) => v !== 1)) throw new TemplateError(`${path}.npc`, 'the seller stands (pose idle) at scale 1')
    if (!insideBounds(vendorCounter(npc), area.bounds)) throw new TemplateError(`${path}.npc`, 'the counter in front of the seller is outside the area')
    const other = areas.findIndex((b, k) => k !== i && b.role === 'seller' && overlap(area.bounds, b.bounds))
    if (other !== -1) throw new TemplateError(`${path}.bounds`, `overlaps the seller area "${areas[other]!.name}"`)
  })
  props.forEach((p, i) => {
    const sold = soldCodes(p)
    if (sold.length === 0) return
    const what = sold.map((s) => s.code).join(', ')
    const sellers = areas.filter((a) => a.role === 'seller' && insideBounds(p.position, a.bounds))
    if (sellers.length === 0) throw new TemplateError(`zone.props[${i}]`, `${what} is for sale outside every seller area: draw one in the Sellers map`)
    if (sellers.length > 1) throw new TemplateError(`zone.props[${i}]`, `${what} sits on the edge of "${sellers[0]!.name}" and "${sellers[1]!.name}": move it into one of them`)
  })
}

export function zoneRefOf(key: string, raw: unknown, mainZones: readonly { key: string; bounds?: WorldBounds }[]): ZoneRef {
  const json = (raw ?? {}) as { parent?: unknown; bounds?: unknown }
  const main = mainZones.find((z) => z.key === key)
  if (main) {
    if (!main.bounds) throw new TemplateError('zone', `zone ${key} has no bounds in world.manifest.json`)
    if (json.parent !== undefined) throw new TemplateError('zone.parent', `${key} is a main zone, it has no parent`)
    return { key, bounds: main.bounds }
  }
  if (typeof json.parent !== 'string') throw new TemplateError('zone.parent', `${key} is not in world.manifest.json: a shop zone names its parent zone`)
  const parent = mainZones.find((z) => z.key === json.parent)
  if (!parent?.bounds) throw new TemplateError('zone.parent', `no main zone ${json.parent} in world.manifest.json`)
  return { key, bounds: areaBoundsAt(json.bounds, 'zone.bounds', { key: parent.key, bounds: parent.bounds }), parent: parent.key }
}

export function parseZoneDecor(raw: unknown, zone: ZoneRef, crops: CropTable | null, animals: AnimalTable | null, buildings: BuildingTable | null): ZoneDecor {
  const json = objectAt(raw, 'zone', ['version', 'zone', 'name', 'parent', 'bounds', 'props', 'areas'])
  if (json.version !== 1) throw new TemplateError('zone.version', 'expected 1')
  if (json.zone !== zone.key) throw new TemplateError('zone.zone', `expected ${zone.key}`)
  if (json.parent !== zone.parent) throw new TemplateError('zone.parent', zone.parent ? `expected ${zone.parent}` : 'a main zone has no parent')
  if (!zone.parent && json.bounds !== undefined) throw new TemplateError('zone.bounds', 'a main zone takes its bounds from world.manifest.json')
  if (zone.parent && JSON.stringify(areaBoundsAt(json.bounds, 'zone.bounds', zone)) !== JSON.stringify(zone.bounds)) throw new TemplateError('zone.bounds', `expected ${JSON.stringify(zone.bounds)}`)
  if (typeof json.name !== 'string' || json.name.trim() === '') throw new TemplateError('zone.name', 'expected a non-empty string')
  if (!Array.isArray(json.props)) throw new TemplateError('zone.props', 'expected an array')
  const props = json.props.map((p, i) => zonePropAt(p, `zone.props[${i}]`, zone.key, crops, animals, buildings))
  const ids = new Set<string>()
  props.forEach((p, i) => {
    if (ids.has(p.id)) throw new TemplateError(`zone.props[${i}].id`, `"${p.id}" is used twice`)
    ids.add(p.id)
    if (!insideBounds(p.position, zone.bounds)) throw new TemplateError(`zone.props[${i}].position`, `outside zone ${zone.key}`)
    if (p.kind === 'field' && fieldCorners(p).some(([x, z]) => !insideBounds([x, 0, z], zone.bounds))) throw new TemplateError(`zone.props[${i}].size`, `the field reaches outside zone ${zone.key}`)
    if (p.kind === 'animal' && fieldCorners(p).some(([x, z]) => !insideBounds([x, 0, z], zone.bounds))) throw new TemplateError(`zone.props[${i}].size`, `the pen reaches outside zone ${zone.key}`)
    if (p.kind === 'building' && fieldCorners(p).some(([x, z]) => !insideBounds([x, 0, z], zone.bounds))) throw new TemplateError(`zone.props[${i}].size`, `the building reaches outside zone ${zone.key}`)
    if (p.kind === 'npc' && p.vendor) throw new TemplateError(`zone.props[${i}].vendor`, 'a zone NPC sells through a sale area of the Sellers map, not the Cashier box')
  })
  checkBuildingRoofs(props)
  checkStaff(props, zone.key)
  const prices = new Map<string, number>()
  props.forEach((p, i) => {
    for (const { code, price } of soldCodes(p)) {
      const other = prices.get(code)
      if (other !== undefined && other !== price) throw new TemplateError(`zone.props[${i}]`, `${code} is already sold at ${other} coins in this zone`)
      prices.set(code, price)
    }
  })
  if (!Array.isArray(json.areas)) throw new TemplateError('zone.areas', 'expected an array')
  const areas = json.areas.map((a, i) => areaAt(a, `zone.areas[${i}]`, zone))
  checkAreas(areas, props)
  return { version: 1, zone: zone.key, name: json.name, ...(zone.parent ? { parent: zone.parent, bounds: zone.bounds } : {}), props, areas }
}

export function zonePrices(decor: ZoneDecor): Record<string, number> {
  return Object.fromEntries(decor.props.flatMap(soldCodes).map(({ code, price }) => [code, price] as const).sort(([a], [b]) => a.localeCompare(b)))
}

export interface ZonePriceFile {
  version: 1
  zone: string
  prices: Record<string, number>
  buyers: Record<string, Record<string, SaleCurve>>
}

export function zonePriceFile(decor: ZoneDecor): ZonePriceFile {
  const buyers = decor.areas.filter((a) => a.role === 'buyer')
  return {
    version: 1,
    zone: decor.zone,
    prices: zonePrices(decor),
    buyers: Object.fromEntries(buyers.map((a) => [a.id, Object.fromEntries(a.offers.map(({ code, price, quota, overPrice }) => [code, { price, quota, overPrice }]))])),
  }
}

export function parseZoneDecorIndex(raw: unknown): ZoneDecorIndex {
  const json = objectAt(raw, 'index', ['version', 'zones'])
  if (json.version !== 1) throw new TemplateError('index.version', 'expected 1')
  if (!Array.isArray(json.zones)) throw new TemplateError('index.zones', 'expected an array')
  const zones = json.zones.map((key, i) => {
    if (typeof key !== 'string' || !TEMPLATE_KEY.test(key)) throw new TemplateError(`index.zones[${i}]`, `zone keys look like ${TEMPLATE_KEY}`)
    return key
  })
  if (new Set(zones).size !== zones.length) throw new TemplateError('index.zones', 'a zone is listed twice')
  return { version: 1, zones }
}

export function bakedProps(decor: ZoneDecor): BakedZoneProp[] {
  return decor.props.filter((p): p is BakedZoneProp => p.kind === 'decor' || p.kind === 'field' || p.kind === 'building')
}

export function runtimeProps(decor: ZoneDecor): RuntimeZoneProp[] {
  return decor.props.filter((p): p is RuntimeZoneProp => p.kind !== 'decor' && p.kind !== 'field' && p.kind !== 'building')
}

export function zoneDecorJson(decor: Omit<ZoneDecor, 'props'> & { props: readonly TemplateProp[] }, crops: CropTable): unknown {
  return {
    ...decor,
    props: decor.props.map((p) => {
      if (p.kind !== 'field') return p
      const crop = crops[p.crop]
      if (!crop) throw new TemplateError(`${decor.zone}.${p.id}.crop`, `expected one of ${Object.keys(crops).join(', ')}`)
      return { ...p, plants: fieldPlants(p, crop) }
    }),
  }
}

export function areaSeller(decor: ZoneDecor, area: SaleArea): NpcProp {
  return decor.props.find((p): p is NpcProp => p.kind === 'npc' && p.id === area.npc)!
}

export function areaStoreLayout(decor: ZoneDecor, area: SaleArea, modelSizes: ReadonlyMap<string, Vec3>): StoreLayout {
  const sold = decor.props.filter((p) => soldCodes(p).length > 0 && insideBounds(p.position, area.bounds))
  const props = [...sold, { ...areaSeller(decor, area), vendor: true }]
  const layout = templateStoreLayout({ version: 1, key: `${decor.zone}_${area.id}`, name: area.name, preset: { width: 0, depth: 0 }, props }, modelSizes)
  const shelves = sold.filter((p): p is ShelfProp => p.kind === 'shelf').flatMap(shelfDisplays)
  return { ...layout, displays: [...layout.displays, ...shelves], bounds: { ...area.bounds } }
}

function shelfDisplays(shelf: ShelfProp): StoreDisplay[] {
  const placement = { position: shelf.position, yaw: shelf.yaw }
  return slotBoxes(shelf).flatMap((box) => {
    const fill = shelf.fill[box.key]
    if (!fill) return []
    const [x, y, z] = box.center
    return [{
      key: fill.key,
      code: fill.code,
      department: TEMPLATE_DEPARTMENT,
      description: '',
      position: toWorld(placement, [x, y - box.size[1] / 2, z]),
      yaw: shelf.yaw + box.yaw,
      size: box.size,
      shelfSlot: { prop: shelf.id, slot: box.key },
    }]
  })
}

export function zoneShown(bounds: WorldBounds, at: { x: number; z: number }, shown: boolean, showWithin: number, hideBeyond: number): boolean {
  const distance = Math.hypot(Math.max(bounds.minX - at.x, 0, at.x - bounds.maxX), Math.max(bounds.minZ - at.z, 0, at.z - bounds.maxZ))
  return shown ? distance <= hideBeyond : distance < showWithin
}
