import type { StoreLayout } from '../assets/catalog.ts'
import type { WorldBounds } from '../world/worldManifest.ts'
import { FIELD_PATTERNS, MAX_FIELD_PLANTS, fieldCorners, fieldPlants, type CropTable, type PlantSpot } from '../crops/crops.ts'
import {
  TEMPLATE_KEY,
  TemplateError,
  numberAt,
  propAt,
  stringAt,
  templateStoreLayout,
  vec3At,
  vendorCounter,
  type DecorProp,
  type FieldProp,
  type ItemProp,
  type MannequinProp,
  type NpcProp,
  type TemplateProp,
  type Vec3,
} from '../mallTemplates/mallTemplate.ts'

type ZoneProp = DecorProp | ItemProp | NpcProp | MannequinProp | FieldProp
export type BakedZoneProp = DecorProp | FieldProp
export type RuntimeZoneProp = Exclude<ZoneProp, BakedZoneProp>
const FIELD_KEYS = ['id', 'kind', 'crop', 'position', 'yaw', 'scale', 'size', 'pattern', 'plants']
const MIN_FIELD_SIDE = 1
const MAX_FIELD_SIDE = 60
const PLANT_TOLERANCE = 1e-3

export interface ZoneDecor {
  version: 1
  zone: string
  name: string
  props: ZoneProp[]
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

function sideAt(value: unknown, path: string): number {
  const side = numberAt(value, path)
  if (side < MIN_FIELD_SIDE || side > MAX_FIELD_SIDE) throw new TemplateError(path, `expected ${MIN_FIELD_SIDE} to ${MAX_FIELD_SIDE} m`)
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

function zonePropAt(raw: unknown, path: string, crops: CropTable | null): ZoneProp {
  if ((raw as { kind?: unknown } | null)?.kind === 'field') return fieldPropAt(raw, path, crops)
  const prop = propAt(raw, path)
  if (prop.kind === 'light') throw new TemplateError(`${path}.kind`, 'zones are lit by the sky, they take no light')
  if (prop.kind === 'decor' && prop.materials) throw new TemplateError(`${path}.materials`, 'baked zone decor keeps its own materials')
  return prop
}

export function parseZoneDecor(raw: unknown, zone: { key: string; bounds: WorldBounds }, crops: CropTable | null): ZoneDecor {
  const json = objectAt(raw, 'zone', ['version', 'zone', 'name', 'props'])
  if (json.version !== 1) throw new TemplateError('zone.version', 'expected 1')
  if (json.zone !== zone.key) throw new TemplateError('zone.zone', `expected ${zone.key}`)
  if (typeof json.name !== 'string' || json.name.trim() === '') throw new TemplateError('zone.name', 'expected a non-empty string')
  if (!Array.isArray(json.props)) throw new TemplateError('zone.props', 'expected an array')
  const props = json.props.map((p, i) => zonePropAt(p, `zone.props[${i}]`, crops))
  const ids = new Set<string>()
  props.forEach((p, i) => {
    if (ids.has(p.id)) throw new TemplateError(`zone.props[${i}].id`, `"${p.id}" is used twice`)
    ids.add(p.id)
    if (!insideBounds(p.position, zone.bounds)) throw new TemplateError(`zone.props[${i}].position`, `outside zone ${zone.key}`)
    if (p.kind === 'field' && fieldCorners(p).some(([x, z]) => !insideBounds([x, 0, z], zone.bounds))) throw new TemplateError(`zone.props[${i}].size`, `the field reaches outside zone ${zone.key}`)
    if (p.kind !== 'npc' || !p.vendor) return
    if (p.pose !== 'idle' || p.scale.some((s) => s !== 1)) throw new TemplateError(`zone.props[${i}]`, 'the cashier stands (pose idle) at scale 1')
    if (!insideBounds(vendorCounter(p), zone.bounds)) throw new TemplateError(`zone.props[${i}]`, `the counter in front of the cashier is outside zone ${zone.key}`)
  })
  if (props.filter((p) => p.kind === 'npc' && p.vendor).length > 1) throw new TemplateError('zone.props', 'only one NPC can be the cashier')
  return { version: 1, zone: zone.key, name: json.name, props }
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
  return decor.props.filter((p): p is BakedZoneProp => p.kind === 'decor' || p.kind === 'field')
}

export function runtimeProps(decor: ZoneDecor): RuntimeZoneProp[] {
  return decor.props.filter((p): p is RuntimeZoneProp => p.kind !== 'decor' && p.kind !== 'field')
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

export function zoneStoreLayout(decor: ZoneDecor, bounds: WorldBounds, modelSizes: ReadonlyMap<string, Vec3>): StoreLayout {
  const layout = templateStoreLayout({ version: 1, key: decor.zone, name: decor.name, preset: { width: 0, depth: 0 }, props: decor.props }, modelSizes)
  return { ...layout, bounds: { ...bounds } }
}
