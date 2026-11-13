import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Json } from './backend.ts'
import type { StorageUnit } from './storageSale.ts'
import type { Bounds, Vec3 } from './types.ts'

const WORLD_MANIFEST_URL = process.env.WORLD_MANIFEST_URL
const FETCH_ATTEMPTS = 30
const RETRY_DELAY_MS = 2000
/** Player positions carry the eye height (feet + 1.6), like the manifest spawn. */
const EYE_HEIGHT = 1.6

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
  quizmaster: Vec3
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

export interface WorldOrchard {
  trees: Vec3[]
}

export type Crop = 'corn' | 'potato' | 'cabbage' | 'pumpkin'

export interface WorldCropPlant extends Vec3 {
  crop: Crop
}

const CROPS: readonly Crop[] = ['corn', 'potato', 'cabbage', 'pumpkin']

/** A place an admin can teleport to from the watch: just outside a public building's door, facing it. */
export interface TeleportDestination {
  key: string
  name: string
  position: Vec3
  yaw: number
}

/** How far in front of the door an admin lands, so they never spawn inside the door frame. */
const DESTINATION_DOOR_GAP = 2.5

interface World {
  citySpawn: Vec3
  destinations: TeleportDestination[]
  workDoors: Map<string, { x: number, z: number }>
  houses: Map<string, WorldHouse>
  fountains: Vec3[]
  bounds: Bounds
  clinic: WorldClinic | null
  pub: WorldPub | null
  pubZone: Bounds | null
  orchard: WorldOrchard | null
  cropPlants: WorldCropPlant[]
  zoneBounds: Map<string, Bounds>
  storage: WorldStorage | null
}

export interface WorldStorage {
  auctioneer: Vec3
  units: StorageUnit[]
}

let world: World | null = null

export interface WorldBuyer {
  zone: string
  area: string
  x: number
  y: number
  z: number
}

let buyerZones = new Set<string>()
let shopBounds = new Map<string, Bounds>()
let atms: Vec3[] = []

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

function parseStorage(raw: Json): WorldStorage | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw?.units) || raw.units.length === 0) throw new Error('world manifest: storage has no units')
  return {
    auctioneer: parseVec3(raw.auctioneer, 'storage auctioneer'),
    units: raw.units.map((unit: Json, i: number): StorageUnit => {
      if (typeof unit?.id !== 'string' || typeof unit.door !== 'string') {
        throw new Error(`world manifest: invalid storage unit ${i} ${JSON.stringify(unit)}`)
      }
      return {
        id: unit.id,
        door: unit.door,
        threshold: parseVec3(unit.threshold, `threshold of storage unit ${unit.id}`),
        inside: parseVec3(unit.inside, `inside of storage unit ${unit.id}`)
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

function parseOrchard(raw: Json): WorldOrchard | null {
  if (raw === undefined || raw === null) return null
  if (!Array.isArray(raw.trees) || raw.trees.length === 0) throw new Error('world manifest: orchard has no trees')
  return {
    trees: raw.trees.map((tree: Json, i: number) => parseVec3(tree, `orchard tree ${i}`))
  }
}

function parseCropPlants(raw: Json): WorldCropPlant[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new Error('world manifest: crops is not a list')
  return raw.map((plant: Json, i: number) => {
    if (!CROPS.includes(plant?.crop)) throw new Error(`world manifest: crop plant ${i} grows unknown crop ${JSON.stringify(plant?.crop)}`)
    return { ...parseVec3(plant.position, `crop plant ${i}`), crop: plant.crop }
  })
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
    quizmaster: parseVec3(raw.quizmaster, 'pub quizmaster'),
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

/** Steps out of the building through its door; yaw makes the camera (forward = -sin, -cos) look back at the door. */
export function zoneGateDestination(key: string, name: string, gate: { x: number, z: number }, bounds: Bounds): TeleportDestination {
  const dx = (bounds.minX + bounds.maxX) / 2 - gate.x
  const dz = (bounds.minZ + bounds.maxZ) / 2 - gate.z
  const length = Math.hypot(dx, dz) || 1
  const inX = dx / length
  const inZ = dz / length
  return { key, name, position: { x: gate.x + inX * DESTINATION_DOOR_GAP, y: EYE_HEIGHT, z: gate.z + inZ * DESTINATION_DOOR_GAP }, yaw: Math.atan2(-inX, -inZ) + 0 }
}

export function orchardDestination(tree: Vec3): TeleportDestination {
  return { key: 'orchard', name: 'Orchard', position: { x: tree.x, y: EYE_HEIGHT, z: tree.z + DESTINATION_DOOR_GAP }, yaw: 0 }
}

export function doorDestination(key: string, name: string, building: Vec3, door: Vec3): TeleportDestination {
  const dx = door.x - building.x
  const dz = door.z - building.z
  const length = Math.hypot(dx, dz) || 1
  const outX = dx / length
  const outZ = dz / length
  return {
    key,
    name,
    position: { x: door.x + outX * DESTINATION_DOOR_GAP, y: EYE_HEIGHT, z: door.z + outZ * DESTINATION_DOOR_GAP },
    yaw: Math.atan2(outX, outZ)
  }
}

function parseWorld(manifest: Json): World {
  if (!Array.isArray(manifest?.zones)) throw new Error('world manifest: missing zones')
  const workDoors: World['workDoors'] = new Map()
  const houses: World['houses'] = new Map()
  const destinations: TeleportDestination[] = [
    { key: 'spawn', name: 'Town square', position: parseVec3(manifest.spawn, 'spawn'), yaw: Number.isFinite(manifest.spawnYaw) ? manifest.spawnYaw : 0 }
  ]
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
      destinations.push(doorDestination(building.key, typeof building.name === 'string' ? building.name : building.key, parseVec3(building.position, `position of ${building.key}`), door))
    }
  }
  const b = manifest.bounds
  if (![b?.minX, b?.maxX, b?.minZ, b?.maxZ].every(Number.isFinite)) throw new Error('world manifest: invalid bounds')
  const pub = parsePub(manifest.pub)
  const orchard = parseOrchard(manifest.orchard)
  if (orchard) destinations.push(orchardDestination(orchard.trees[0]))
  const farm = manifest.zones.find((zone: Json) => zone.key === 'farm')
  if (farm?.gate !== undefined) {
    if (![farm.gate?.x, farm.gate?.z].every(Number.isFinite)) throw new Error(`world manifest: invalid farm gate ${JSON.stringify(farm.gate)}`)
    destinations.push(zoneGateDestination('farm', 'Farm', farm.gate, parseBounds(farm.bounds, 'farm zone bounds')))
  }
  return {
    citySpawn: parseVec3(manifest.spawn, 'spawn'),
    destinations,
    workDoors,
    houses,
    fountains,
    bounds: b,
    clinic: parseClinic(manifest.clinic),
    pub,
    pubZone: parsePubZone(manifest.zones, pub),
    orchard,
    cropPlants: parseCropPlants(manifest.crops),
    zoneBounds: new Map(manifest.zones.filter((zone: Json) => zone.bounds !== undefined).map((zone: Json) => [zone.key, parseBounds(zone.bounds, `${zone.key} zone bounds`)])),
    storage: parseStorage(manifest.storage)
  }
}

// An http(s) URL in dev (the front serves it), a file path in the production image. In dev the front container can
// still be starting or restarting when this one boots, so every world file is retried, not only the manifest.
async function readManifest(source: string): Promise<Json> {
  if (!/^https?:\/\//.test(source)) return JSON.parse(await readFile(source, 'utf8'))
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(source)
      if (!res.ok) throw new Error(`${source} answered ${res.status}`)
      return await res.json()
    } catch (error) {
      if (attempt >= FETCH_ATTEMPTS) throw error
      console.warn(`[world] ${source} fetch ${attempt}/${FETCH_ATTEMPTS} failed: ${error instanceof Error ? error.message : error}`)
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
}

export async function loadWorld(): Promise<void> {
  if (!WORLD_MANIFEST_URL) throw new Error('WORLD_MANIFEST_URL is not set')
  const loaded = parseWorld(await readManifest(WORLD_MANIFEST_URL))
  world = loaded
  console.log(`[world] manifest loaded from ${WORLD_MANIFEST_URL}: ${loaded.workDoors.size} public buildings, ${loaded.houses.size} houses`)
}

function besideManifest(path: string): string {
  const manifest = WORLD_MANIFEST_URL!
  return /^https?:\/\//.test(manifest) ? new URL(path, manifest).href : join(dirname(manifest), path)
}

function zoneBuyers(zone: string, decor: Json): WorldBuyer[] {
  if (!Array.isArray(decor?.areas) || !Array.isArray(decor?.props)) throw new Error(`zones/${zone}.json: missing props or areas`)
  return decor.areas.filter((area: Json) => area.role === 'buyer').map((area: Json) => {
    const npc = decor.props.find((p: Json) => p.kind === 'npc' && p.id === area.npc)
    if (!npc) throw new Error(`zones/${zone}.json: buyer ${area.id} has no NPC ${area.npc}`)
    const [x, y, z] = npc.position
    if (![x, y, z].every(Number.isFinite)) throw new Error(`zones/${zone}.json: invalid position of ${npc.id}`)
    return { zone, area: area.id, x, y, z }
  })
}

export async function loadZoneBuyers(): Promise<void> {
  if (!WORLD_MANIFEST_URL) throw new Error('WORLD_MANIFEST_URL is not set')
  const index = await readManifest(besideManifest('zones/index.json'))
  if (!Array.isArray(index?.zones)) throw new Error('zones/index.json: missing zones')
  let count = 0
  const shops = new Map<string, Bounds>()
  for (const zone of index.zones) {
    const decor = await readManifest(besideManifest(`zones/${zone}.json`))
    count += zoneBuyers(zone, decor).length
    if (decor.parent !== undefined) shops.set(zone, parseBounds(decor.bounds, `zones/${zone}.json bounds`))
  }
  buyerZones = new Set(index.zones)
  shopBounds = shops
  console.log(`[world] ${count} zone buyer(s), ${shops.size} shop zone(s) loaded`)
}

export async function loadAtms(): Promise<void> {
  if (!WORLD_MANIFEST_URL) throw new Error('WORLD_MANIFEST_URL is not set')
  const index = await readManifest(besideManifest('zones/index.json'))
  if (!Array.isArray(index?.zones)) throw new Error('zones/index.json: missing zones')
  const found: Vec3[] = []
  for (const zone of index.zones) {
    const decor = await readManifest(besideManifest(`zones/${zone}.json`))
    if (!Array.isArray(decor?.props)) throw new Error(`zones/${zone}.json: missing props`)
    for (const prop of decor.props.filter((p: Json) => p.key === 'atm')) {
      const [x, y, z] = prop.position
      if (![x, y, z].every(Number.isFinite)) throw new Error(`zones/${zone}.json: invalid position of ${prop.id}`)
      found.push({ x, y, z })
    }
  }
  atms = found
  console.log(`[world] ${found.length} ATM(s) loaded`)
}

export function worldAtms(): readonly Vec3[] {
  return atms
}

export async function worldBuyer(zone: string, area: string): Promise<WorldBuyer | null> {
  if (!buyerZones.has(zone)) return null
  return zoneBuyers(zone, await readManifest(besideManifest(`zones/${zone}.json`))).find((b) => b.area === area) ?? null
}

function loadedWorld(): World {
  if (!world) throw new Error('world manifest not loaded')
  return world
}

export function citySpawn(): Vec3 {
  return loadedWorld().citySpawn
}

export function teleportDestinations(): TeleportDestination[] {
  return loadedWorld().destinations
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

export function worldStorage(): WorldStorage | null {
  return loadedWorld().storage
}

export function worldPub(): WorldPub | null {
  return loadedWorld().pub
}

export function worldPubZone(): Bounds | null {
  return loadedWorld().pubZone
}

export function worldOrchard(): WorldOrchard | null {
  return loadedWorld().orchard
}

export function worldCropPlants(): WorldCropPlant[] {
  return loadedWorld().cropPlants
}

export function worldZoneKeysAt(x: number, z: number): string[] {
  const inside = ([, b]: [string, Bounds]) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
  return [...loadedWorld().zoneBounds, ...shopBounds].filter(inside).map(([key]) => key)
}

export function worldZoneBounds(key: string): Bounds | null {
  return loadedWorld().zoneBounds.get(key) ?? shopBounds.get(key) ?? null
}
