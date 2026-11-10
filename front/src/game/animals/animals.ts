import { seededRandom } from '../crops/crops.ts'
import { TemplateError, type AnimalProp } from '../mallTemplates/mallTemplate.ts'

export const ANIMALS_URL = '/assets/animals/animals.json'
export const ANIMAL_CLIPS = ['idle', 'walk', 'graze'] as const
export type AnimalClip = (typeof ANIMAL_CLIPS)[number]
export const MIN_PEN_SIDE = 1
export const MAX_PEN_SIDE = 30
const PEN_MARGIN = 0.4
const TURN_S = 0.5
const GRAZE_CHANCE = 0.6
const ANIMAL_DEF_KEYS = ['label', 'speed', 'rest']

export interface AnimalDef {
  key: string
  label: string
  speed: number
  rest: number
}

export type AnimalTable = Readonly<Record<string, AnimalDef>>

export interface AnimalPose {
  x: number
  z: number
  yaw: number
  clip: AnimalClip
}

type Pen = Pick<AnimalProp, 'id' | 'position' | 'yaw' | 'size'>

export function animalModelUrl(key: string): string {
  return `/assets/animals/${key}/model.glb`
}

function positive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new TemplateError(path, 'expected a number above 0')
  return value
}

export function parseAnimals(raw: unknown): AnimalTable {
  const json = raw as { version?: unknown; animals?: unknown }
  if (json?.version !== 1) throw new TemplateError('animals.version', 'expected 1')
  if (typeof json.animals !== 'object' || json.animals === null) throw new TemplateError('animals.animals', 'expected an object')
  return Object.fromEntries(
    Object.entries(json.animals as Record<string, Record<string, unknown>>).map(([key, def]) => {
      const path = `animals.animals.${key}`
      if (!/^[a-z0-9_]+$/.test(key)) throw new TemplateError(path, 'keys look like /^[a-z0-9_]+$/')
      if (typeof def !== 'object' || def === null || Array.isArray(def)) throw new TemplateError(path, 'expected an object')
      const unknownKey = Object.keys(def).find((k) => !ANIMAL_DEF_KEYS.includes(k))
      if (unknownKey) throw new TemplateError(`${path}.${unknownKey}`, `unknown field, expected one of ${ANIMAL_DEF_KEYS.join(', ')}`)
      if (typeof def.label !== 'string' || def.label === '') throw new TemplateError(`${path}.label`, 'expected a non-empty string')
      return [key, { key, label: def.label, speed: positive(def.speed, `${path}.speed`), rest: positive(def.rest, `${path}.rest`) }]
    }),
  )
}

function spot(pen: Pen, cycle: number): { x: number; z: number; graze: boolean } {
  const random = seededRandom(`${pen.id}#${cycle}`)
  const [width, depth] = pen.size
  return {
    x: (random() - 0.5) * Math.max(0, width - 2 * PEN_MARGIN),
    z: (random() - 0.5) * Math.max(0, depth - 2 * PEN_MARGIN),
    graze: random() < GRAZE_CHANCE,
  }
}

function heading(from: { x: number; z: number }, to: { x: number; z: number }): number | null {
  const dx = to.x - from.x
  const dz = to.z - from.z
  return Math.hypot(dx, dz) < 1e-6 ? null : Math.atan2(dx, dz)
}

function turned(from: number, to: number, f: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return from + delta * f
}

export function animalCycle(pen: Pick<AnimalProp, 'size'>, def: Pick<AnimalDef, 'speed' | 'rest'>): number {
  return def.rest + Math.hypot(pen.size[0], pen.size[1]) / def.speed
}

export function animalPose(pen: Pen, def: Pick<AnimalDef, 'speed' | 'rest'>, seconds: number): AnimalPose {
  const cycle = animalCycle(pen, def)
  const k = Math.floor(seconds / cycle)
  const into = seconds - k * cycle
  const before = spot(pen, k - 1)
  const from = spot(pen, k)
  const to = spot(pen, k + 1)
  const previous = heading(before, from) ?? 0
  const next = heading(from, to)
  const walk = Math.hypot(to.x - from.x, to.z - from.z) / def.speed
  let local: AnimalPose
  if (next !== null && into < walk) {
    const f = into / walk
    local = { x: from.x + (to.x - from.x) * f, z: from.z + (to.z - from.z) * f, yaw: turned(previous, next, Math.min(1, into / Math.min(TURN_S, walk))), clip: 'walk' }
  } else {
    local = { x: to.x, z: to.z, yaw: next ?? previous, clip: to.graze ? 'graze' : 'idle' }
  }
  const [cx, , cz] = pen.position
  const cos = Math.cos(pen.yaw)
  const sin = Math.sin(pen.yaw)
  return { x: cx + local.x * cos + local.z * sin, z: cz - local.x * sin + local.z * cos, yaw: pen.yaw + local.yaw, clip: local.clip }
}
