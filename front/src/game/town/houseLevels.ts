export interface LevelRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface HouseLevel {
  id: string
  y: number
  height: number
  rects: LevelRect[]
}

type StairRise = '-z' | '+z' | '-x' | '+x'

interface HouseStair extends LevelRect {
  name: string
  y0: number
  y1: number
  rise: StairRise
}

export interface HouseLayout {
  version: number
  key: string
  levels: HouseLevel[]
  stairs: HouseStair[]
}

export const STEP_UP = 1

const STAIR_RISES: readonly string[] = ['-z', '+z', '-x', '+x']

export function singleLevelLayout(key: string, bounds: LevelRect, height: number): HouseLayout {
  const { minX, maxX, minZ, maxZ } = bounds
  return { version: 1, key, levels: [{ id: 'L0', y: 0, height, rects: [{ minX, maxX, minZ, maxZ }] }], stairs: [] }
}

function finite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`House layout: invalid ${what} ${JSON.stringify(value)}`)
  return value
}

function parseRect(raw: Record<string, unknown>, what: string): LevelRect {
  const rect = {
    minX: finite(raw.minX, `${what}.minX`),
    maxX: finite(raw.maxX, `${what}.maxX`),
    minZ: finite(raw.minZ, `${what}.minZ`),
    maxZ: finite(raw.maxZ, `${what}.maxZ`),
  }
  if (rect.minX > rect.maxX || rect.minZ > rect.maxZ) throw new Error(`House layout: ${what} is inverted`)
  return rect
}

export function parseHouseLayout(raw: unknown, key: string): HouseLayout {
  const data = raw as { version?: unknown; levels?: unknown; stairs?: unknown } | null
  if (!Array.isArray(data?.levels) || data.levels.length === 0) throw new Error(`House layout ${key}: no levels`)
  const levels = data.levels.map((level: Record<string, unknown>, i): HouseLevel => {
    if (!Array.isArray(level.rects) || level.rects.length === 0) throw new Error(`House layout ${key}: level ${i} has no rects`)
    return {
      id: String(level.id ?? `L${i}`),
      y: finite(level.y, `levels[${i}].y`),
      height: finite(level.height, `levels[${i}].height`),
      rects: level.rects.map((rect: Record<string, unknown>, j) => parseRect(rect, `levels[${i}].rects[${j}]`)),
    }
  })
  const stairs = (Array.isArray(data.stairs) ? data.stairs : []).map((stair: Record<string, unknown>, i): HouseStair => {
    if (typeof stair.rise !== 'string' || !STAIR_RISES.includes(stair.rise)) {
      throw new Error(`House layout ${key}: stairs[${i}] has an invalid rise ${JSON.stringify(stair.rise)}`)
    }
    return {
      ...parseRect(stair, `stairs[${i}]`),
      name: String(stair.name ?? `Stair_${i}`),
      y0: finite(stair.y0, `stairs[${i}].y0`),
      y1: finite(stair.y1, `stairs[${i}].y1`),
      rise: stair.rise as StairRise,
    }
  })
  return { version: finite(data.version, 'version'), key, levels, stairs }
}

function contains(rect: LevelRect, x: number, z: number): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ
}

function stairHeightAt(stair: HouseStair, x: number, z: number): number {
  const along = {
    '+x': (x - stair.minX) / (stair.maxX - stair.minX),
    '-x': (stair.maxX - x) / (stair.maxX - stair.minX),
    '+z': (z - stair.minZ) / (stair.maxZ - stair.minZ),
    '-z': (stair.maxZ - z) / (stair.maxZ - stair.minZ),
  }[stair.rise]
  const t = Math.max(0, Math.min(1, along))
  return stair.y0 + (stair.y1 - stair.y0) * t
}

export function surfaceHeight(layout: HouseLayout, x: number, z: number, feetY: number): number | null {
  const candidates = [
    ...layout.levels.filter((level) => level.rects.some((rect) => contains(rect, x, z))).map((level) => level.y),
    ...layout.stairs.filter((stair) => contains(stair, x, z)).map((stair) => stairHeightAt(stair, x, z)),
  ]
  if (candidates.length === 0) return null
  const reachable = candidates.filter((y) => y <= feetY + STEP_UP)
  return reachable.length > 0 ? Math.max(...reachable) : Math.min(...candidates)
}

export function levelAt(layout: HouseLayout, x: number, z: number, y: number, tolerance: number): HouseLevel | null {
  let found: HouseLevel | null = null
  for (const level of layout.levels) {
    if (level.y > y + tolerance || !level.rects.some((rect) => contains(rect, x, z))) continue
    if (!found || level.y > found.y) found = level
  }
  return found
}
