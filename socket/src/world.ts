import { readFile } from 'node:fs/promises'
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

export interface PubSeat {
  id: string
  kind: string
  position: Vec3
  yaw: number
}

export interface PubBasement extends Bounds {
  /** Feet height of the basement floor. */
  floorY: number
}

export interface WorldPub {
  bartender: Vec3
  bartenderYaw: number
  bouncer: Vec3
  counter: Vec3
  taps: Vec3
  serve: Vec3
  bell: Vec3
  secretDoor: { position: Vec3, yaw: number }
  /** XZ box of the stair enclosure behind the cellar door, ground floor (any y counts as inside). */
  secretRoom: Bounds
  /** The hidden lounge below the bar, in world coords; null on manifests without a basement. */
  basement: PubBasement | null
  seats: Map<string, PubSeat>
  darts: { board: Vec3, boardYaw: number, oche: Vec3 }
  shots: { plank: Vec3, yaw: number, player: Vec3 }
}

interface World {
  citySpawn: Vec3
  workDoors: Map<string, { x: number, z: number }>
  houses: Map<string, WorldHouse>
  fountains: Vec3[]
  bounds: Bounds
  clinic: WorldClinic | null
  pub: WorldPub | null
  pubZone: Bounds | null
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

function parseYaw(raw: Json, what: string): number {
  if (!Number.isFinite(raw)) throw new Error(`world manifest: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

function parseBounds(raw: Json, what: string): Bounds {
  if (![raw?.minX, raw?.maxX, raw?.minZ, raw?.maxZ].every(Number.isFinite)) {
    throw new Error(`world manifest: invalid ${what} ${JSON.stringify(raw)}`)
  }
  return { minX: raw.minX, maxX: raw.maxX, minZ: raw.minZ, maxZ: raw.maxZ }
}

function parseBasement(raw: Json): PubBasement | null {
  if (raw === undefined || raw === null) return null
  if (!Number.isFinite(raw?.floorY)) throw new Error(`world manifest: invalid pub basement floorY ${JSON.stringify(raw)}`)
  return { ...parseBounds(raw, 'pub basement'), floorY: raw.floorY }
}

function parsePub(raw: Json): WorldPub | null {
  if (raw === undefined || raw === null) return null
  if (!Array.isArray(raw?.seats) || raw.seats.length === 0) throw new Error('world manifest: pub has no seats')
  const seats = new Map<string, PubSeat>()
  raw.seats.forEach((seat: Json, i: number) => {
    if (typeof seat?.id !== 'string' || typeof seat?.kind !== 'string') {
      throw new Error(`world manifest: invalid pub seat ${i} ${JSON.stringify(seat)}`)
    }
    seats.set(seat.id, {
      id: seat.id,
      kind: seat.kind,
      position: parseVec3(seat.position, `position of pub seat ${seat.id}`),
      yaw: parseYaw(seat.yaw, `yaw of pub seat ${seat.id}`)
    })
  })
  return {
    bartender: parseVec3(raw.bartender, 'pub bartender'),
    bartenderYaw: parseYaw(raw.bartenderYaw, 'pub bartenderYaw'),
    bouncer: parseVec3(raw.bouncer, 'pub bouncer'),
    counter: parseVec3(raw.counter, 'pub counter'),
    taps: parseVec3(raw.taps, 'pub taps'),
    serve: parseVec3(raw.serve, 'pub serve'),
    bell: parseVec3(raw.bell, 'pub bell'),
    secretDoor: {
      position: parseVec3(raw.secretDoor?.position, 'pub secretDoor position'),
      yaw: parseYaw(raw.secretDoor?.yaw, 'pub secretDoor yaw')
    },
    secretRoom: parseBounds(raw.secretRoom, 'pub secretRoom'),
    basement: parseBasement(raw.basement),
    seats,
    darts: {
      board: parseVec3(raw.darts?.board, 'pub darts board'),
      boardYaw: parseYaw(raw.darts?.boardYaw, 'pub darts boardYaw'),
      oche: parseVec3(raw.darts?.oche, 'pub darts oche')
    },
    shots: {
      plank: parseVec3(raw.shots?.plank, 'pub shots plank'),
      yaw: parseYaw(raw.shots?.yaw, 'pub shots yaw'),
      player: parseVec3(raw.shots?.player, 'pub shots player')
    }
  }
}

function parsePubZone(zones: Json[], pub: WorldPub | null): Bounds | null {
  const zone = zones.find((z) => z?.key === 'pub')
  if (!zone) {
    if (pub) throw new Error('world manifest: pub section without a pub zone')
    return null
  }
  return parseBounds(zone.bounds, 'pub zone bounds')
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
  const pub = parsePub(manifest.pub)
  return {
    citySpawn: parseVec3(manifest.spawn, 'spawn'),
    workDoors,
    houses,
    fountains,
    bounds: b,
    clinic: parseClinic(manifest.clinic),
    pub,
    pubZone: parsePubZone(manifest.zones, pub)
  }
}

// An http(s) URL in dev (the front serves it), a file path in the production image.
async function readManifest(source: string): Promise<Json> {
  if (!/^https?:\/\//.test(source)) return JSON.parse(await readFile(source, 'utf8'))
  const res = await fetch(source)
  if (!res.ok) throw new Error(`${source} answered ${res.status}`)
  return res.json()
}

export async function loadWorld(): Promise<void> {
  if (!WORLD_MANIFEST_URL) throw new Error('WORLD_MANIFEST_URL is not set')
  let lastError: unknown = null
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const loaded = parseWorld(await readManifest(WORLD_MANIFEST_URL))
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

export function worldPub(): WorldPub | null {
  return loadedWorld().pub
}

export function worldPubZone(): Bounds | null {
  return loadedWorld().pubZone
}
