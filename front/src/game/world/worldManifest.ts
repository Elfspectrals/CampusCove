import type { HouseKey, WorkJob, WorkKey } from '../assets/catalog'

type Vec3 = [number, number, number]

interface WorldBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface HouseBuilding {
  kind: 'house'
  key: HouseKey
  name: string
  position: Vec3
  rotationY: number
  door: Vec3
  offer: 'buy' | 'rent'
  price: number
  interiorOffset?: Vec3
}

export interface WorkBuilding {
  kind: 'work'
  key: WorkKey
  name: string
  job: WorkJob
  position: Vec3
  rotationY: number
  door: Vec3
  footprint: [number, number]
  interiorOffset?: Vec3
}

export interface StoreBuilding {
  kind: 'store'
  key: 'cove_home'
  name: string
  position: Vec3
  rotationY: number
  door: Vec3
  footprint: [number, number]
  interiorOffset?: Vec3
}

type Building = HouseBuilding | WorkBuilding | StoreBuilding

export interface FishingSpot {
  id: string
  kind: 'jetty' | 'bank' | 'mare'
  position: Vec3
  yaw: number
  radius: number
  lookAt: Vec3
}

export interface WorldZone {
  key: string
  bounds: WorldBounds
  modelUrl: string
  optional?: boolean
  collisionUrl?: string
  heightmapUrl?: string
  animatedWater?: boolean
  buildings?: Building[]
  fishingSpots?: FishingSpot[]
}

interface ClinicBed {
  id: string
  position: Vec3
  bed: Vec3
  yaw: number
}

interface ClinicLayout {
  nurse: Vec3
  pharmacy: Vec3
  beds: ClinicBed[]
}

export interface WorldManifest {
  version: number
  spawn: Vec3
  spawnYaw: number
  bounds: WorldBounds
  zones: WorldZone[]
  /** Free drinking fountains ([x, 0, z], put on the terrain), written by scripts/apply-fountains.mjs. */
  fountains?: Vec3[]
  clinic?: ClinicLayout
}

const WORLD_MANIFEST_URL = '/assets/world.manifest.json'

export async function fetchWorldManifest(): Promise<WorldManifest> {
  const res = await fetch(WORLD_MANIFEST_URL)
  if (!res.ok) throw new Error(`Could not load the world manifest (${res.status})`)
  return (await res.json()) as WorldManifest
}

function buildings(manifest: WorldManifest): Building[] {
  return manifest.zones.flatMap((zone) => zone.buildings ?? [])
}

export function houseBuildings(manifest: WorldManifest): HouseBuilding[] {
  return buildings(manifest).filter((b): b is HouseBuilding => b.kind === 'house')
}

export function workBuildings(manifest: WorldManifest): WorkBuilding[] {
  return buildings(manifest).filter((b): b is WorkBuilding => b.kind === 'work')
}

export function storeBuildings(manifest: WorldManifest): StoreBuilding[] {
  return buildings(manifest).filter((b): b is StoreBuilding => b.kind === 'store')
}

export function fishingSpots(manifest: WorldManifest): FishingSpot[] {
  return manifest.zones.flatMap((zone) => zone.fishingSpots ?? [])
}
