import type { Json } from './backend.ts'
import type { Bounds, Vec3 } from './types.ts'

const WORLD_MANIFEST_URL = process.env.WORLD_MANIFEST_URL
const FETCH_ATTEMPTS = 30
const RETRY_DELAY_MS = 2000

export interface WorldHouse {
  position: Vec3
  rotationY: number
  interiorOffset: Vec3
}

export interface ClinicBed {
  id: string
  position: Vec3
  bed: Vec3
  yaw: number
}

export interface WorldClinic {
  nurse: Vec3
  pharmacy: Vec3
  beds: ClinicBed[]
}

interface World {
  citySpawn: Vec3
  workDoors: Map<string, { x: number, z: number }>
  houses: Map<string, WorldHouse>
  fountains: Vec3[]
  bounds: Bounds
  clinic: WorldClinic | null
}

let world: World | null = null

function parseVec3(raw: Json, what: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(Number.isFinite)) {
    throw new Error(`world manifest: invalid ${what} ${JSON.stringify(raw)}`)
  }
  return { x: raw[0], y: raw[1], z: raw[2] }
}

function parseClinic(raw: Json): WorldClinic | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw?.beds) || raw.beds.length === 0) throw new Error('world manifest: clinic has no beds')
  return {
    nurse: parseVec3(raw.nurse, 'clinic nurse'),
    pharmacy: parseVec3(raw.pharmacy, 'clinic pharmacy'),
    beds: raw.beds.map((bed: Json, i: number): ClinicBed => {
      if (typeof bed?.id !== 'string' || !Number.isFinite(bed.yaw)) {
        throw new Error(`world manifest: invalid clinic bed ${i} ${JSON.stringify(bed)}`)
      }
      return {
        id: bed.id,
        position: parseVec3(bed.position, `position of clinic bed ${bed.id}`),
        bed: parseVec3(bed.bed, `bed of clinic bed ${bed.id}`),
        yaw: bed.yaw
      }
    })
  }
}

function parseWorld(manifest: Json): World {
  if (!Array.isArray(manifest?.zones)) throw new Error('world manifest: missing zones')
  const workDoors: World['workDoors'] = new Map()
  const houses: World['houses'] = new Map()
  const fountains = (manifest.fountains ?? []).map((raw: Json, i: number) => parseVec3(raw, `fountain ${i}`))
  for (const zone of manifest.zones) {
    for (const building of zone.buildings ?? []) {
      if (building.kind === 'house' && building.interiorOffset) {
        houses.set(building.key, {
          position: parseVec3(building.position, `position of ${building.key}`),
          rotationY: building.rotationY,
          interiorOffset: parseVec3(building.interiorOffset, `interiorOffset of ${building.key}`)
        })
      }
      if (building.kind !== 'work' && building.kind !== 'store') continue
      const door = parseVec3(building.door, `door of ${building.key}`)
      workDoors.set(building.key, { x: door.x, z: door.z })
    }
  }
  const b = manifest.bounds
  if (![b?.minX, b?.maxX, b?.minZ, b?.maxZ].every(Number.isFinite)) throw new Error('world manifest: invalid bounds')
  return {
    citySpawn: parseVec3(manifest.spawn, 'spawn'),
    workDoors,
    houses,
    fountains,
    bounds: b,
    clinic: parseClinic(manifest.clinic)
  }
}

export async function loadWorld(): Promise<void> {
  if (!WORLD_MANIFEST_URL) throw new Error('WORLD_MANIFEST_URL is not set')
  let lastError: unknown = null
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(WORLD_MANIFEST_URL)
      if (!res.ok) throw new Error(`${WORLD_MANIFEST_URL} answered ${res.status}`)
      const loaded = parseWorld(await res.json())
      world = loaded
      console.log(`[world] manifest loaded from ${WORLD_MANIFEST_URL}: ${loaded.workDoors.size} public buildings, ${loaded.houses.size} houses`)
      return
    } catch (error) {
      lastError = error
      console.warn(`[world] manifest fetch ${attempt}/${FETCH_ATTEMPTS} failed: ${error instanceof Error ? error.message : error}`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw lastError
}

function loadedWorld(): World {
  if (!world) throw new Error('world manifest not loaded')
  return world
}

export function citySpawn(): Vec3 {
  return loadedWorld().citySpawn
}

export function workDoor(workKey: string): { x: number, z: number } | null {
  return loadedWorld().workDoors.get(workKey) ?? null
}

export function worldBounds(): Bounds {
  return loadedWorld().bounds
}

export function worldFountains(): Vec3[] {
  return loadedWorld().fountains
}

export function worldHouse(houseKey: string): WorldHouse | null {
  return loadedWorld().houses.get(houseKey) ?? null
}

export function worldClinic(): WorldClinic | null {
  return loadedWorld().clinic
}
