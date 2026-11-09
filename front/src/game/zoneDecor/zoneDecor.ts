import type { StoreLayout } from '../assets/catalog.ts'
import type { WorldBounds } from '../world/worldManifest.ts'
import {
  TEMPLATE_KEY,
  TemplateError,
  propAt,
  templateStoreLayout,
  vendorCounter,
  type DecorProp,
  type ItemProp,
  type MannequinProp,
  type NpcProp,
  type Vec3,
} from '../mallTemplates/mallTemplate.ts'

type ZoneProp = DecorProp | ItemProp | NpcProp | MannequinProp
export type RuntimeZoneProp = Exclude<ZoneProp, DecorProp>

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

function zonePropAt(raw: unknown, path: string): ZoneProp {
  const prop = propAt(raw, path)
  if (prop.kind === 'light') throw new TemplateError(`${path}.kind`, 'zones are lit by the sky, they take no light')
  if (prop.kind === 'decor' && prop.materials) throw new TemplateError(`${path}.materials`, 'baked zone decor keeps its own materials')
  return prop
}

export function parseZoneDecor(raw: unknown, zone: { key: string; bounds: WorldBounds }): ZoneDecor {
  const json = objectAt(raw, 'zone', ['version', 'zone', 'name', 'props'])
  if (json.version !== 1) throw new TemplateError('zone.version', 'expected 1')
  if (json.zone !== zone.key) throw new TemplateError('zone.zone', `expected ${zone.key}`)
  if (typeof json.name !== 'string' || json.name.trim() === '') throw new TemplateError('zone.name', 'expected a non-empty string')
  if (!Array.isArray(json.props)) throw new TemplateError('zone.props', 'expected an array')
  const props = json.props.map((p, i) => zonePropAt(p, `zone.props[${i}]`))
  const ids = new Set<string>()
  props.forEach((p, i) => {
    if (ids.has(p.id)) throw new TemplateError(`zone.props[${i}].id`, `"${p.id}" is used twice`)
    ids.add(p.id)
    if (!insideBounds(p.position, zone.bounds)) throw new TemplateError(`zone.props[${i}].position`, `outside zone ${zone.key}`)
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

export function bakedProps(decor: ZoneDecor): DecorProp[] {
  return decor.props.filter((p): p is DecorProp => p.kind === 'decor')
}

export function runtimeProps(decor: ZoneDecor): RuntimeZoneProp[] {
  return decor.props.filter((p): p is RuntimeZoneProp => p.kind !== 'decor')
}

export function zoneStoreLayout(decor: ZoneDecor, bounds: WorldBounds, modelSizes: ReadonlyMap<string, Vec3>): StoreLayout {
  const layout = templateStoreLayout({ version: 1, key: decor.zone, name: decor.name, preset: { width: 0, depth: 0 }, props: decor.props }, modelSizes)
  return { ...layout, bounds: { ...bounds } }
}
