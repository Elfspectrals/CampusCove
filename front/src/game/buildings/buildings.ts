import { BUILDING_PARTS, BUILDING_SIDES, TEMPLATE_KEY, TemplateError, type BuildingOpening, type BuildingPart, type BuildingProp } from '../mallTemplates/mallTemplate.ts'

export const BUILDINGS_URL = '/assets/buildings/buildings.json'
export const MAX_BUILDING_SIDE = 30
export const MAX_BUILDING_HEIGHT = 8
export const MIN_ROOF = 0.5
export const MAX_ROOF = 6
export const ROOF_OVERHANG = 0.3
const MIN_OPENING = 0.6
const CORNER_MARGIN = 0.1
const OPENING_GAP = 0.2
const HEAD_ROOM = 0.3
const MIN_DOOR_TOP = 1.9
const MIN_WINDOW_SILL = 0.3
const HEX = /^#[0-9a-f]{6}$/i

export type BuildingDefaults = Pick<BuildingProp, 'size' | 'height' | 'roof' | 'ridge' | 'openings' | 'colors'>

export interface BuildingDef {
  key: string
  label: string
  thick: number
  minSize: [number, number]
  minHeight: number
  slidingDoors: boolean
  defaults: BuildingDefaults
}

export type BuildingTable = Readonly<Record<string, BuildingDef>>

function positive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TemplateError(path, 'expected a number above 0')
  return value
}

export function parseBuildings(raw: unknown): BuildingTable {
  const json = raw as { version?: unknown; buildings?: unknown }
  if (json?.version !== 1) throw new TemplateError('buildings.version', 'expected 1')
  if (typeof json.buildings !== 'object' || json.buildings === null) throw new TemplateError('buildings.buildings', 'expected an object')
  return Object.fromEntries(
    Object.entries(json.buildings as Record<string, Record<string, unknown>>).map(([key, def]) => {
      const path = `buildings.buildings.${key}`
      const minSize = def.minSize as unknown[]
      if (typeof def.label !== 'string' || !Array.isArray(minSize) || minSize.length !== 2) throw new TemplateError(path, 'expected a label and minSize [width, depth]')
      if (typeof def.slidingDoors !== 'boolean') throw new TemplateError(`${path}.slidingDoors`, 'expected true or false')
      return [key, {
        key,
        label: def.label,
        thick: positive(def.thick, `${path}.thick`),
        minSize: [positive(minSize[0], `${path}.minSize[0]`), positive(minSize[1], `${path}.minSize[1]`)],
        minHeight: positive(def.minHeight, `${path}.minHeight`),
        slidingDoors: def.slidingDoors,
        defaults: def.defaults as BuildingDefaults,
      }]
    }),
  )
}

export function sideLength(building: Pick<BuildingProp, 'size'>, side: BuildingOpening['side']): number {
  return side === 'front' || side === 'back' ? building.size[0] : building.size[1]
}

export function checkBuilding(building: BuildingProp, def: BuildingDef, path: string): void {
  const [width, depth] = building.size
  if (width < def.minSize[0] || depth < def.minSize[1] || width > MAX_BUILDING_SIDE || depth > MAX_BUILDING_SIDE) {
    throw new TemplateError(`${path}.size`, `a ${def.label.toLowerCase()} is ${def.minSize[0]} × ${def.minSize[1]} m to ${MAX_BUILDING_SIDE} × ${MAX_BUILDING_SIDE} m`)
  }
  if (building.height < def.minHeight || building.height > MAX_BUILDING_HEIGHT) throw new TemplateError(`${path}.height`, `expected ${def.minHeight} to ${MAX_BUILDING_HEIGHT} m`)
  if (!building.openings.some((o) => o.type === 'door')) throw new TemplateError(`${path}.openings`, 'a building has at least one door')
  const reach = (o: BuildingOpening) => (o.type === 'door' && def.slidingDoors ? o.width : o.width / 2)
  building.openings.forEach((o, i) => {
    const at = `${path}.openings[${i}]`
    const room = sideLength(building, o.side) / 2 - def.thick - CORNER_MARGIN
    if (o.width < MIN_OPENING) throw new TemplateError(`${at}.width`, `an opening is at least ${MIN_OPENING} m wide`)
    if (Math.abs(o.offset) + reach(o) > room) throw new TemplateError(`${at}.offset`, `reaches past the corner of the ${o.side} wall${o.type === 'door' && def.slidingDoors ? ' with its sliding leaves' : ''}`)
    if (o.top > building.height - HEAD_ROOM) throw new TemplateError(`${at}.top`, `stays ${HEAD_ROOM} m under the top of the wall (${building.height} m)`)
    if (o.type === 'door' && (o.bottom !== 0 || o.top < MIN_DOOR_TOP)) throw new TemplateError(`${at}`, `a door starts on the floor and is at least ${MIN_DOOR_TOP} m high`)
    if (o.type === 'window' && (o.bottom < MIN_WINDOW_SILL || o.top - o.bottom < HEAD_ROOM)) throw new TemplateError(`${at}`, `a window sits ${MIN_WINDOW_SILL} m above the floor and is at least ${HEAD_ROOM} m high`)
    const clash = building.openings.findIndex((p, k) => k !== i && p.side === o.side && Math.abs(p.offset - o.offset) < reach(p) + reach(o) + OPENING_GAP)
    if (clash !== -1) throw new TemplateError(`${at}.offset`, `too close to openings[${clash}] on the ${o.side} wall`)
  })
}

export function openingAt(raw: unknown, path: string): BuildingOpening {
  const json = raw as Record<string, unknown>
  if (typeof json !== 'object' || json === null) throw new TemplateError(path, 'expected an object')
  const unknownKey = Object.keys(json).find((k) => !['type', 'side', 'offset', 'width', 'bottom', 'top'].includes(k))
  if (unknownKey) throw new TemplateError(`${path}.${unknownKey}`, 'unknown field')
  if (json.type !== 'door' && json.type !== 'window') throw new TemplateError(`${path}.type`, 'expected door or window')
  if (!BUILDING_SIDES.includes(json.side as BuildingOpening['side'])) throw new TemplateError(`${path}.side`, `expected one of ${BUILDING_SIDES.join(', ')}`)
  const num = (key: string) => {
    const v = json[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new TemplateError(`${path}.${key}`, 'expected a number')
    return v
  }
  return { type: json.type, side: json.side as BuildingOpening['side'], offset: num('offset'), width: num('width'), bottom: num('bottom'), top: num('top') }
}

export function colorsAt(raw: unknown, path: string): BuildingProp['colors'] {
  const json = raw as Record<string, unknown>
  if (typeof json !== 'object' || json === null) throw new TemplateError(path, 'expected an object')
  const keys = Object.keys(json)
  if (keys.length !== BUILDING_PARTS.length || !BUILDING_PARTS.every((part) => typeof json[part] === 'string' && HEX.test(json[part] as string))) {
    throw new TemplateError(path, `expected a #rrggbb colour for each of ${BUILDING_PARTS.join(', ')}`)
  }
  return Object.fromEntries(BUILDING_PARTS.map((part) => [part, json[part] as string])) as BuildingProp['colors']
}

export function texturesAt(raw: unknown, path: string): BuildingProp['textures'] {
  const json = raw as Record<string, unknown>
  if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new TemplateError(path, 'expected an object')
  return Object.fromEntries(Object.entries(json).map(([part, key]) => {
    if (!BUILDING_PARTS.includes(part as BuildingPart)) throw new TemplateError(`${path}.${part}`, `expected one of ${BUILDING_PARTS.join(', ')}`)
    if (typeof key !== 'string' || !TEMPLATE_KEY.test(key)) throw new TemplateError(`${path}.${part}`, `texture keys look like ${TEMPLATE_KEY}`)
    return [part, key]
  }))
}

export function buildingPreviewKey(building: BuildingProp): string {
  const { building: key, size, height, roof, ridge, openings, colors, textures } = building
  const text = JSON.stringify([key, size, height, roof, ridge, openings, colors, textures ?? {}])
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return `${key}_${(h >>> 0).toString(16).padStart(8, '0')}`
}
