import * as THREE from 'three'
import {
  APARTMENT_DOOR_POS,
  APARTMENT_HALF_EXTENT,
  APARTMENT_ROOM_HEIGHT,
  APARTMENT_WALL_THICKNESS,
} from './gameRoomConstants'
import { DEFAULT_HOUSE, HOUSES, TOWN, WORK_DISTRICT, findHouse, findWork } from './assets/catalog'
import type { TownLayout } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'
import { getGraphicsQuality } from './graphicsQuality'
import {
  addApartmentFallbackLights,
  configureRoomMeshShadows,
  normalizeRoomMaterials,
  sanitizeGltfLights,
} from './sceneLighting'

const CITY_SKY_COLOR = 0x9fc3e8

function addTownLighting(group: THREE.Group): void {
  if (getGraphicsQuality() === 'low') {
    group.add(new THREE.HemisphereLight(0xe8e4df, 0x8a8278, 0.3))
    return
  }
  group.add(new THREE.HemisphereLight(0xcfe5ff, 0x8a7f70, 0.35))
}

// ---------------------------------------------------------------- town (/game city)

export interface TownEnvironmentBuildResult {
  group: THREE.Group
  layout: TownLayout
}

let cachedTown: TownEnvironmentBuildResult | null = null
let townLoadPromise: Promise<TownEnvironmentBuildResult> | null = null

async function fetchTownLayout(): Promise<TownLayout> {
  const res = await fetch(TOWN.layoutUrl)
  if (!res.ok) throw new Error(`Could not load the town layout (${res.status})`)
  return (await res.json()) as TownLayout
}

/**
 * Loads the town once: town.glb (plaza, town hall, roads, props) plus every house exterior placed from
 * town.layout.json. Collision comes separately from TOWN.collisionUrl. The group is cached, never disposed.
 */
export function loadTownEnvironment(): Promise<TownEnvironmentBuildResult> {
  if (cachedTown) return Promise.resolve(cachedTown)
  if (!townLoadPromise) {
    townLoadPromise = (async () => {
      const loader = createGltfLoader()
      const [townGltf, layout] = await Promise.all([loader.loadAsync(TOWN.modelUrl), fetchTownLayout()])
      const root = townGltf.scene
      root.name = 'CampusTown'
      // A missing house should not take the whole town down.
      const houses = await Promise.all(layout.houses.map(async (lot) => {
        const house = findHouse(lot.key)
        if (!house) return null
        try {
          const gltf = await loader.loadAsync(house.exteriorUrl)
          const exterior = gltf.scene
          exterior.name = `HouseExterior_${lot.key}`
          exterior.position.fromArray(lot.position)
          exterior.rotation.y = lot.rotationY
          exterior.userData.houseKey = lot.key
          return exterior
        } catch (error) {
          console.warn('[town] house exterior failed to load', lot.key, error)
          return null
        }
      }))
      for (const exterior of houses) {
        if (exterior) root.add(exterior)
      }
      // Business district: scenery + one exterior per work building. A failure here must not break the town.
      const workScenery = await loader.loadAsync(WORK_DISTRICT.modelUrl).then((g) => g.scene).catch((error) => {
        console.warn('[town] district scenery failed to load', error)
        return null
      })
      if (workScenery) {
        workScenery.name = 'WorkDistrict'
        root.add(workScenery)
      }
      const works = await Promise.all((layout.work ?? []).map(async (lot) => {
        const asset = findWork(lot.key)
        if (!asset) return null
        try {
          const gltf = await loader.loadAsync(asset.exteriorUrl)
          const exterior = gltf.scene
          exterior.name = `WorkExterior_${lot.key}`
          exterior.position.fromArray(lot.position)
          exterior.rotation.y = lot.rotationY
          exterior.userData.workKey = lot.key
          return exterior
        } catch (error) {
          console.warn('[town] work exterior failed to load', lot.key, error)
          return null
        }
      }))
      for (const exterior of works) {
        if (exterior) root.add(exterior)
      }
      sanitizeGltfLights(root)
      configureRoomMeshShadows(root)
      normalizeRoomMaterials(root, 'city')
      addTownLighting(root)
      root.userData.isRoomEnvironment = true
      root.userData.isPersistentEnvironment = true
      cachedTown = { group: root, layout }
      return cachedTown
    })().catch((error) => {
      townLoadPromise = null
      throw error
    })
  }
  return townLoadPromise
}

export function applySceneAtmosphere(
  scene: THREE.Scene,
  kind: 'city' | 'apartment',
  renderer?: THREE.WebGLRenderer,
): void {
  if (kind === 'city') {
    scene.background = new THREE.Color(CITY_SKY_COLOR)
    const fogFar = getGraphicsQuality() === 'low' ? 120 : 250
    scene.fog = new THREE.Fog(CITY_SKY_COLOR, 30, fogFar)
    if (renderer) {
      renderer.toneMappingExposure = 1.05
    }
  } else {
    scene.background = new THREE.Color(0x1a1816)
    scene.fog = new THREE.Fog(0x1a1816, 28, 95)
    if (renderer) {
      renderer.toneMappingExposure = 1.1
    }
  }
}

/** Remove any previous town / house roots left on the scene (HMR / route leftovers). */
export function stripRoomEnvironmentsFromScene(scene: THREE.Scene): void {
  const toRemove: THREE.Object3D[] = []
  for (const child of scene.children) {
    if (child.userData?.isRoomEnvironment === true || child.userData?.isPersistentEnvironment === true) {
      toRemove.push(child)
    }
  }
  for (const obj of toRemove) {
    scene.remove(obj)
    if (!obj.userData?.isPersistentEnvironment) {
      obj.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry?.dispose()
          const mat = node.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose()
        }
      })
    }
  }
}

// ---------------------------------------------------------------- house interiors

/** What the interior loaders need from a house or work building. */
interface InteriorAsset {
  key: string
  interiorCollisionUrl: string
}

/** Result from apartment environment builders for scene + placement raycast/collider registration. */
export interface ApartmentEnvironmentBuildResult {
  group: THREE.Group
  /** House or work building whose interior this is (assets/houses/<key>/ or assets/work/<key>/). */
  house: InteriorAsset
}

function addApartmentLighting(group: THREE.Group): void {
  if (getGraphicsQuality() === 'low') {
    group.add(new THREE.HemisphereLight(0xf0ebe4, 0x6b5344, 0.22))
    return
  }
  group.add(new THREE.HemisphereLight(0xfff5e6, 0x6b5344, 0.25))
}

function tagApartmentFloor(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (/House_Floor/i.test(obj.name)) {
      obj.userData.apartmentEnvPart = 'floor'
    }
  })
}

function addApartmentExitDoor(group: THREE.Group): void {
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  door.position.set(APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z)
  door.userData.isApartmentDoor = true
  group.add(door)
}

function prepareApartmentGroup(
  root: THREE.Group,
  house: InteriorAsset,
  name = `HouseInterior_${house.key}`,
): ApartmentEnvironmentBuildResult {
  const hasGltfLights = sanitizeGltfLights(root)
  configureRoomMeshShadows(root)
  normalizeRoomMaterials(root, 'apartment')
  tagApartmentFloor(root)
  addApartmentExitDoor(root)
  addApartmentLighting(root)
  if (!hasGltfLights) {
    addApartmentFallbackLights(root)
  }
  root.name = name
  root.userData.isRoomEnvironment = true
  root.userData.isPersistentEnvironment = true
  return { group: root, house }
}

const interiorCache = new Map<string, Promise<ApartmentEnvironmentBuildResult>>()

/**
 * Loads a house interior (assets/houses/<key>/interior.glb) once per house; later calls reuse the
 * cached group. Unknown / missing keys fall back to DEFAULT_HOUSE. Collision: `house.interiorCollisionUrl`.
 */
export function loadApartmentEnvironment(houseKey?: string | null): Promise<ApartmentEnvironmentBuildResult> {
  const house = findHouse(houseKey) ?? DEFAULT_HOUSE
  const cached = interiorCache.get(house.key)
  if (cached) return cached
  const task = createGltfLoader()
    .loadAsync(house.interiorUrl)
    .then((gltf) => prepareApartmentGroup(gltf.scene, house))
  task.catch(() => interiorCache.delete(house.key))
  interiorCache.set(house.key, task)
  return task
}

/**
 * Loads a business-district interior (assets/work/<key>/interior.glb). Same entrance contract as the
 * houses (door at z = +5, spawn APARTMENT_SPAWN), so the exit door trigger is shared.
 */
export function loadWorkEnvironment(workKey: string): Promise<ApartmentEnvironmentBuildResult> {
  const work = findWork(workKey)
  if (!work) return Promise.reject(new Error(`Unknown work building: ${workKey}`))
  const cacheKey = `work:${work.key}`
  const cached = interiorCache.get(cacheKey)
  if (cached) return cached
  const task = createGltfLoader()
    .loadAsync(work.interiorUrl)
    .then((gltf) =>
      prepareApartmentGroup(
        gltf.scene,
        { key: work.key, interiorCollisionUrl: work.interiorCollisionUrl },
        `WorkInterior_${work.key}`,
      ),
    )
  task.catch(() => interiorCache.delete(cacheKey))
  interiorCache.set(cacheKey, task)
  return task
}

/** Every house key that has assets (for preloading / tooling). */
export const HOUSE_KEYS = HOUSES.map((h) => h.key)

/** Procedural fallback when the GLB is unavailable (unused after `loadApartmentEnvironment` wiring). */
export function buildApartmentEnvironment(): Omit<ApartmentEnvironmentBuildResult, 'house'> {
  const g = new THREE.Group()
  g.userData.isRoomEnvironment = true
  const w = APARTMENT_HALF_EXTENT * 2
  const h = APARTMENT_ROOM_HEIGHT
  const t = APARTMENT_WALL_THICKNESS
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5344 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4b8a8 })
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x9a8f82 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), floorMat)
  floor.position.y = -t / 2
  floor.receiveShadow = true
  floor.userData.apartmentEnvPart = 'floor'
  g.add(floor)
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), ceilMat)
  ceiling.position.y = h + t / 2
  g.add(ceiling)
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), wallMat)
  wallN.position.set(0, h / 2, -APARTMENT_HALF_EXTENT)
  const wallS = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), wallMat)
  wallS.position.set(0, h / 2, APARTMENT_HALF_EXTENT)
  const wallW = new THREE.Mesh(new THREE.BoxGeometry(t, h, w), wallMat)
  wallW.position.set(-APARTMENT_HALF_EXTENT, h / 2, 0)
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(t, h, w), wallMat)
  wallE.position.set(APARTMENT_HALF_EXTENT, h / 2, 0)
  for (const m of [wallN, wallS, wallW, wallE]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x3a2f2a }),
  )
  door.position.set(APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z)
  door.userData.isApartmentDoor = true
  g.add(door)
  return { group: g }
}
