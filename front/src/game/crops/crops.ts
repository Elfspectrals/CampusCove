import { TemplateError, type FieldProp, type Vec3 } from '../mallTemplates/mallTemplate.ts'

export type FieldPattern = FieldProp['pattern']
export const FIELD_PATTERNS: readonly FieldPattern[] = ['rows', 'staggered', 'scattered']
export const CROPS_URL = '/assets/crops/crops.json'
export const MAX_FIELD_PLANTS = 800
const SCATTER = 0.35
const EPS = 1e-6

export interface CropDef {
  key: string
  label: string
  item: string
  plant: string
  spacing: number
  rowGap: number
}

export type CropTable = Readonly<Record<string, CropDef>>

export interface FieldShape {
  id: string
  position: Vec3
  yaw: number
  size: [number, number]
  pattern: FieldPattern
}

export type PlantSpot = [x: number, y: number, z: number, yaw: number]

function positive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TemplateError(path, 'expected a number above 0')
  return value
}

function text(value: unknown, path: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || value === '' || (pattern && !pattern.test(value))) throw new TemplateError(path, `expected a string${pattern ? ` matching ${pattern}` : ''}`)
  return value
}

export function parseCrops(raw: unknown): CropTable {
  const json = raw as { version?: unknown; crops?: unknown }
  if (json?.version !== 1) throw new TemplateError('crops.version', 'expected 1')
  if (typeof json.crops !== 'object' || json.crops === null) throw new TemplateError('crops.crops', 'expected an object')
  return Object.fromEntries(
    Object.entries(json.crops as Record<string, Record<string, unknown>>).map(([key, def]) => {
      const path = `crops.crops.${key}`
      return [key, {
        key: text(key, path, /^[a-z0-9_]+$/),
        label: text(def.label, `${path}.label`),
        item: text(def.item, `${path}.item`, /^farm_[a-z0-9_]+$/),
        plant: text(def.plant, `${path}.plant`, /^items\/farm\/[a-z0-9_]+\/model\.glb$/),
        spacing: positive(def.spacing, `${path}.spacing`),
        rowGap: positive(def.rowGap, `${path}.rowGap`),
      }]
    }),
  )
}

function seededRandom(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  let state = h >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function steps(length: number, step: number): number[] {
  const count = Math.max(1, Math.floor(length / step + EPS))
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step)
}

function round3(value: number): number {
  return Number(value.toFixed(3))
}

export function fieldPlantsLocal(field: Pick<FieldShape, 'id' | 'size' | 'pattern'>, crop: CropDef): PlantSpot[] {
  const [width, depth] = field.size
  const random = seededRandom(field.id)
  const zs = steps(depth, crop.spacing)
  const spots: PlantSpot[] = []
  steps(width, crop.rowGap).forEach((x, column) => {
    const shift = field.pattern === 'staggered' && column % 2 === 1 ? crop.spacing / 2 : 0
    for (const z of zs) {
      if (z + shift > depth / 2 + EPS) continue
      const jitterX = field.pattern === 'scattered' ? (random() * 2 - 1) * SCATTER * crop.rowGap : 0
      const jitterZ = field.pattern === 'scattered' ? (random() * 2 - 1) * SCATTER * crop.spacing : 0
      spots.push([round3(x + jitterX), 0, round3(z + shift + jitterZ), round3(random() * 2 * Math.PI)])
    }
  })
  return spots
}

export function fieldPlants(field: FieldShape, crop: CropDef): PlantSpot[] {
  const [cx, cy, cz] = field.position
  const cos = Math.cos(field.yaw)
  const sin = Math.sin(field.yaw)
  return fieldPlantsLocal(field, crop).map(([x, , z, yaw]) => [round3(cx + x * cos + z * sin), cy, round3(cz - x * sin + z * cos), round3(field.yaw + yaw)])
}

export function fieldCorners(field: Pick<FieldShape, 'position' | 'yaw' | 'size'>): Array<[number, number]> {
  const [cx, , cz] = field.position
  const [hw, hd] = [field.size[0] / 2, field.size[1] / 2]
  const cos = Math.cos(field.yaw)
  const sin = Math.sin(field.yaw)
  return ([[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const).map(([x, z]) => [cx + x * cos + z * sin, cz - x * sin + z * cos])
}
